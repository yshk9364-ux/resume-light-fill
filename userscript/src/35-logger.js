// 运行日志（§60/§61）。带等级、可开关、可导出、内存环形缓冲 + 落盘最近若干条。
(function (root) {
  'use strict';

  const store = root.ResumeStore;
  const KEY = 'logs';
  const LEVELS = { DEBUG: 10, INFO: 20, SUCCESS: 30, WARNING: 40, ERROR: 50 };
  const MAX_PERSIST = 800;
  const MAX_MEMORY = 3000;

  let enabled = store.get('logEnabled') !== false;
  let minLevel = store.get('logLevel') || 'INFO';
  const buffer = [];

  function push(level, message, data) {
    if (!enabled) return;
    if ((LEVELS[level] || 0) < (LEVELS[minLevel] || 0)) return;
    const entry = { t: new Date().toISOString(), level, message: String(message) };
    if (data !== undefined) {
      try { entry.data = typeof data === 'string' ? data : JSON.stringify(data); } catch (e) { entry.data = '[无法序列化]'; }
    }
    buffer.push(entry);
    if (buffer.length > MAX_MEMORY) buffer.splice(0, buffer.length - MAX_MEMORY);
    persist(entry);
    // 方便用户在控制台实时看
    if (root.console) {
      const fn = level === 'ERROR' ? console.error : level === 'WARNING' ? console.warn : console.log;
      fn('[简历轻填][' + level + ']', message, data === undefined ? '' : data);
    }
    return entry;
  }

  function persist(entry) {
    const all = store.get(KEY);
    const list = Array.isArray(all) ? all : [];
    list.push(entry);
    while (list.length > MAX_PERSIST) list.shift();
    store.set(KEY, list);
  }

  root.ResumeLogger = {
    LEVELS,
    debug: (m, d) => push('DEBUG', m, d),
    info: (m, d) => push('INFO', m, d),
    success: (m, d) => push('SUCCESS', m, d),
    warn: (m, d) => push('WARNING', m, d),
    error: (m, d) => push('ERROR', m, d),
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; store.set('logEnabled', enabled); },
    get minLevel() { return minLevel; },
    set minLevel(v) { minLevel = v; store.set('logLevel', v); },
    list(limit) { const all = store.get(KEY); const arr = Array.isArray(all) ? all : []; return limit ? arr.slice(-limit) : arr; },
    memory: () => buffer.slice(),
    clear() { store.set(KEY, []); buffer.length = 0; },
    exportText() { return (store.get(KEY) || []).map(e => '[' + e.t + '][' + e.level + '] ' + e.message + (e.data ? ' ' + e.data : '')).join('\n'); },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
