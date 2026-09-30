// 附件：上传 → 解析成文本 → 分块 → BM25 检索。
//
// 为什么不把文件塞进 GM_setValue：那个 API 存的是字符串、且有大小上限，一份 PDF 转 base64
// 轻松几 MB，一份就可能把存储撑爆甚至静默截断。文件放 IndexedDB（页面主世界可用，
// 几十 MB 没问题），GM 存储里只留一份很小的索引。
//
// 为什么用 BM25 而不是向量库：简历类附件就几页到几十页，几百个分块，关键词打分足够准，
// 而且 embedding 要额外调 API、要花钱、离线就废了。分块 + BM25 是这个规模下的正解。
(function (root) {
  'use strict';

  const store = root.ResumeStore;
  const INDEX_KEY = 'fileIndex';

  const DB_NAME = 'resume-light-fill-files';
  const DB_STORE = 'files';
  const DB_VERSION = 1;

  // v2.6.4：内置个人总素材库，作为 AI 的事实参考库。
  // 当前字段 -> 结构化资料 -> 知识库检索 -> 岗位/JD -> AI 生成。
  const BUILTIN_ID = 'builtin-personal-master-v264';
  const BUILTIN_NAME = '';
  const BUILTIN_TEXT = '';

  // 加载解析库。pdf.js 和 mammoth 都是纯 JS，可以在页面里直接跑。
  // 用 @require 从 CDN 拉，缓存在脚本管理器里，不会每次进页面都下载。
  const CDN = {
    pdfjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js',
  };

  // 解析器本身的 CDN 地址。可以换成自己的地址以免依赖公共 CDN。
  const CONFIG_KEY = 'fileConfig';

  function config() {
    const s = store.get(CONFIG_KEY);
    return Object.assign({ pdfjs: CDN.pdfjs, pdfWorker: CDN.pdfWorker, mammoth: CDN.mammoth }, s || {});
  }

  function index() {
    const v = store.get(INDEX_KEY);
    return Array.isArray(v) ? v : [];
  }
  function saveIndex(list) { store.set(INDEX_KEY, list); }

  // ---------------------------------------------------------------- IndexedDB
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('当前环境不支持 IndexedDB，无法保存附件'));
      let req;
      try { req = root.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('打不开本地附件库'));
    });
  }

  function tx(mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(DB_STORE, mode);
      const store1 = t.objectStore(DB_STORE);
      let out;
      try { out = fn(store1); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error || new Error('附件库读写失败'));
      t.onabort = () => reject(t.error || new Error('附件库操作被中止'));
    }));
  }

  const idbPut = rec => tx('readwrite', s => s.put(rec));
  const idbGet = id => tx('readonly', s => s.get(id));
  const idbDel = id => tx('readwrite', s => s.delete(id));
  const idbAll = () => tx('readonly', s => s.getAll());

  // ---------------------------------------------------------------- 脚本加载
  const loaded = {};
  function loadScript(url) {
    if (loaded[url]) return loaded[url];
    loaded[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => { delete loaded[url]; reject(new Error('加载 ' + url + ' 失败。可能是网络受限，或该 CDN 不可达。')); };
      (document.head || document.documentElement).appendChild(s);
    });
    return loaded[url];
  }

  // ---------------------------------------------------------------- 解析
  async function parsePDF(file) {
    const c = config();
    await loadScript(c.pdfjs);
    const pdfjs = root.pdfjsLib || root.unsafeWindow?.pdfjsLib;
    if (!pdfjs) throw new Error('pdf.js 加载后没有暴露 pdfjsLib');
    pdfjs.GlobalWorkerOptions.workerSrc = c.pdfWorker;
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      // 按行重组：pdf.js 给的是一个个 item，按 y 坐标聚成行，读起来才像人话
      const lines = new Map();
      for (const it of tc.items) {
        const y = Math.round(it.transform[5]);
        if (!lines.has(y)) lines.set(y, []);
        lines.get(y).push(it.str);
      }
      const text = [...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, parts]) => parts.join('').trim()).filter(Boolean).join('\n');
      pages.push(text);
    }
    return pages.join('\n\n');
  }

  async function parseDocx(file) {
    const c = config();
    await loadScript(c.mammoth);
    const mammoth = root.mammoth || root.unsafeWindow?.mammoth;
    if (!mammoth) throw new Error('mammoth 加载后没有暴露 mammoth');
    const buf = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    return res.value || '';
  }

  function parseText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('读取文件失败'));
      r.readAsText(file, 'utf-8');
    });
  }

  async function parse(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return parsePDF(file);
    if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) return parseDocx(file);
    if (name.endsWith('.doc')) throw new Error('旧版 .doc 无法在浏览器里解析，请另存为 .docx 或 PDF 后再上传。');
    if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt') || file.type.startsWith('text/')) return parseText(file);
    throw new Error('暂不支持这种文件类型：' + (file.name || '未知') + '。请上传 PDF / Word(.docx) / Markdown / 纯文本。');
  }

  // ---------------------------------------------------------------- 分块
  // 按段落切，每块目标 ~500 字，重叠 1 段。中文按字数算就够，不必上分词。
  function chunk(text, target = 500, overlap = 1) {
    const paras = String(text || '').split(/\n{2,}/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!paras.length) return [];
    const chunks = [];
    let cur = [], len = 0;
    for (const p of paras) {
      cur.push(p); len += p.length;
      if (len >= target) { chunks.push(cur.join('\n')); cur = cur.slice(-overlap); len = cur.reduce((s, x) => s + x.length, 0); }
    }
    if (cur.length) chunks.push(cur.join('\n'));
    return chunks.filter(Boolean);
  }

  // ---------------------------------------------------------------- BM25
  // 中文没有空格分词，用「2-gram 字符」当 token：对中文短文本检索效果够用，且完全离线。
  function tokenize(s) {
    const t = String(s || '').toLowerCase();
    const tokens = [];
    const latin = t.match(/[a-z0-9]+/g) || [];
    tokens.push(...latin);
    const cjk = t.replace(/[^一-龥]+/g, ' ');
    for (const seg of cjk.split(/\s+/).filter(Boolean)) {
      if (seg.length === 1) { tokens.push(seg); continue; }
      for (let i = 0; i < seg.length - 1; i++) tokens.push(seg.slice(i, i + 2));
    }
    return tokens;
  }

  function buildIndex(docs) {
    // docs: [{id, text}]
    const k1 = 1.5, b = 0.75;
    const tfs = docs.map(d => {
      const toks = tokenize(d.text);
      const tf = new Map();
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      return { id: d.id, len: toks.length, tf };
    });
    const N = Math.max(1, tfs.length);
    const avg = tfs.reduce((s, d) => s + d.len, 0) / N || 1;
    const df = new Map();
    for (const d of tfs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    return { k1, b, N, avg, df, tfs, docs };
  }

  function searchIndex(idx, query, topN) {
    if (!idx || !idx.tfs.length) return [];
    const qTokens = [...new Set(tokenize(query))];
    const scored = idx.tfs.map(d => {
      let s = 0;
      for (const t of qTokens) {
        const f = d.tf.get(t);
        if (!f) continue;
        const n = idx.df.get(t) || 0;
        const idf = Math.log(1 + (idx.N - n + 0.5) / (n + 0.5));
        s += idf * ((f * (idx.k1 + 1)) / (f + idx.k1 * (1 - idx.b + idx.b * (d.len / idx.avg))));
      }
      return { id: d.id, score: s };
    });
    return scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, topN || 6);
  }

  // 索引缓存。资料不变就不用重建。
  let cache = null;
  function invalidate() { cache = null; }

  async function allChunks() {
    const list = index();
    const recs = chunk(BUILTIN_TEXT).map((text, i) => ({ id: BUILTIN_ID + '#' + i, name: BUILTIN_NAME, text }));
    for (const meta of list) {
      const cached = (store.get('fileTextLibrary')||{})[meta.id];
      const rec = cached ? {chunks:chunk(cached.text)} : await idbGet(meta.id);
      if (rec && Array.isArray(rec.chunks)) {
        for (let i = 0; i < rec.chunks.length; i++) {
          recs.push({ id: meta.id + '#' + i, name: meta.name, text: rec.chunks[i] });
        }
      }
    }
    return recs;
  }

  async function getIndex() {
    if (cache) return cache;
    cache = buildIndex(await allChunks());
    return cache;
  }

  // 对外：给一个查询，返回最相关的片段拼成的文本（长度不超过 maxChars）。
  async function search(query, maxChars = 1500) {
    if (!query) return ''; // v2.6.4 内置知识库始终存在，不能再用“上传附件为空”提前返回
    try {
      const idx = await getIndex();
      const hits = searchIndex(idx, query, 6);
      if (!hits.length) return '';
      const parts = [];
      let total = 0;
      for (const h of hits) {
        const doc = idx.docs.find(d => d.id === h.id);
        if (!doc) continue;
        const piece = doc.text;
        if (total + piece.length > maxChars) {
          parts.push(piece.slice(0, Math.max(0, maxChars - total)));
          break;
        }
        parts.push(piece);
        total += piece.length;
      }
      return parts.filter(Boolean).join('\n---\n');
    } catch (e) {
      return '';
    }
  }

  // ---------------------------------------------------------------- 上传/删除
  async function add(file) {
    if (!file) throw new Error('没有选择文件');
    if (file.size > 30 * 1024 * 1024) throw new Error('文件超过 30MB，请先精简：' + file.name);
    const text = await parse(file);
    if (!String(text || '').trim()) throw new Error('这个文件里没有读到任何文字（可能是扫描版 PDF，需要先做文字识别）：' + file.name);
    return addText(file.name,text,{size:file.size,type:file.type});
  }

  async function addText(name,text,extra={}){
    text=String(text||'');if(!text.trim())throw new Error('内容为空，未保存');
    if(text.length>500000)throw new Error('文字超过 50 万字，请拆分文件');
    const id='f'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    const chunksList=chunk(text);
    const rec={id,name,size:extra.size||text.length,type:extra.type||'text/plain',chunks:chunksList,addedAt:new Date().toISOString()};
    const textLibrary=store.get('fileTextLibrary')||{};textLibrary[id]={text,name,originalText:extra.originalText||'',refined:!!extra.refined};store.set('fileTextLibrary',textLibrary);
    try{await idbPut(rec);}catch{/* 文本已跨网站持久保存，IndexedDB 缓存不是保存前提。 */}
    saveIndex([...index(),{id,name,size:rec.size,type:rec.type,chunks:chunksList.length,addedAt:rec.addedAt,refined:!!extra.refined}]);invalidate();
    return {id,name,chunks:chunksList.length};
  }

  async function remove(id) {
    if (id === BUILTIN_ID) throw new Error('内置总素材库不能删除');
    const textLibrary=store.get('fileTextLibrary')||{};delete textLibrary[id];store.set('fileTextLibrary',textLibrary);
    await idbDel(id).catch(()=>{});
    saveIndex(index().filter(f => f.id !== id));
    invalidate();
  }

  // 取回某个附件的完整原文（§27「我能看到 AI 提取了什么」）。
  // 资料管理页的「重新读取原文」按钮要的就是这个：把 IndexedDB 里存的分块拼回去。
  // 分块之间用空行拼回，尽量接近原始段落结构。
  async function getText(id) {
    if (id === BUILTIN_ID) return BUILTIN_TEXT;
    const cached=(store.get('fileTextLibrary')||{})[id];if(cached)return cached.text;
    const rec = await idbGet(id);
    if (!rec || !Array.isArray(rec.chunks)) return '';
    return rec.chunks.join('\n\n');
  }

  // 用人工编辑过的文本替换掉提取结果（§27 第四步「允许我编辑」→ §28「确认」）。
  // 重新分块再入库，这样 BM25 检索用的是确认版而不是 AI 提取版。
  // 注意：这里只改附件库里的检索文本，绝不碰结构化资料字段（§24 真实事实不经确认不改）。
  async function replaceText(id, text) {
    if (id === BUILTIN_ID) throw new Error('内置总素材库为只读资料');
    const cached=(store.get('fileTextLibrary')||{})[id];
    const rec=cached?{id,name:cached.name,chunks:chunk(cached.text)}:await idbGet(id);
    if (!rec) throw new Error('找不到这个附件，可能已被删除');
    const value = String(text || '');
    if (!value.trim()) throw new Error('内容是空的，没有替换');
    const chunksList = chunk(value);
    rec.chunks = chunksList;
    rec.edited = true;
    rec.editedAt = new Date().toISOString();
    const textLibrary=store.get('fileTextLibrary')||{};textLibrary[id]={...(textLibrary[id]||{}),text:value,name:rec.name};store.set('fileTextLibrary',textLibrary);
    await idbPut(rec).catch(()=>{});
    // 索引里的片段数要跟着变，否则管理页显示的「N 片段」和实际对不上
    saveIndex(index().map(f => f.id === id ? Object.assign({}, f, { chunks: chunksList.length, edited: true }) : f));
    invalidate();
    return { id, chunks: chunksList.length };
  }

  function list() {
    const built = { id: BUILTIN_ID, name: BUILTIN_NAME, size: BUILTIN_TEXT.length, type: 'text/markdown', chunks: chunk(BUILTIN_TEXT).length, addedAt: '2026-09-29T00:00:00.000Z', builtin: true, confirmed: true };
    return [...(BUILTIN_TEXT?[built]:[]), ...index()];
  }

  function clearAll() {
    const list = index();
    return Promise.all(list.map(f => idbDel(f.id).catch(() => {}))).then(() => { saveIndex([]);store.set('fileTextLibrary',{}); invalidate(); });
  }

  root.ResumeFiles = { add, addText, remove, list, clearAll, search, parse, config, invalidate, tokenize, chunk, buildIndex, searchIndex, getText, replaceText };
})(typeof globalThis !== 'undefined' ? globalThis : this);
