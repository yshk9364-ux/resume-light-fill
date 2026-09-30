// 字段映射学习（§21 AI 修正映射 / §22 AI 纠正错误识别 / §23 学习已确认映射 / §50 优先级）。
//
// 优先级链（§50），从高到低：
//   用户确认规则  >  网站适配器  >  通用字段规则  >  AI 语义判断
// 任何一次成功的人工确认都写进 learned，用户确认过的映射永远压过 AI，保证"越用越准"
// 且不会被 AI 的一次误判带偏（数据安全 > 自动化）。
(function (root) {
  'use strict';

  const store = root.ResumeStore;
  const lib = root.ResumeFieldLibrary;
  const logger = root.ResumeLogger;
  const KEY = 'learnedMappings';

  function host() { return String(location.hostname || '').toLowerCase(); }

  function all() { const v = store.get(KEY); return Array.isArray(v) ? v : []; }

  function siteKey() {
    // 站点适配器的 key：优先用引擎算出来的适配器名，没有就退回域名
    try { return root.ResumePage?.site?.() || host(); } catch (e) { return host(); }
  }

  // learned: [{ site, label, fieldId, confidence, source:'user'|'ai-accepted', at }]
  // label 是网页上看到的字段文字（规范化后），fieldId 是标准字段。
  function findLearned(site, label) {
    const key = normLabel(label);
    return all().find(m => m.site === site && normLabel(m.label) === key) || null;
  }

  function normLabel(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }

  // 记住一条用户确认过的映射
  function learn(site, label, fieldId, opts = {}) {
    if (!site || !label || !fieldId) return null;
    const list = all();
    const key = normLabel(label);
    const i = list.findIndex(m => m.site === site && normLabel(m.label) === key);
    const rec = { site, label: String(label), fieldId, confidence: opts.confidence ?? 1, source: opts.source || 'user', at: new Date().toISOString() };
    if (i >= 0) list[i] = rec; else list.push(rec);
    store.set(KEY, list);
    logger.info('学习字段映射', { site, label, fieldId, source: rec.source });
    return rec;
  }

  function forget(label, site = siteKey()) {
    store.set(KEY, all().filter(m => !(m.site === site && normLabel(m.label) === normLabel(label))));
  }
  function clearSite(site) { store.set(KEY, all().filter(m => m.site !== site)); }

  // §50 完整决策链。返回 { fieldId, source, confidence } 或 null。
  // 顺序不能变：learned → site adapter → general rules → (AI 由上层补)。
  function resolve(label, opts = {}) {
    const site = opts.site || siteKey();

    // 1) 用户确认规则
    const learned = findLearned(site, label);
    if (learned) return { fieldId: learned.fieldId, source: 'learned', confidence: learned.confidence ?? 1 };

    // 2) 网站适配器：site-rules 里的字段别名覆盖（现有 siteRules 是区块级，这里用预设的字段别名）
    const presets = root.ResumePresets;
    if (presets) {
      const sp = presets.siteForDomain(location.hostname);
      if (sp && sp.fields && sp.fields[normLabel(label)]) {
        return { fieldId: sp.fields[normLabel(label)], source: 'site-adapter', confidence: 0.9 };
      }
    }

    // 3) 通用字段规则：字段库 label/别名匹配
    const m = lib.matchLabel(label);
    if (m) return { fieldId: m.fieldId, source: 'general', confidence: m.confidence };

    // 4) 交给 AI（返回 null，上层看到 null 就调 AI）
    return null;
  }

  // 站点适配器：为一个站点批量设定字段映射（网站适配页用）
  function setSiteFields(site, mapObj) {
    const presets = root.ResumePresets;
    if (!presets) return;
    const s = presets.all();
    const rec = s.sites.find(x => x.id === site);
    if (!rec) return;
    rec.fields = Object.assign({}, rec.fields, mapObj);
    presets.save(s);
  }

  // 某站点学到的所有映射（网站适配页展示）
  function siteMappings(site) { return all().filter(m => m.site === (site || siteKey())); }

  root.ResumeMapping = { all, learn, findLearned, forget, clearSite, resolve, setSiteFields, siteMappings, siteKey, normLabel };
})(typeof globalThis !== 'undefined' ? globalThis : this);
