// 存储层。扩展里用 chrome.storage.local，油猴里换成 GM_*Value。
//
// 这一版修掉了两个会「静默丢数据」的严重问题，都是整包烟雾测试跑出来的：
//
//   1. 之前只认 GM4 的 `GM.getValue` 对象式 API，而脚本头部 @grant 申请的却是经典
//      `GM_getValue` 函数式 API。两者不是一回事：Tampermonkey/Violentmonkey 给的是后者。
//      结果 rawGet/rawSet 的两个分支代码完全一样，都调 GM.xxx，于是在 TM 上每次读都抛
//      TypeError（被 try 吞掉当成 undefined），每次写都只打印「写入失败」。
//      表现就是：资料改了、映射学了、历史记了，刷新页面全没了。
//   2. 之前只在启动时预读 KEYS 里那 5 个键（还是扩展时代的老键名），而资料实际存在
//      profilesV2、日志在 logs、映射在 learnedMappings……这些键从来没被读进内存，
//      于是 get() 一律返回 undefined。
//
// 现在的做法：启动时把「已知键 + 后端能列出的全部键」一次性读进内存，之后读取都是同步的。
// 这样 UI 渲染时不用 await，两种 userscript manager 都能跑。
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- 后端探测
  // 三种形状，按可靠性从高到低：
  //   classic : GM_getValue 函数式（Tampermonkey / Violentmonkey / ScriptCat），同步
  //   gm4     : GM.getValue 对象式（Greasemonkey 4），返回 Promise
  //   local   : localStorage 兜底（沙箱里啥都没有时，至少别丢数据）
  const has = fn => typeof root[fn] === 'function';
  const gm4 = root.GM && typeof root.GM.getValue === 'function';

  const backend = has('GM_getValue') ? 'classic' : gm4 ? 'gm4' : 'local';

  // 已知键。KEYS 里那几个是扩展时代的老键，保留是为了「从扩展迁移」能整块搬运；
  // 其余是油猴版各模块自己写出来的键，一个都不能少，否则刷新后读不回来。
  const LEGACY_KEYS = {
    profiles: 'profiles',
    activeProfile: 'activeProfile',
    fillSelections: 'fillSelections',
    parentPhoneRevision: 'parentPhoneRevision',
    bundleRevision: 'bundleRevision',
  };

  const KNOWN_KEYS = [
    // 资料 v2（唯一真相源）
    'profilesV2', 'activeProfileV2', 'savedAnswers',
    // 预设与映射
    'presets', 'learnedMappings',
    // 历史与日志
    'history', 'aiHistory', 'fieldAnswerLibrary', 'logs', 'logEnabled', 'logLevel',
    // 岗位上下文
    'jobContext', 'jobContextCache', 'aiCache',
    // AI 与附件配置
    'aiConfig', 'fileConfig', 'fileIndex', 'fileTextLibrary', 'supportPreferences', 'supportUsage',
  ];

  // ---------------------------------------------------------------- 原始读写
  // 注意每个分支都真的用对应形状的 API，不要写成两个分支一样。
  const rawGet = key => {
    try {
      if (backend === 'classic') return root.GM_getValue(key);
      if (backend === 'gm4') return root.GM.getValue(key);          // Promise
      return root.localStorage.getItem(key);
    } catch (e) { return undefined; }
  };

  const rawSet = (key, value) => {
    try {
      if (backend === 'classic') { root.GM_setValue(key, value); return true; }
      if (backend === 'gm4') { root.GM.setValue(key, value); return true; }   // Promise，不 await 但不阻塞
      root.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[简历轻填] 写入失败', key, e);
      return false;
    }
  };

  const rawDelete = key => {
    try {
      if (backend === 'classic') { root.GM_deleteValue(key); return; }
      if (backend === 'gm4') { root.GM.deleteValue(key); return; }
      root.localStorage.removeItem(key);
    } catch (e) { /* 忽略 */ }
  };

  // 列出后端里已有的全部键。GM4 是异步的，这里只在能同步列的时候用。
  const rawKeysSync = () => {
    try {
      if (backend === 'classic' && has('GM_listValues')) return root.GM_listValues() || [];
      if (backend === 'local') return Object.keys(root.localStorage || {});
    } catch (e) { /* 忽略 */ }
    return [];
  };

  // ---------------------------------------------------------------- 内存缓存
  const cache = Object.create(null);
  let loaded = false;
  let readyResolve;
  // ready：GM4 后端要异步把全部键读进来。classic/local 是同步的，调用方 await 一下几乎不花时间。
  const ready = new Promise(resolve => { readyResolve = resolve; });

  function knownKeys() {
    // 后端能列键就用它，再并上已知键 —— 后端里可能有我们没预料到的（比如旧版本留下的），
    // 只用已知键会漏，只用后端键则在后端不支持列键时什么都不剩。
    const set = new Set([...Object.values(LEGACY_KEYS), ...KNOWN_KEYS]);
    for (const k of rawKeysSync()) set.add(k);
    return Array.from(set);
  }

  function decode(v) {
    if (typeof v !== 'string') return v;
    // localStorage 只能存字符串，读回来要还原类型；GM_*Value 存的是结构化值，不该走到这。
    try { return JSON.parse(v); } catch (e) { return v; }
  }

  function loadSync() {
    if (loaded) return cache;
    if (backend === 'gm4') {
      // 异步后端：值在 promise 里回填，先把同步能拿到的放进来。
      for (const key of knownKeys()) {
        const v = rawGet(key);
        if (v && typeof v.then === 'function') {
          v.then(value => { if (value !== undefined) cache[key] = value; }).catch(() => {});
        } else if (v !== undefined) {
          cache[key] = decode(v);
        }
      }
      loaded = true;
      readyResolve(cache);
      return cache;
    }
    for (const key of knownKeys()) {
      const value = rawGet(key);
      if (value !== undefined) cache[key] = decode(value);
    }
    loaded = true;
    readyResolve(cache);
    return cache;
  }

  function get(key) { return loadSync()[key]; }
  function set(key, value) { loadSync(); cache[key] = value; rawSet(key, value); }
  function remove(key) { loadSync(); delete cache[key]; rawDelete(key); }
  function keys() { return Object.keys(loadSync()); }

  // 让调用方在 GM4 下等到预读完成。classic/local 下几乎立即 resolve。
  function whenReady() { loadSync(); return ready; }

  // ---------------------------------------------------------------- 导入导出
  // 导出：给用户一个可以自己保存、换机器时再导入的 JSON。
  function exportAll() {
    loadSync();
    const out = {};
    for (const key of keys()) out[key] = cache[key];
    return out;
  }

  function importAll(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('导入内容不是有效的 JSON 对象');
    loadSync();
    let n = 0;
    // 全量导入，不只认 KEYS 里那几个 —— 否则导出的历史/日志/映射导不回来，等于备份没用。
    for (const key of Object.keys(obj)) {
      if (obj[key] === undefined) continue;
      cache[key] = obj[key];
      rawSet(key, obj[key]);
      n++;
    }
    if (!n) throw new Error('导入的 JSON 里没有可识别的简历资料字段');
    return n;
  }

  root.ResumeStore = {
    KEYS: LEGACY_KEYS,
    KNOWN_KEYS,
    get,
    set,
    remove,
    keys,
    loadSync,
    whenReady,
    exportAll,
    importAll,
    backend,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
