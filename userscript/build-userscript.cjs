// 组装油猴脚本。引擎一行不改：直接吃掉 extension/ 里已经验证过的 bundle，引擎与 core 的相对顺序
// 也保持和扩展 <script> 标签一致（ResumeCore -> ResumeSchema -> scoring -> engine -> create()）。
// 顺序错了 schema.js 在 ResumeCore 之前解构会直接抛错，所以这里的数组是有约束的，不是随便排的。
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;

const metadata = () => `// ==UserScript==
// @name         简历轻填 · 开源版
// @name:zh-CN   简历轻填 · 开源版
// @namespace    resume-light-fill-public
// @version      ${version}
// @description  字段级一键写入助手：历史答案优先复用，结构化资料与AI知识库共同提供依据；AI只在主动生成时工作，写入当前字段后逐字段读回验证，绝不自动提交。
// @author       resume-light-fill
// @run-at       document-start
// @license      MIT
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      *
// ==/UserScript==
`;

// 引擎相关部分。顺序即依赖，不要重排。
const ENGINE_PARTS = [
  ['core.js', 'extension/core.js'],
  ['core/profile/schema.js', 'extension/core/profile/schema.js'],
  ['core/matcher/scoring.js', 'extension/core/matcher/scoring.js'],
  ['default-profile.js', 'extension/default-profile.js'],
  ['core/profile/updates.js', 'extension/core/profile/updates.js'],
  ['engine.js', 'extension/engine.js'],
];

// 油猴自带的壳与新功能模块，依赖上面全部加载完成后才执行。
// 顺序有硬约束，不能随手重排：模块之间在 IIFE 顶层用 `const x = root.Y` 互相取用，
// 被引用的模块必须排在前面，否则捕获到 undefined，之后每次调用都会 TypeError。
// 每行后面的注释写了它依赖谁，改顺序前先看这里。
const USER_MODULES = [
  '05-field-library.js',   // 标准字段库（无依赖）
  '10-storage.js',         // 存储（无依赖）
  '35-logger.js',          // 日志（依赖 storage）——必须在 25-mapping 之前，它要抓 logger
  '15-profile-v2.js',      // 资料模型 v2（依赖 field-library + storage + default-profile）
  '20-presets.js',         // 三层预设（依赖 storage）
  '25-mapping.js',         // 字段映射学习（依赖 field-library + storage + logger + presets）
  '30-ai-client.js',       // AI 客户端（依赖 storage）
  '40-ai-context.js',      // 岗位上下文（依赖 ai + storage）——必须在 38-field-ai 之前
  '38-field-ai.js',        // AI 字段识别 / 映射修正 / 新字段建议（依赖 ai + mapping + v2 + context）
  '36-history.js',         // 填写历史 / AI 回答历史（依赖 storage）
  '37-answer-library.js',  // 字段级答案库 / 模糊匹配（依赖 storage + ai + field-ai）
  '60-attachments.js',     // 附件知识库（依赖 storage）——必须在 50-ai-panel 之前
  '55-profile-ai.js',      // 资料按问题切片（依赖 ai + storage）
  '44-support-assets.js',
  '45-support.js',
  '50-ai-panel.js',        // AI 气泡（依赖 ai + context + files + profile-ai）
  '65-document-import.js',
  '70-profile-editor.js',  // 资料管理页（依赖以上全部）
  '80-panel.js',           // 主浮层面板（依赖 editor + ai-ui + context + presets）
  '90-main.js',            // 启动引导（依赖 panel + context）
];

const banner = name => `\n/* ===================== userscript module: ${name} ===================== */\n`;

function readIfExists(file) {
  const full = path.join(__dirname, 'src', file);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

// ---------------------------------------------------------------- 依赖自检
// 模块之间靠 IIFE 顶层的 `const x = root.Y` 取用，而这个捕获只发生在加载那一刻。
// 排顺序时人很容易漏（尤其是重复列了同一个模块，会把 AI 客户端变成两个实例），
// 所以这里在构建时静态校验：捕获的东西必须已经定义，且不允许重复模块。
// 这个检查以前纯靠人记住，现在让它变成构建失败。
function checkModuleOrder() {
  // 引擎部分先加载，它们导出的名字天然在最前面
  const available = new Set([
    'ResumeCore', 'ResumeSchema', 'ResumeScoring', 'ResumeEngine', 'ResumeEngineVersion',
    'ResumePage', 'ResumeDefaultProfile', 'ResumeProfileUpdates', 'ResumeSiteRules',
  ]);
  const seen = new Set();
  const problems = [];

  for (const file of USER_MODULES) {
    if (seen.has(file)) problems.push(`${file} 在 USER_MODULES 里重复列了，会被执行两次（全局对象被覆盖成两个实例）`);
    seen.add(file);
    const body = readIfExists(file);
    if (body === null) continue;   // 未实现的模块下面会另外提示

    for (const m of body.matchAll(/^  const (\w+) = root\.(Resume\w+)/gm)) {
      if (!available.has(m[2])) {
        problems.push(`${file}: const ${m[1]} = root.${m[2]} —— 加载时 ${m[2]} 还不存在（它所在的模块排在了后面）`);
      }
    }
    for (const m of body.matchAll(/root\.(Resume\w+)\s*=\s*\{/g)) available.add(m[1]);
  }

  if (problems.length) {
    throw new Error('模块加载顺序有问题：\n  - ' + problems.join('\n  - '));
  }
}

const parts = [metadata()];
checkModuleOrder();
for (const [label, rel] of ENGINE_PARTS) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`缺少 ${rel}，请先运行 npm run build`);
  }
  parts.push(`\n/* ===================== engine part: ${label} ===================== */\n`, fs.readFileSync(full, 'utf8'));
}

// content.js 的等价物：油猴里引擎和壳在同一个文件，不需要跨文件注入，直接建实例。
parts.push(`
// Page bridge: engine lifecycle only. 同 content.js，版本不一致才重建，避免丢掉正在进行的流程状态。
if (globalThis.ResumePage?.version !== globalThis.ResumeEngineVersion) {
  globalThis.ResumePage = globalThis.ResumeEngine.create();
}
`);

const missing = [];
for (const m of USER_MODULES) {
  const body = readIfExists(m);
  if (body === null) { missing.push(m); continue; }
  parts.push(banner(m), body);
}

const outDir = path.join(__dirname, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, '简历轻填.user.js');
fs.writeFileSync(outFile, parts.join('\n'));

const size = fs.statSync(outFile).size;
console.log(`已生成 ${path.relative(root, outFile)}  ${(size / 1024).toFixed(1)} KB  版本 ${version}`);
if (missing.length) console.log(`尚未实现（跳过）：${missing.join(', ')}`);
