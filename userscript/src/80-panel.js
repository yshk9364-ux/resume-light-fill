// 主浮层面板。逻辑照搬扩展的 popup.js，只换掉三处：
//   1. 桥接：chrome.scripting.executeScript → 直接调 globalThis.ResumePage.xxx()
//   2. 存储：chrome.storage.local → ResumeStore
//   3. 界面：弹窗页 → 页面内 fixed 浮层（closed shadow DOM）
// 其余的字段选择、逐字段核对、报告格式、错误文案全部保持原样，
// 因为这些是准确率的一部分，不是界面问题。
(function (root) {
  'use strict';

  const store = root.ResumeStore;
  const core = root.ResumeCore;
  const schema = root.ResumeSchema;
  const editor = root.ResumeProfileEditor;
  const aiui = root.ResumeAIUI;
  const context = root.ResumeContext;
  const presets = root.ResumePresets;
  const logger = root.ResumeLogger;
  const history = root.ResumeHistory;
  const fieldAI = root.ResumeFieldAI;
  const mapping = root.ResumeMapping;

  let host = null, shadow = null, ui = {};
  let profiles = [], values = [], snapshot = null, busy = false, pageUrl = '';
  let lastRun = null, lastStatus = { text: '', error: false };
  let pageGroups = null, probeToken = 0;
  let launched = false;
  // §47 重试状态：失败字段最多自动重试 2 次，每次可换策略（规则 → AI → 人工）。
  // 记录已经用到第几次、当前处于哪一步，避免重复点按钮把同一字段反复填。
  let retry = null;   // { attempt, failedIds:[], done:{id:bool} }

  const $ = id => ui[id];
  const scopeTitles = { family: '亲属', education: '教育经历', work: '工作经历', projects: '项目经历', campus: '校园经历', awards: '奖项荣誉', certificates: '证书', professionalSkills: '专业技能', computerSkills: '计算机技能', languages: '语言能力' };

  const STYLE = `:host{color-scheme:light;all:initial}
*{box-sizing:border-box;font:14px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#172338}
.launch{display:none!important;position:fixed;right:16px;bottom:16px;z-index:2147483646;width:46px;height:46px;border-radius:50%;
  border:1px solid #b8452f;background:#b8452f;color:#fff;font-size:20px;cursor:pointer;box-shadow:0 4px 16px #15294444;
  display:flex;align-items:center;justify-content:center;padding:0}
.launch:hover{background:#a03d29}
.panel{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(400px,calc(100vw - 32px));
  max-height:min(86vh,760px);background:#fff;border:1px solid #e0b4aa;border-radius:8px;box-shadow:0 8px 35px #15294440;
  display:none;flex-direction:column;overflow:hidden}
.panel.open{display:flex}
.hd{display:flex;align-items:center;gap:8px;background:#fff0ed;padding:12px}
.hd strong{flex:1;font-size:15px}
button{font:inherit;cursor:pointer;border:1px solid #d9b6ad;border-radius:6px;background:#fff;color:#7a2f20;padding:6px 10px}
button:hover:not(:disabled){background:#fff4f1}
button:disabled{opacity:.45;cursor:default}
button.primary{background:#b8452f;border-color:#b8452f;color:#fff}
button.primary:hover:not(:disabled){background:#a03d29}
button.main-action{width:100%;padding:10px;font-size:15px;font-weight:600}
.bd{overflow:auto;padding:12px}
.step{margin-bottom:14px}
.step .title{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.step .num{width:20px;height:20px;border-radius:50%;background:#b8452f;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.step h2{font-size:13px;margin:0;flex:1;font-weight:600}
.text-button{border:none;background:none;color:#b8452f;padding:2px 4px;text-decoration:underline}
select,input{width:100%;font:inherit;padding:6px 8px;border:1px solid #c9b4af;border-radius:5px;background:#fff;color:#172338}
label.chk{display:flex;align-items:center;gap:6px;font-size:13px;color:#59677b;margin-top:8px;cursor:pointer}
label.chk input{width:auto}
.hint{font-size:12px;color:#59677b;margin:6px 0}
.status-card{background:#f7f5f3;border:1px solid #e5ded9;border-radius:6px;padding:9px 10px;font-size:13px;white-space:pre-wrap;margin-top:4px}
.status-card.error{border-color:#e0b0a8;background:#fdf3f1;color:#9c3927}
.row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.record-row{display:flex;gap:6px;margin-top:6px}
.record-row select{flex:1}
details{margin-top:10px;font-size:13px}
summary{cursor:pointer;color:#59677b;padding:4px 0}
.fields{margin-top:8px}
.field{border-top:1px solid #f0ecea;padding:9px 0}
.field-title{font-size:13px;margin:0 0 5px}
.field .value{font-size:12px;color:#59677b;margin:5px 0 0;overflow-wrap:anywhere}
.field .result{font-size:12px;margin:4px 0 0}
.field .result.ok{color:#17643a}
.field .result:not(.ok){color:#9c3927}
.batch-record-picker{margin:8px 0;padding:8px;background:#faf8f7;border-radius:6px;font-size:13px}
.compact-button{padding:4px 8px;font-size:12px}
.retry-bar{margin-top:10px;padding:9px 10px;background:#fdf6ec;border:1px solid #e8d3ae;border-radius:6px}
.retry-bar .hint{margin:0 0 6px}
.retry-bar button{margin-right:6px}
.ai-suggest{margin-top:10px;padding:9px 10px;background:#f5f8fd;border:1px solid #c9d8ec;border-radius:6px}
.ai-suggest summary{color:#2c4a72;font-weight:600}
.ai-suggest .field{padding:7px 0}
.ai-suggest .value{margin:2px 0 6px}
.diag{margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
pre{white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;background:#f7f5f3;padding:8px;border-radius:5px;margin:6px 0 0;max-height:200px;overflow:auto}
[hidden]{display:none!important}`;

  // ---------------------------------------------------------------- 生命周期
  function launch() {
    ensure();
    const firstLaunch = !launched;
    if (firstLaunch) { launched = true; boot(); }
    ui.panel.classList.toggle('open');
    ui.launch.hidden = ui.panel.classList.contains('open');
    if (ui.panel.classList.contains('open') && !firstLaunch) probePageGroups();
  }

  function ensure() {
    if (host) return host;
    host = document.createElement('div');
    host.setAttribute('data-resume-panel', '');
    host.style.cssText = 'all:initial!important;position:static!important;';
    shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style'); style.textContent = STYLE;
    const launchBtn = document.createElement('button');
    launchBtn.className = 'launch'; launchBtn.type = 'button'; launchBtn.textContent = '写';
    launchBtn.title = '简历一键写入助手';

    const panel = document.createElement('div'); panel.className = 'panel';
    const hd = document.createElement('div'); hd.className = 'hd';
    const title = document.createElement('strong'); title.textContent = '一键写入助手';
    const btnHelp = document.createElement('button'); btnHelp.className = 'text-button'; btnHelp.textContent = 'AI设置';
    const btnClose = document.createElement('button'); btnClose.className = 'text-button'; btnClose.textContent = '关闭';
    hd.append(title, btnHelp, btnClose);

    const bd = document.createElement('div'); bd.className = 'bd';
    // 与 popup.html 同名 id，render/事件逻辑才能原样复用
    bd.innerHTML = `
      <section class="step">
        <div class="title"><span class="num">1</span><h2>选择简历</h2><button id="manage" class="text-button">管理资料</button></div>
        <select id="profiles" aria-label="本次使用的简历"></select>
      </section>
      <section class="step"><div class="status-card">新版采用字段级写入：先点击网页里的目标输入框，再使用右下角“一键写入助手”浮窗，选择历史资料、AI生成或手动输入，然后写入当前字段。不会自动填写整张表单。</div></section>
      <section class="step" hidden>
        <div class="title"><span class="num">2</span><h2>选择填写范围</h2></div>
        <select id="scopeGroup"><option value="all">当前页面全部资料</option><option value="basics">个人信息</option></select>
        <div id="recordControls" class="record-controls"><div class="record-row"><select id="scopeRecord"></select><button id="nextRecord" class="compact-button">下一条</button></div></div>
        <p id="selectionHint" class="hint">填写当前页面可识别的全部资料。</p>
      </section>
      <section class="step" hidden>
        <div class="title"><span class="num">3</span><h2>开始智能填写</h2></div>
        <p class="hint">不会打开网页就自动填。点下面按钮才开始，流程：扫描页面 → 识别字段 → 分析岗位 → 匹配资料 → 自动填写 → 回显检查 → 结果报告。</p>
        <button id="smartFill" class="primary main-action">开始智能填写</button>
        <label class="chk"><input id="closeModal" type="checkbox" checked><span>成功后保存并关闭网站表单</span></label>
        <div id="retryBar" class="retry-bar" hidden>
          <span id="retryHint" class="hint"></span>
          <button id="retryRule" class="compact-button">重试 1/2：按规则重填</button>
          <button id="retryAI" class="compact-button">重试 2/2：AI 辅助识别</button>
          <button id="retryManual" class="compact-button">转人工处理</button>
        </div>
      </section>
      <section class="step" hidden>
        <div class="title"><span class="num">4</span><h2>分步操作</h2></div>
        <button id="quickFill" class="main-action">只填写当前表单（不重扫）</button>
      </section>
      <div id="status" class="status-card" role="status" aria-live="polite">打开网申页面后，先点目标输入框，再使用右下角「一键写入助手」。</div>
      <div class="diag"><button id="copyError" class="text-button">复制当前情况给 AI</button><span id="copyHint" class="hint" hidden></span></div>
      <button id="results" class="text-button" hidden>查看网页填写结果 →</button>
      <details id="moreActions" hidden>
        <summary>需要调整字段或使用更多操作？</summary>
        <p class="hint">填写不准确时，可先识别字段，再逐项调整对应资料。</p>
        <div class="row">
          <button id="scan">识别并核对字段</button>
          <button id="expand">自动新增缺少记录</button>
          <button id="undo">撤销填写</button>
        </div>
        <button id="applyRecord" class="text-button">重新识别当前条目</button>
        <label class="chk"><input type="checkbox" id="overwrite" checked><span>覆盖网页已有内容</span></label>
        <details id="reviewPanel"><summary>逐字段核对与调整</summary><div id="fields" class="fields"></div><button id="fill" class="primary" disabled>填写已匹配字段</button></details>
      </details>`;

    panel.append(hd, bd);
    shadow.append(style, launchBtn, panel);
    const mount = () => (document.body || document.documentElement).appendChild(host);
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });

    ui = {
      launch: launchBtn, panel, btnHelp, btnClose,
      profiles: bd.querySelector('#profiles'), scopeGroup: bd.querySelector('#scopeGroup'),
      scopeRecord: bd.querySelector('#scopeRecord'), recordControls: bd.querySelector('#recordControls'),
      selectionHint: bd.querySelector('#selectionHint'), quickFill: bd.querySelector('#quickFill'),
      closeModal: bd.querySelector('#closeModal'), status: bd.querySelector('#status'),
      copyError: bd.querySelector('#copyError'), copyHint: bd.querySelector('#copyHint'),
      results: bd.querySelector('#results'), moreActions: bd.querySelector('#moreActions'),
      scan: bd.querySelector('#scan'), expand: bd.querySelector('#expand'), undo: bd.querySelector('#undo'),
      applyRecord: bd.querySelector('#applyRecord'), overwrite: bd.querySelector('#overwrite'),
      reviewPanel: bd.querySelector('#reviewPanel'), fields: bd.querySelector('#fields'),
      smartFill: bd.querySelector('#smartFill'), retryBar: bd.querySelector('#retryBar'), retryHint: bd.querySelector('#retryHint'),
      retryRule: bd.querySelector('#retryRule'), retryAI: bd.querySelector('#retryAI'), retryManual: bd.querySelector('#retryManual'),
      fill: bd.querySelector('#fill'), manage: bd.querySelector('#manage'), nextRecord: bd.querySelector('#nextRecord'),
    };
    wire();
    return host;
  }

  function status(text, error = false) {
    ui.status.textContent = text;
    ui.status.classList.toggle('error', error);
    lastStatus = { text, error };
  }

  // ---------------------------------------------------------------- 桥接
  // 扩展里每次操作都要 executeScript 往返一次；油猴里同世界，直接调。
  async function page(method, args) {
    const P = root.ResumePage;
    if (!P || typeof P[method] !== 'function') throw new Error('页面填写脚本还没准备好，请刷新当前页面');
    const value = await P[method](args);
    if (value == null) throw new Error('页面填写流程未返回结果');
    return value;
  }

  // ---------------------------------------------------------------- 报告
  function reportRows() {
    return (lastRun?.reports || []).map(r => ({
      state: r.result === 'verified' ? '成功' : r.result === 'failed' ? '失败' : r.ok === false ? '失败' : r.skipped ? '跳过' : '成功',
      label: r.label || '(无标签)', canonical: r.canonical || r.key || '-', type: r.type || '-', control: r.control || r.adapter || '-',
      value: r.value ?? '', message: r.message || '',
    }));
  }

  function buildErrorReport() {
    const group = ui.scopeGroup.value;
    const record = ui.scopeRecord.value;
    const lines = ['# 简历轻填 错误信息', '版本: ' + (root.ResumeEngineVersion || '-'), '时间: ' + new Date().toLocaleString('zh-CN')];
    if (pageUrl) lines.push('页面: ' + pageUrl);
    lines.push('填写范围: ' + group + (group !== 'all' && record !== '' ? ' 第 ' + (Number(record) + 1) + ' 条' : ''));
    lines.push('状态: ' + (lastStatus.text || '(无)'));
    if (snapshot) lines.push('已识别字段: ' + snapshot.fields.length + '，其中未匹配: ' + snapshot.fields.filter(f => !f.fieldKey && !f.basicKey).length);
    if (!lastRun) return lines.join('\n');
    const rows = reportRows();
    const c = lastRun.counts || { success: rows.filter(r => r.state === '成功').length, skipped: rows.filter(r => r.state === '跳过').length, failed: rows.filter(r => r.state === '失败').length };
    lines.push('', '结果: 成功 ' + (c.success || 0) + '，跳过 ' + (c.skipped || 0) + '，失败 ' + (c.failed || 0));
    if (lastRun.error) lines.push('引擎报错: ' + lastRun.error);
    if (lastRun.completionMessage) lines.push('收尾提示: ' + lastRun.completionMessage);
    if (lastRun.site) lines.push('站点适配: ' + lastRun.site);
    const problems = rows.filter(r => r.state !== '成功');
    lines.push('', '--- 未成功明细（' + problems.length + ' 条）---');
    for (const r of problems) lines.push('[' + r.state + '] ' + r.label + ' | 控件=' + r.type + ' | 资料字段=' + r.canonical + ' | 写入值=' + (r.value || '-') + ' | 控件结构=' + r.control + ' | ' + r.message);
    if (lastRun.history) lines.push('', '--- 流程 ---\n' + lastRun.history.map(x => x.state).join(' → '));
    if (snapshot) {
      const missed = snapshot.fields.filter(f => !f.fieldKey && !f.basicKey).map(f => f.label + '(' + f.type + ')');
      lines.push('', '--- 识别到但没有可用资料的字段（' + missed.length + ' 个）---', missed.join('、'));
    }
    return lines.join('\n');
  }

  async function copyErrorInfo() {
    const text = buildErrorReport();
    // 保险：报告里绝不能出现 API key。key 只在 GM 存储里，理论上进不来，这里再挡一道。
    const key = ai_mask();
    const safe = key ? text.split(key).join('[API key]') : text;
    const hint = ui.copyHint;
    try {
      if (root.GM_setClipboard) root.GM_setClipboard(safe, 'text');
      else await navigator.clipboard.writeText(safe);
      hint.textContent = '已复制，可直接粘贴给 AI';
    } catch (e) {
      hint.textContent = '复制失败，请手动选中下方文本';
    }
    hint.hidden = false;
    ui.copyError.textContent = hint.textContent.startsWith('已复制') ? '✓ 已复制' : '复制失败';
    ui.copyError.setAttribute('aria-label', hint.textContent);
    clearTimeout(hint._t);
    hint._t = setTimeout(() => { hint.hidden = true; ui.copyError.textContent = '复制当前情况给 AI'; ui.copyError.removeAttribute('aria-label'); }, 7000);
  }

  function ai_mask() {
    try { return root.ResumeAI ? root.ResumeAI.config().apiKey : ''; } catch (e) { return ''; }
  }

  // ---------------------------------------------------------------- 交互
  function updateFill() {
    const count = Array.from(ui.fields.querySelectorAll('.field select')).filter(x => x.value).length;
    const hasProfile = profiles.some(p => p.id === ui.profiles.value);
    const rows = Array.from(ui.scopeRecord.options);
    const validSelection = ui.scopeGroup.value === 'all' || ui.scopeGroup.value === 'basics' || rows.length > 0;
    ui.fill.textContent = '填写已匹配字段' + (count ? ' ' + count + ' 项' : '');
    ui.fill.disabled = busy || !count;
    ui.quickFill.disabled = busy || !hasProfile || !validSelection;
    ui.nextRecord.disabled = busy || !rows.length || ui.scopeRecord.selectedIndex >= rows.length - 1;
    ui.applyRecord.disabled = busy || !hasProfile || !validSelection;
    for (const elx of ui.fields.querySelectorAll('.field select,.batch-record-picker select')) elx.disabled = busy;
  }

  async function action(fn) {
    if (busy) return;
    busy = true;
    aiui?.setSuspended(true);
    for (const id of ['quickFill', 'scan', 'expand', 'undo', 'profiles', 'fill', 'scopeGroup', 'scopeRecord', 'nextRecord', 'applyRecord', 'closeModal', 'overwrite']) if (ui[id]) ui[id].disabled = true;
    for (const id of ['smartFill', 'retryRule', 'retryAI', 'retryManual']) if (ui[id]) ui[id].disabled = true;
    updateFill();
    try { await fn(); } catch (e) { status('操作未完成：' + e.message, true); }
    finally {
      busy = false;
      aiui?.setSuspended(false);
      for (const id of ['quickFill', 'scan', 'expand', 'undo', 'profiles', 'fill', 'scopeGroup', 'scopeRecord', 'nextRecord', 'applyRecord', 'closeModal', 'overwrite']) if (ui[id]) ui[id].disabled = false;
      for (const id of ['smartFill']) if (ui[id]) ui[id].disabled = false;
      renderRetryBar();   // 重试按钮的可用性取决于还剩几次，交给它自己算
      updateFill();
    }
  }

  function currentSelection() {
    const group = ui.scopeGroup.value;
    return group === 'all' ? null : group === 'basics' ? { group } : { group, index: Number(ui.scopeRecord.value) };
  }

  function selectedValues() {
    const profile = profiles.find(x => x.id === ui.profiles.value);
    const selection = currentSelection();
    values = profile ? core.entries(profile).filter(x => x.value.trim() && (!selection || x.group === selection.group && (selection.group === 'basics' || x.index === selection.index))) : [];
  }

  function fieldIdForKey(key) {
    const bits = String(key || '').split('.');
    const group = bits[0], field = bits.at(-1);
    const v2 = root.ResumeProfileV2, lib = root.ResumeFieldLibrary;
    if (!v2 || !lib) return null;
    const category = group === 'work' ? 'employment' : group;
    const candidates = group === 'basics'
      ? lib.all().filter(def => ['personal', 'contact', 'job', 'misc'].includes(def.category) && v2.toEngineKey(def) === field)
      : lib.byCategory(category).filter(def => v2.toRecordEngineKey(def, group) === field);
    return candidates.length === 1 ? candidates[0].fieldId : null;
  }

  function confirmedKeyForField(field) {
    const rule = mapping?.resolve(field.label);
    if (!rule || !['learned', 'site-adapter'].includes(rule.source)) return null;
    const found = values.filter(v => v.value?.trim() && fieldIdForKey(v.key) === rule.fieldId);
    if (field.groupHint && found.some(v => v.group !== field.groupHint)) return null;
    if (Number.isInteger(field.recordIndex)) return found.find(v => v.index === field.recordIndex)?.key || null;
    return found.length === 1 ? found[0].key : null;
  }

  function recordCaption(group, row, index) {
    return (scopeTitles[group] || '记录') + ' ' + (index + 1) + ' · ' + ([row.relation, row.name || row.company || row.school || row.category || row.language || row.organization].filter(Boolean).join(' · ') || '未命名');
  }

  function render() {
    ui.fields.replaceChildren();
    if (!snapshot) { updateFill(); return; }
    renderBatchPickers();
    for (const field of snapshot.fields) {
      const row = document.createElement('div'); row.className = 'field'; row.dataset.id = field.id;
      const title = document.createElement('p'); title.className = 'field-title';
      title.textContent = (field.context ? field.context + ' · ' : '') + field.label + (field.required ? ' · 必填' : '');
      const select = document.createElement('select');
      select.setAttribute('aria-label', field.label + ' 对应的简历资料');
      select.append(new Option('跳过此字段 / 选择对应资料', ''));
      const confirmedKey = confirmedKeyForField(field);
      const related = schema.related(field, values);
      if (confirmedKey && !related.some(v => v.key === confirmedKey)) {
        const confirmed = values.find(v => v.key === confirmedKey);
        if (confirmed) related.unshift(confirmed);
      }
      for (const value of related) {
        const option = new Option(value.label + '：' + (value.value.length > 48 ? value.value.slice(0, 48) + '…' : value.value), value.key);
        option.title = value.value;
        select.append(option);
      }
      select.value = confirmedKey || core.match(field, related) || '';
      if (field.custom) title.textContent += ' · 自定义选择控件（实验支持）';
      const preview = document.createElement('p'); preview.className = 'value';
      const result = document.createElement('p'); result.className = 'result';
      const refresh = () => {
        const chosen = values.find(x => x.key === select.value);
        preview.textContent = chosen ? chosen.value : (!related.length ? '当前条目没有该字段的相关资料，已跳过' : field.value ? '网页已有：' + field.value : '未选择资料，不会填写');
        updateFill();
      };
      select.addEventListener('change', () => {
        const fieldId = fieldIdForKey(select.value);
        if (fieldId) mapping.learn(mapping.siteKey(), field.label, fieldId);
        refresh();
      });
      row.append(title, select, preview, result);
      ui.fields.append(row);
      refresh();
    }
    updateFill();
  }

  function renderBatchPickers() {
    if (currentSelection()) return;
    const p = profiles.find(x => x.id === ui.profiles.value);
    for (const group of new Set(snapshot.fields.map(f => f.groupHint).filter(g => core.groups[g]))) {
      const rows = p?.[group] || [];
      if (!rows.length) continue;
      const bar = document.createElement('div'); bar.className = 'batch-record-picker'; bar.dataset.group = group;
      const label = document.createElement('label'); label.textContent = (scopeTitles[group] || '记录') + '：统一使用';
      const select = document.createElement('select');
      select.setAttribute('aria-label', (scopeTitles[group] || '记录') + '所有已识别字段统一使用的条目');
      select.append(new Option('选择一条，统一切换下方相关字段', ''));
      rows.forEach((r, i) => select.append(new Option(recordCaption(group, r, i), String(i))));
      select.addEventListener('change', () => { if (select.value === '') return; useRecord(group, Number(select.value)); });
      label.append(select);
      bar.append(label);
      ui.fields.append(bar);
    }
  }

  function renderScopeOptions() {
    const select = ui.scopeGroup, current = select.value || 'all';
    select.replaceChildren(new Option('当前页面全部资料', 'all'), new Option('个人信息', 'basics'));
    for (const [group, def] of Object.entries(core.groups)) {
      const title = scopeTitles[group] || def.title;
      const suffix = pageGroups ? (pageGroups.has(group) ? ' · 本页 ' + pageGroups.get(group) + ' 项' : ' · 本页没有这类字段') : '';
      select.append(new Option(title + suffix, group));
    }
    select.value = Array.from(select.options).some(o => o.value === current) ? current : 'all';
  }

  function populateRecords(index = 0) {
    const group = ui.scopeGroup.value;
    const p = profiles.find(x => x.id === ui.profiles.value);
    const rows = p?.[group] || [];
    ui.recordControls.hidden = group === 'all' || group === 'basics';
    ui.scopeRecord.replaceChildren();
    if (Array.isArray(rows)) rows.forEach((r, i) => ui.scopeRecord.append(new Option(recordCaption(group, r, i), String(i))));
    if (rows[index]) ui.scopeRecord.value = String(index);
    updateSelectionHint(); updateFill();
  }

  function updateSelectionHint() {
    const group = ui.scopeGroup.value;
    const p = profiles.find(x => x.id === ui.profiles.value);
    if (group === 'all') { ui.selectionHint.textContent = '填写当前页面可识别的全部资料。'; return; }
    if (group === 'basics') { ui.selectionHint.textContent = '只填写个人信息；经历、家庭情况等其它区块都不会动，需要时再单独选一次。'; return; }
    if (pageGroups && !pageGroups.has(group)) { ui.selectionHint.textContent = '当前页面没有识别到' + (scopeTitles[group] || '这类') + '字段，换一个范围，或用「当前页面全部资料」。'; return; }
    const index = Number(ui.scopeRecord.value);
    const row = p?.[group]?.[index];
    const total = pageGroups ? pageGroups.get(group) : null;
    ui.selectionHint.textContent = row
      ? '本次统一使用：' + recordCaption(group, row, index) + '。只填写本页属于' + (scopeTitles[group] || '该区块') + '的字段，其它区块不会动。' + (total ? '本页该区块共 ' + total + ' 个字段。' : '')
      : '此类资料尚无条目，请先到「管理资料」添加。';
  }

  function restoreScope() {
    const pref = (store.get('fillSelections') || {})[ui.profiles.value] || {};
    ui.scopeGroup.value = pref.group || 'all';
    if (!ui.scopeGroup.value) ui.scopeGroup.value = 'all';
    populateRecords(pref.index || 0);
    ui.closeModal.checked = pref.closeModal !== false;
  }

  async function rememberScope() {
    const prefs = Object.assign({}, store.get('fillSelections') || {});
    prefs[ui.profiles.value] = Object.assign({}, currentSelection() || { group: 'all' }, { closeModal: ui.closeModal.checked });
    store.set('fillSelections', prefs);
  }

  async function probePageGroups() {
    const token = ++probeToken;
    const profile = profiles.find(x => x.id === ui.profiles.value);
    if (!profile) return;
    let counts = null;
    try {
      const scanned = await page('scanSelected', { profile, selection: null });
      counts = new Map();
      for (const field of scanned.fields) {
        const key = core.groups[field.groupHint] ? field.groupHint : null;
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
      }
    } catch (e) { counts = null; }
    if (token !== probeToken || !host) return;
    pageGroups = counts;
    renderScopeOptions(); updateSelectionHint();
  }

  async function scanCurrent() {
    selectedValues();
    const profile = profiles.find(x => x.id === ui.profiles.value);
    if (!profile) throw new Error('请先创建并选择简历资料');
    try { snapshot = await page('scanSelected', { profile, selection: currentSelection() }); }
    catch (e) { snapshot = null; render(); throw e; }
    render();
    if (root.ResumeAIUI) root.ResumeAIUI.annotate();
    return snapshot;
  }

  async function fillMatchedFromSnapshot() {
    if (!snapshot) await scanCurrent();
    const items = Array.from(ui.fields.querySelectorAll('.field')).flatMap(row => {
      const key = row.querySelector('select').value;
      const field = snapshot.fields.find(f => f.id === row.dataset.id);
      return key && field ? [{ field, key }] : [];
    });
    const result = await page('fillReviewed', {
      profile: profiles.find(x => x.id === ui.profiles.value),
      selection: currentSelection(), items, overwrite: ui.overwrite.checked,
    });
    if (!Array.isArray(result?.reports)) throw new Error('填写结果异常，请重新识别');
    for (const report of result.reports) {
      const row = Array.from(ui.fields.querySelectorAll('.field')).find(x => x.dataset.id === report.id);
      if (!row) continue;
      row.querySelector('.result').textContent = report.message;
      row.querySelector('.result').classList.toggle('ok', report.ok);
    }
    if (root.ResumeAIUI) root.ResumeAIUI.annotate();
    return result;
  }

  async function fillCurrent() {
    status('正在按本次已选字段填写，并检查日期是否保留…');
    const result = await fillMatchedFromSnapshot();
    lastRun = result;
    if (!result.reports.length) {
      status(snapshot?.fields.length ? '本次没有已选字段，已在网页结果浮窗列出可手动补填项。' : '当前未找到可填写字段。请在网站打开新增／编辑表单，再点「识别并核对字段」。');
      return;
    }
    let closeMessage = '';
    if (currentSelection() && ui.closeModal.checked && result.reports.every(r => r.ok)) {
      const closed = await page('finishSelected', {
        profile: profiles.find(x => x.id === ui.profiles.value), selection: currentSelection(),
        reviewedKeys: result.reports.map(r => r.key),
      });
      closeMessage = '\n' + closed.message;
      if (closed.closed) { snapshot = null; render(); }
    }
    const ok = result.reports.filter(x => x.ok).length;
    const details = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = '本次填写报告';
    details.append(summary);
    for (const r of result.reports) {
      const line = document.createElement('p');
      line.textContent = (r.ok ? '✓ ' : '✗ ') + r.label + ' · ' + r.canonical + '：' + r.message;
      details.append(line);
    }
    ui.fields.querySelector('details')?.remove();
    ui.fields.prepend(details);
    // 投递报告：把这次的公司/岗位存成公司预设，下次同一家公司直接命中
    rememberCompany();
    status('已填写：成功 ' + ok + ' 项，需检查 ' + (result.reports.length - ok) + ' 项。' + closeMessage + '\n请核对后自行提交，插件不会替你点提交。');
  }

  // ---------------------------------------------------------------- §47 重试机制
  // 失败字段最多重试 2 次，每次可以换策略：
  //   1/2 规则重填（重新扫一次页面，菜单展开/懒加载/时序问题大多在这一步自愈）
  //   2/2 AI 辅助识别（规则链定不了时，让 AI 重新判字段语义；AI 只给建议，映射要用户确认）
  //   然后转人工：把失败项、目标值、当前值、原因整理好，并给出「保存新规则」入口。
  const MAX_RETRY = 2;

  function renderRetryBar() {
    if (!ui.retryBar) return;
    const pending = (retry?.failedIds || []).filter(id => !retry.done[id]);
    if (!pending.length || !lastRun) { ui.retryBar.hidden = true; return; }
    ui.retryBar.hidden = false;
    const left = MAX_RETRY - (retry.attempt || 0);
    ui.retryHint.textContent = left > 0
      ? '还有 ' + pending.length + ' 项没填上，还可重试 ' + left + ' 次。换策略通常能解决下拉/日期这类不稳定控件。'
      : '还有 ' + pending.length + ' 项没填上，已用完 2 次重试。请转人工处理，或点「复制当前情况给 AI」发给我。';
    ui.retryRule.disabled = busy || left <= 0;
    ui.retryAI.disabled = busy || left <= 0;
    ui.retryManual.disabled = busy;
  }

  // 只对还没成功的字段重试，已成功的不碰（避免重复填写把用户手改的内容覆盖掉）。
  function retryItems() {
    const pendingIds = new Set((retry?.failedIds || []).filter(id => !retry.done[id]));
    if (!snapshot || !pendingIds.size) return [];
    const rows = Array.from(ui.fields.querySelectorAll('.field'));
    const out = [];
    for (const row of rows) {
      if (!pendingIds.has(row.dataset.id)) continue;
      const key = row.querySelector('select')?.value;
      const field = snapshot.fields.find(f => f.id === row.dataset.id);
      if (key && field) out.push({ field, key });
    }
    return out;
  }

  // 策略一：规则重填。重新扫一次页面再对失败项重试一遍。
  // 大部分「没找到菜单/选项」「日期没确认」都是页面时序问题，重扫一次就能好。
  async function retryByRule() {
    if (!retry || retry.attempt >= MAX_RETRY) return;
    retry.attempt++;
    status('重试 ' + retry.attempt + '/' + MAX_RETRY + '（规则重填）：正在重新扫描页面…');
    logger.info('开始规则重试', { attempt: retry.attempt });
    const profile = profiles.find(x => x.id === ui.profiles.value);
    // 重扫：页面可能已经重绘过，旧 field id 失效
    snapshot = await page('scanSelected', { profile, selection: currentSelection() });
    render();
    await runRetry('规则重填');
  }

  // 策略二：AI 辅助识别。规则链定不了的字段才问 AI（§50），并且 AI 的映射建议要用户确认才学进库。
  async function retryByAI() {
    if (!retry || retry.attempt >= MAX_RETRY) return;
    if (!fieldAI || !fieldAI.shouldAskAI) { status('AI 模块未就绪，请用规则重试或转人工。', true); return; }
    const items = retryItems();
    if (!items.length) { status('没有可重试的字段（请先在「逐字段核对与调整」里选好对应资料）。', true); return; }
    if (!root.ResumeAI?.isConfigured()) {
      status('还没配置 AI 接口，无法用 AI 重试。请到「AI设置」填 API Key，或改用规则重试。', true);
      return;
    }
    retry.attempt++;
    status('重试 ' + retry.attempt + '/' + MAX_RETRY + '（AI 辅助识别）：正在请 AI 重新判断字段含义…');
    logger.info('开始 AI 重试', { attempt: retry.attempt, fields: items.length });
    // 构造成 identifyFields 需要的形状：网页字段 + 插件当前猜测
    const probes = items.map(({ field }) => ({
      label: field.label,
      context: field.context || '',
      type: field.type || '',
      currentFieldId: mapping?.normLabel ? (mapping.resolve(field.label)?.fieldId || null) : null,
    }));
    const suggestions = await fieldAI.identifyFields(probes);
    if (!suggestions.length) { status('AI 没有给出可用建议，请转人工处理。', true); renderRetryBar(); return; }
    showAISuggestions(suggestions);
  }

  // 跑一轮重试并汇总结果。strategy 只是写进日志/报告，方便回头看出哪招管用。
  async function runRetry(strategy) {
    const items = retryItems();
    if (!items.length) { status('没有可重试的字段。', true); renderRetryBar(); return; }
    const result = await page('fillReviewed', {
      profile: profiles.find(x => x.id === ui.profiles.value),
      selection: currentSelection(), items, overwrite: ui.overwrite.checked,
    });
    for (const report of result?.reports || []) {
      if (report.ok) retry.done[report.id] = true;   // 成功了就不再重试
      const row = Array.from(ui.fields.querySelectorAll('.field')).find(x => x.dataset.id === report.id);
      if (!row) continue;
      const out = row.querySelector('.result');
      if (out) { out.textContent = report.message; out.classList.toggle('ok', !!report.ok); }
    }
    lastRun = mergeRetryResult(lastRun, result);
    recordHistory(result);
    const stillBad = (result.reports || []).filter(r => !r.ok).length;
    logger[stillBad ? 'warn' : 'success']('重试完成（' + strategy + '）', {
      attempt: retry.attempt, ok: (result.reports || []).length - stillBad, failed: stillBad });
    renderRetryBar();
    if (root.ResumeAIUI) root.ResumeAIUI.annotate();
    status(stillBad
      ? strategy + ' 重试后仍有 ' + stillBad + ' 项失败' + (retry.attempt >= MAX_RETRY ? '（已用完 2 次）' : '，还可再试') + '。'
      : strategy + ' 重试全部成功！', !stillBad);
  }

  // 把重试结果合回上一次报告，保留整体视图（不然重试后计数会只剩重试的那几项）。
  function mergeRetryResult(prev, next) {
    if (!prev?.reports) return next;
    const byId = new Map(prev.reports.map(r => [r.id, r]));
    for (const r of next?.reports || []) byId.set(r.id, r);
    const reports = Array.from(byId.values());
    return Object.assign({}, prev, {
      reports,
      counts: {
        success: reports.filter(r => r.ok).length,
        failed: reports.filter(r => !r.ok).length,
        skipped: reports.filter(r => r.skipped).length,
      },
    });
  }

  // AI 建议只展示不自动采用（§21/§22/§24）：用户点【采用】才写进 learned 映射。
  function showAISuggestions(suggestions, fromRetry = true) {
    ui.fields.querySelector('.ai-suggest')?.remove();
    const box = document.createElement('details');
    box.className = 'ai-suggest';
    box.open = true;
    const s = document.createElement('summary');
    s.textContent = 'AI 建议的字段映射（需你确认才会生效）';
    box.append(s);
    for (const sug of suggestions) {
      const row = document.createElement('div');
      row.className = 'field';
      const title = document.createElement('p');
      title.className = 'field-title';
      const pct = Math.round((sug.confidence || 0) * 100);
      title.textContent = sug.label + ' → ' + (sug.fieldId || '（无对应字段）')
        + (sug.currentFieldId ? '（当前映射：' + sug.currentFieldId + '）' : '') + ' · 置信度 ' + pct + '%';
      const why = document.createElement('p');
      why.className = 'value';
      why.textContent = sug.reason || '';
      const acts = document.createElement('div');
      acts.className = 'row';
      if (sug.fieldId) {
        const use = document.createElement('button');
        use.className = 'compact-button primary';
        use.textContent = '采用建议';
        use.onclick = () => {
          // 用户确认后才学进 learned（§23），以后同网站优先用这条
          mapping.learn(mapping.siteKey(), sug.label, sug.fieldId, { source: 'ai-accepted', confidence: sug.confidence || 0.8 });
          use.disabled = true;
          use.textContent = '已采用 ✓';
          status('已记住映射：' + sug.label + ' → ' + sug.fieldId + '。下次这个网站会优先用它。建议重新识别一次字段再看结果。');
        };
        acts.append(use);
      }
      if (sug.needNewField && sug.newField) {
        // §20：建议新增字段，但不自动永久保存，先问用户
        const addBtn = document.createElement('button');
        addBtn.className = 'compact-button';
        addBtn.textContent = '确认新增资料字段：' + (sug.newField.name || sug.newField.fieldId);
        addBtn.onclick = () => {
          const v2 = root.ResumeProfileV2;
          const proposed = v2?.proposeNewField?.(sug.newField);
          const confirmed = proposed?.proposed && v2.confirmCustomField(v2.activeProfile(), sug.newField.fieldId);
          addBtn.textContent = confirmed ? '已新增到资料库 ✓' : '新增失败（无效或已存在）';
          addBtn.disabled = true;
        };
        acts.append(addBtn);
      }
      const keep = document.createElement('button');
      keep.className = 'compact-button';
      keep.textContent = '保持原映射';
      keep.onclick = () => { keep.disabled = true; keep.textContent = '已保持 ✓'; };
      acts.append(keep);
      row.append(title, why, acts);
      box.append(row);
    }
    ui.fields.prepend(box);
    status('AI 给出了 ' + suggestions.length + ' 条映射建议。确认采用后，请重新识别并核对字段，再点击填写。'
      + (fromRetry ? ' 已填写的正确字段不会被自动重填。' : ' 已填写的固定资料保持原样。'));
  }

  // 转人工：把失败项整理好，一键复制，并展开网页结果浮窗供逐个手动补填。
  async function retryToManual() {
    const pending = (retry?.failedIds || []).filter(id => !retry.done[id]);
    logger.info('转人工处理', { count: pending.length });
    ui.reviewPanel.open = true;
    try {
      const shown = await page('showResults');
      if (!shown) status('网页结果浮窗没能打开，请直接手动填写。', true);
    } catch (e) { logger.warn('打开网页结果浮窗失败', e.message); }
    await copyErrorInfo();
    status('已列出 ' + pending.length + ' 项待人工处理，并复制了详细情况。\\n'
      + '在「逐字段核对与调整」里可以改对应资料；确认后把正确的对应关系告诉我，或点「复制当前情况给 AI」发去修规则。'
      + '\\n插件不会自动提交，请自行核对后提交。');
  }

  // ---------------------------------------------------------------- §29 开始智能填写
  // 完整流程：扫描页面 → 识别字段 → 分析岗位 → 匹配资料 → 自动填写 → 回显检查 → 结果报告。
  // 每一步都写日志（§60），失败就停下并如实报告是哪一步断的，不猜。
  async function smartFill() {
    const profile = profiles.find(x => x.id === ui.profiles.value);
    if (!profile) { status('请先创建并选择简历资料（点「管理资料」）。', true); return; }
    logger.info('开始智能填写', { url: location.href });
    retry = { attempt: 0, failedIds: [], done: {} };
    renderRetryBar();

    // 1) 扫描页面 + 识别字段
    status('1/6 正在扫描页面并识别字段…');
    try {
      await scanCurrent();
    } catch (e) {
      logger.error('扫描页面失败', e.message);
      status('扫描页面失败：' + e.message, true);
      return;
    }
    if (!snapshot || !snapshot.fields.length) {
      status('这个页面里没有找到可填写的字段。请先在网站上打开新增/编辑表单，再点一次。', true);
      logger.warn('智能填写中止：页面没有可填写字段');
      return;
    }
    logger.info('识别到字段', { count: snapshot.fields.length });

    // 2) 分析岗位（§41）。识别失败不阻断填写，岗位信息只影响 AI 开放题。
    status('2/6 正在分析当前岗位…');
    try {
      context.detect();
      const ctx = context.read().fields;
      logger.info('岗位上下文', {
        company: ctx.company?.value || '', role: ctx.role?.value || '', location: ctx.location?.value || '',
      });
    } catch (e) { logger.warn('岗位识别失败（不阻断填写）', e.message); }

    // 3~5) 匹配资料 → 自动填写 → 回显检查（在引擎里逐字段读回校验）
    status('3/6 正在匹配资料并填写，填完会逐个读回核对…');
    const result = await fillMatchedFromSnapshot();
    lastRun = result;
    rememberCompany();
    recordHistory(result);

    // 6) 结果报告 + 失败项入重试队列（§44/§45/§47）
    const failed = (result.reports || []).filter(r => !r.ok);
    retry = { attempt: 0, failedIds: failed.map(r => r.id), done: {} };
    renderRetryBar();
    await renderReport(result);
    // 固定资料先填；规则无法确定的字段在配置了 AI 时再请求语义建议。
    // 建议只显示在核对区，用户明确采用并重新识别前不会写入网页或修改事实资料。
    const unknown = Array.from(ui.fields.querySelectorAll('.field')).filter(row => !row.querySelector('select')?.value)
      .map(row => snapshot?.fields.find(f => f.id === row.dataset.id)).filter(f => f && fieldAI?.shouldAskAI(f.label, null))
      .slice(0, 12).map(f => ({ label: f.label, context: f.context || '', type: f.type || '', currentFieldId: null }));
    if (unknown.length) {
      const suggestions = await fieldAI.identifyFields(unknown);
      if (suggestions.length) showAISuggestions(suggestions, false);
    }
    logger[failed.length ? 'warn' : 'success']('智能填写完成', {
      total: (result.reports || []).length, success: (result.reports || []).length - failed.length, failed: failed.length });
  }

  // 每次填写完把这次投递记进历史（§58）。失败明细和实际填了什么都要留档。
  function recordHistory(result) {
    try {
      const reports = result?.reports || [];
      const ctx = context.read().fields;
      history.recordFill({
        company: ctx.company?.value || '',
        role: ctx.role?.value || '',
        url: pageUrl,
        profileId: ui.profiles.value,
        total: reports.length,
        success: reports.filter(r => r.ok).length,
        failed: reports.filter(r => !r.ok).length,
        pending: reports.filter(r => r.skipped).length,
        failures: reports.filter(r => !r.ok).map(r => ({ label: r.label, reason: r.message, canonical: r.canonical, target: r.value })),
        filled: reports.filter(r => r.ok).map(r => ({ label: r.label, value: r.value })),
      });
    } catch (e) { logger.warn('写填写历史失败', e.message); }
  }

  // 填写报告（§44）：失败项默认展开，每条带原因。
  async function renderReport(result) {
    const reports = result?.reports || [];
    const ok = reports.filter(x => x.ok).length;
    const failed = reports.filter(x => !x.ok);
    const pending = Array.from(ui.fields.querySelectorAll('.field')).filter(row => !row.querySelector('select')?.value).length;
    const details = document.createElement('details');
    details.open = failed.length > 0;   // 有失败就默认展开，全成功才折叠
    const summary = document.createElement('summary');
    summary.textContent = '填写报告：成功 ' + ok + ' / 待确认 ' + pending + ' / 失败 ' + failed.length;
    details.append(summary);
    for (const r of reports) {
      const line = document.createElement('p');
      line.textContent = (r.ok ? '✓ ' : '✗ ') + (r.label || '(无标签)') + ' · ' + (r.canonical || r.key || '-')
        + (r.ok ? '：已写入并读回核对' : '：' + (r.message || '失败'));
      details.append(line);
    }
    ui.fields.querySelector('details')?.remove();
    ui.fields.prepend(details);
    let closeMessage = '';
    if (currentSelection() && ui.closeModal.checked && reports.length && reports.every(r => r.ok)) {
      try {
        const closed = await page('finishSelected', {
          profile: profiles.find(x => x.id === ui.profiles.value), selection: currentSelection(),
          reviewedKeys: reports.map(r => r.key),
        });
        closeMessage = '\n' + closed.message;
        if (closed.closed) { snapshot = null; render(); }
      } catch (e) { logger.warn('收尾关闭弹窗失败', e.message); }
    }
    status(failed.length
      ? '6/6 完成：成功 ' + ok + ' 项，待确认 ' + pending + ' 项，失败 ' + failed.length + ' 项。失败项可用下面的重试按钮再试（最多 2 次）。' + closeMessage
      : pending
        ? '6/6 固定字段已处理：成功 ' + ok + ' 项，待确认 ' + pending + ' 项。请在逐字段核对区处理未匹配字段。' + closeMessage
        : '6/6 全部完成：成功 ' + ok + ' 项。' + closeMessage + '\n请核对后自行提交，插件不会替你点提交。',
      !!(failed.length || pending));
    return result;
  }

  function rememberCompany() {
    const name = context.value('company');
    if (!name) return;
    try { presets.learnCompany({ name, source: 'fill', roles: context.value('role') ? [context.value('role')] : [] }); } catch (e) { /* 预设失败不该影响填写 */ }
  }

  async function refreshSelection() {
    selectedValues(); await rememberScope();
    updateSelectionHint();
    const profile = profiles.find(x => x.id === ui.profiles.value);
    if (!profile) { snapshot = null; render(); return; }
    status('正在把已识别字段统一切换到所选资料…');
    try { snapshot = await page('scanSelected', { profile, selection: currentSelection() }); }
    catch (e) { snapshot = null; render(); throw e; }
    render();
    if (root.ResumeAIUI) root.ResumeAIUI.annotate();
  }

  function useRecord(group, index) {
    if (busy) return;
    ui.scopeGroup.value = group; populateRecords(index);
    return action(refreshSelection);
  }

  // ---------------------------------------------------------------- 按钮
  function wire() {
    ui.launch.onclick = launch;
    ui.btnHelp.onclick = () => editor.show('ai');
    ui.btnClose.onclick = launch;

    ui.manage.onclick = () => editor.show();
    ui.quickFill.onclick = () => action(fillCurrent);
    ui.smartFill.onclick = () => action(smartFill);
    ui.retryRule.onclick = () => action(retryByRule);
    ui.retryAI.onclick = () => action(retryByAI);
    ui.retryManual.onclick = () => action(retryToManual);
    ui.fill.onclick = () => action(fillCurrent);
    ui.copyError.onclick = () => action(copyErrorInfo);
    ui.undo.onclick = () => action(async () => {
      const result = await page('undo');
      snapshot = null; render(); updateFill();
      status('已撤销 ' + result.restored + ' 项，' + result.skipped + ' 项因已被修改或移除而保留。刷新网页后无法撤销。');
    });
    ui.results.onclick = () => action(async () => {
      const shown = await page('showResults');
      status(shown ? '已展开网页结果浮窗' : '尚无填写结果，请先填写当前表单');
    });
    ui.scan.onclick = () => action(async () => {
      status('正在识别当前页面…');
      await scanCurrent();
      ui.reviewPanel.open = true;
      status('发现 ' + snapshot.fields.length + ' 个可见字段。可在「逐字段核对与调整」中修改对应关系。');
    });
    ui.applyRecord.onclick = () => action(refreshSelection);
    ui.nextRecord.onclick = () => {
      if (busy) return;
      const s = ui.scopeRecord;
      if (s.selectedIndex < s.options.length - 1) { s.selectedIndex++; action(refreshSelection); }
      else status('已经是最后一条，请核对后自行提交。');
    };
    ui.expand.onclick = () => action(async () => {
      selectedValues();
      const profile = profiles.find(x => x.id === ui.profiles.value);
      if (!profile) { status('请先选择简历资料', true); return; }
      status('正在按资料条数补齐经历区块（实习经历／在校活动／获奖经历等）…');
      let result;
      try { result = await page('prepareRecords', { profile, selection: currentSelection() }); }
      catch (e) { status(e.message, true); return; }
      const added = Number(result?.added) || 0;
      const details = result?.details || [];
      const lines = details.map(d => d.group + '：' + d.have + ' → ' + d.want + (d.mode === 'modal' ? '（已打开新增弹窗，填完请点「保存本条」）' : ''));
      const modal = details.some(d => d.mode === 'modal');
      status(added
        ? '已新增 ' + added + ' 条经历记录行。\n' + lines.join('\n') + '\n接下来点「识别并核对字段」逐条核对，再点「填写已匹配字段」。' + (modal ? '\n新增弹窗里的内容需要先保存，弹窗才会关闭。' : '')
        : '没有补齐任何记录行：页面上已有的条数已经够，或该区块没有「添加」按钮。' + (lines.length ? '\n' + lines.join('\n') : ''), !added);
    });
    ui.closeModal.addEventListener('change', rememberScope);
    ui.profiles.addEventListener('change', async () => {
      restoreScope(); selectedValues(); snapshot = null; render();
      if (v2) v2.setActive(ui.profiles.value); else store.set('activeProfile', ui.profiles.value);
      probePageGroups();
    });
    ui.scopeGroup.addEventListener('change', () => { if (busy) return; populateRecords(); action(refreshSelection); });
    ui.scopeRecord.addEventListener('change', () => { if (!busy) action(refreshSelection); });

    for (const type of ['click', 'input', 'change', 'keydown', 'keyup', 'focusin', 'focusout']) {
      shadow.addEventListener(type, e => e.stopPropagation());
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && ui.panel.classList.contains('open') && !editor.isOpen()) launch();
    }, true);
  }

  // ---------------------------------------------------------------- 启动
  // 引擎格式的 profile 数组。v2 是唯一真相源，这里派生一份"引擎形状"给已验证的填写路径用，
  // 这样几百字段的管理能力和 4 站点实测过的 core.ResumeCore 填写逻辑两者兼得，引擎一行不改。
  let v2 = root.ResumeProfileV2;
  function engineProfiles() {
    return (v2 ? v2.listProfiles() : []).map(p => {
      const e = v2.toEngineProfile(p);
      e.id = p.id; e.title = p.title;
      return e;
    });
  }

  async function boot() {
    try {
      profiles = engineProfiles();
      if (!profiles.length) ui.profiles.append(new Option('尚未创建简历', ''));
      for (const p of profiles) ui.profiles.append(new Option(p.title || '未命名', p.id));
      const act = v2 ? v2.activeProfile() : null;
      if (act && profiles.some(x => x.id === act.id)) ui.profiles.value = act.id;
      pageUrl = location.href;
      restoreScope(); selectedValues(); updateFill();
      await probePageGroups();
      // 记下当前岗位上下文，供 AI 用
      try { context.detect(); } catch (e) { /* 抓不到就算了，不影响填写 */ }
    } catch (e) {
      status('无法读取简历：' + e.message, true);
    }
  }

  // SPA 换页后重新探测一次范围列表，否则"本页有没有这类字段"会一直是上一个页面的结果。
  let lastHref = location.href;
  function watchRoute() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    pageUrl = location.href;
    snapshot = null;
    render();
    try { context.detect(); } catch (e) { /* noop */ }
    if (ui.panel.classList.contains('open')) probePageGroups();
  }

  root.ResumePanel = { launch, ensure, status, watchRoute, isOpen: () => ui.panel && ui.panel.classList.contains('open') };
})(typeof globalThis !== 'undefined' ? globalThis : this);
