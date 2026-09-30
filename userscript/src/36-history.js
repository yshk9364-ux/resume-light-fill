// 填写历史（§58）+ AI 回答历史（§59）。
// 历史是"投递档案"：哪家公司、哪个岗位、哪些成功、哪些失败、AI 写了什么、最终用了什么。
(function (root) {
  'use strict';

  const store = root.ResumeStore;
  const KEY = 'history';
  const AI_KEY = 'aiHistory';
  const MAX = 200;

  function all() { const v = store.get(KEY); return Array.isArray(v) ? v : []; }
  function aiAll() { const v = store.get(AI_KEY); return Array.isArray(v) ? v : []; }

  // 一次填写的档案
  function recordFill(entry) {
    const list = all();
    const rec = {
      id: 'h' + Date.now().toString(36),
      at: new Date().toISOString(),
      company: entry.company || '',
      role: entry.role || '',
      url: entry.url || (typeof location !== 'undefined' ? location.href : ''),
      profileId: entry.profileId || '',
      total: entry.total || 0,
      success: entry.success || 0,
      failed: entry.failed || 0,
      pending: entry.pending || 0,
      failures: (entry.failures || []).map(f => ({ label: f.label, reason: f.reason || f.message, canonical: f.canonical, target: f.target })),
      // §58 最终实际填写内容：只记有值的，且脱敏（不记身份证等）
      filled: (entry.filled || []).filter(f => f.value).map(f => ({ label: f.label, value: scrub(f.value) })),
    };
    list.unshift(rec);
    store.set(KEY, list.slice(0, MAX));
    return rec;
  }

  function scrub(v) {
    return String(v || '')
      .replace(/\b\d{17}[\dXx]\b/g, '[身份证]')
      .replace(/\b1[3-9]\d{9}\b/g, '[手机号]');
  }

  function remove(id) { store.set(KEY, all().filter(r => r.id !== id)); }
  function clear() { store.set(KEY, []); }

  // AI 回答历史（§59）：原始问题 / AI 推荐 / 最终采用版本 / 公司 / 岗位 / 日期
  function recordAI(entry) {
    const list = aiAll();
    list.unshift({
      id: 'a' + Date.now().toString(36),
      at: new Date().toISOString(),
      question: entry.question || '',
      recommendation: entry.recommendation || '',
      final: entry.final || entry.recommendation || '',
      edited: !!entry.edited,
      used: entry.used !== false,
      company: entry.company || '',
      role: entry.role || '',
      pageLabel: entry.pageLabel || '',
    });
    store.set(AI_KEY, list.slice(0, MAX));
    return list[0];
  }
  function aiRemove(id) { store.set(AI_KEY, aiAll().filter(r => r.id !== id)); }
  function aiClear() { store.set(AI_KEY, []); }

  // 站点/公司维度的小统计，用在网站适配页
  function stats() {
    const list = all();
    const byCompany = {};
    for (const r of list) {
      const k = r.company || '(未识别)';
      byCompany[k] = byCompany[k] || { count: 0, success: 0, failed: 0 };
      byCompany[k].count++; byCompany[k].success += r.success; byCompany[k].failed += r.failed;
    }
    return { total: list.length, byCompany };
  }

  root.ResumeHistory = { all, recordFill, remove, clear, stats, aiAll, recordAI, aiRemove, aiClear, scrub };
})(typeof globalThis !== 'undefined' ? globalThis : this);
