// 个人资料管理页（§63 导航 / §4 完整增删改排序启停 / §25 锁定 / §20 动态字段 / §27 附件确认态 / §51 AI 设置）。
//
// 扩展版是 options.html 独立页；油猴里没有独立页可跳，做成页面内全屏浮层。
// 数据用 profile v2（字段带 value/locked/confidence/source/status），UI 由标准字段库驱动 ——
// 库加一个字段，这里自动多一行，不用再改 UI 代码。
(function (root) {
  'use strict';

  const store = root.ResumeStore;
  const lib = root.ResumeFieldLibrary;
  const v2 = root.ResumeProfileV2;
  const ai = root.ResumeAI;
  const files = root.ResumeFiles;
  const presets = root.ResumePresets;
  const mapping = root.ResumeMapping;
  const logger = root.ResumeLogger;
  const history = root.ResumeHistory;
  const fieldAI = root.ResumeFieldAI;

  let host = null, shadow = null, ui = {};
  let open = false;
  let tab = 'home';
  let pendingDocuments=[];
  let documentBusy=false;
  let cache = null;            // 当前 v2 profile 的可变副本

  // §63 导航
  const NAV = [
    ['home', '首页'],
    ['personal', '个人资料'],
    ['education', '教育经历'],
    ['employment', '工作经历'],
    ['campus', '校园经历'],
    ['projects', '项目经历'],
    ['awards', '奖项证书'],
    ['skills', '技能'],
    ['family', '家庭信息'],
    ['files', 'AI知识库'],
    ['ai', 'AI设置'],
    ['history', '填写历史'],
    ['logs', '运行日志'],
    ['settings', '系统设置'],
  ];

  const STYLE = `:host{color-scheme:light;all:initial}
*{box-sizing:border-box;font:14px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#172338}
.overlay{position:fixed;inset:0;z-index:2147483647;background:#f6f4f2;display:none;flex-direction:column}
.overlay.open{display:flex}
.top{display:flex;align-items:center;gap:10px;background:#fff0ed;padding:10px 14px;border-bottom:1px solid #e8d5cf;flex-shrink:0}
.top strong{font-size:15px}
.top .grow{flex:1}
button{font:inherit;cursor:pointer;border:1px solid #d9b6ad;border-radius:6px;background:#fff;color:#7a2f20;padding:5px 10px}
button:hover:not(:disabled){background:#fff4f1}
button:disabled{opacity:.45;cursor:default}
button.primary{background:#b8452f;border-color:#b8452f;color:#fff}
button.primary:hover:not(:disabled){background:#a03d29}
button.danger{color:#a02318}
button.mini{padding:2px 7px;font-size:12px}
input,select,textarea{font:inherit;padding:5px 8px;border:1px solid #c9b4af;border-radius:5px;background:#fff;color:#172338;width:100%}
textarea{min-height:64px;resize:vertical}
.body{flex:1;display:flex;min-height:0}
.nav{width:168px;background:#fff;border-right:1px solid #e8e0dc;padding:10px;overflow:auto;flex-shrink:0}
.nav button{display:block;width:100%;text-align:left;border:none;background:none;padding:7px 9px;border-radius:6px;color:#33475b;margin-bottom:1px}
.nav button.active{background:#fff0ed;color:#b8452f;font-weight:600}
.nav .sec{margin:10px 6px 4px;font-size:11px;color:#8a7a72;letter-spacing:.5px}
.main{flex:1;overflow:auto;padding:16px 20px}
h1{font-size:20px;margin:0 0 4px}
h2{font-size:15px;margin:0 0 10px}
h3{font-size:13px;margin:14px 0 8px}
.card{background:#fff;border:1px solid #e5ded9;border-radius:8px;padding:14px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.f label{display:flex;align-items:center;gap:5px;font-size:12px;color:#59677b;margin-bottom:3px}
.f label .lock{cursor:pointer;user-select:none;opacity:.5}
.f label .lock.on{opacity:1}
.f .idline{font-size:10px;color:#a89a92;margin-top:2px;word-break:break-all}
.hint{font-size:12px;color:#59677b;margin:6px 0}
.warn{color:#9c3927}
.ok{color:#17643a}
.bar{position:sticky;bottom:0;background:#fff;border-top:1px solid #e8d5cf;padding:10px 16px;display:flex;gap:8px;align-items:center;flex-shrink:0}
.bar .grow{flex:1}
.rec{border:1px solid #eee;border-radius:6px;padding:10px;margin-bottom:8px;background:#fcfbfa}
.rec .rhead{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.rec .rhead .grow{flex:1;font-weight:600;font-size:13px}
.item{display:flex;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid #f4f0ee;font-size:13px}
.item .grow{flex:1}
.badge{font-size:11px;color:#59677b;border:1px solid #ddd;border-radius:4px;padding:1px 5px;background:#faf8f7}
.badge.ok{color:#17643a;border-color:#bfe0cd;background:#f2fbf6}
.badge.warn{color:#9c3927;border-color:#e8c3bb;background:#fdf3f1}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #f0ecea;vertical-align:top}
th{color:#59677b;font-weight:600}
pre{white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;background:#f7f5f3;padding:8px;border-radius:5px;max-height:260px;overflow:auto;margin:0}
.skillcat{margin-bottom:10px}
.skillcat .items{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.skill{display:flex;align-items:center;gap:5px;border:1px solid #e0d8d3;border-radius:14px;padding:3px 9px;font-size:12px;background:#fff;cursor:pointer}
.skill.has{border-color:#b8452f;background:#fff4f1;color:#b8452f}
.skill .lv{color:#8a7a72;font-size:11px}
.sug{border:1px solid #e8d5cf;background:#fffaf8;border-radius:6px;padding:10px;margin-bottom:8px;font-size:13px}
.sug .row{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
[hidden]{display:none!important}`;

  // ---------------------------------------------------------------- 壳
  function ensure() {
    if (host) return host;
    host = document.createElement('div');
    host.setAttribute('data-resume-profile', '');
    host.style.cssText = 'all:initial!important;position:static!important;';
    shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style'); style.textContent = STYLE;
    const overlay = document.createElement('div'); overlay.className = 'overlay';
    const top = document.createElement('div'); top.className = 'top';
    const title = document.createElement('strong'); title.textContent = '简历轻填 · 资料管理';
    const sp = document.createElement('span'); sp.className = 'grow';
    const btnExport = document.createElement('button'); btnExport.textContent = '导出';
    const btnImport = document.createElement('button'); btnImport.textContent = '导入';
    const btnClose = document.createElement('button'); btnClose.textContent = '关闭';
    top.append(title, sp, btnExport, btnImport, btnClose);

    const body = document.createElement('div'); body.className = 'body';
    const nav = document.createElement('div'); nav.className = 'nav';
    const main = document.createElement('div'); main.className = 'main';
    body.append(nav, main);

    const bar = document.createElement('div'); bar.className = 'bar';
    const status = document.createElement('span'); status.className = 'hint grow';
    const btnSave = document.createElement('button'); btnSave.className = 'primary'; btnSave.textContent = '保存资料';
    bar.append(status, btnSave);

    overlay.append(top, body, bar);
    shadow.append(style, overlay);
    const mount = () => (document.body || document.documentElement).appendChild(host);
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });

    ui = { overlay, nav, main, status, btnSave, btnClose, btnExport, btnImport, title };
    btnClose.onclick = hide;
    btnSave.onclick = save;
    btnExport.onclick = exportJSON;
    btnImport.onclick = importJSON;
    for (const t of ['click', 'input', 'change', 'keydown', 'keyup']) shadow.addEventListener(t, e => e.stopPropagation());
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) hide(); }, true);
    return host;
  }

  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(txt, fn, cls) { const b = el('button', cls || '', txt); b.onclick = fn; return b; }
  function setStatus(t, cls) { ui.status.textContent = t; ui.status.className = 'hint grow ' + (cls || ''); }

  function show(tabName) {
    ensure();
    cache = null;
    open = true;
    if (tabName) tab = tabName;
    ui.overlay.classList.add('open');
    render();
  }
  function hide() { open = false; if (ui.overlay) ui.overlay.classList.remove('open'); }
  function isOpen() { return open; }

  function prof() {
    if (!cache) cache = v2.activeProfile();
    return cache;
  }

  function save() {
    v2.saveProfile(prof());
    setStatus('已保存到本机浏览器，不会上传。', 'ok');
    logger.info('保存资料', { profileId: prof().id });
  }

  // ---------------------------------------------------------------- 渲染
  function render() {
    if (!prof()) { ui.main.replaceChildren(el('p', 'hint', '没有资料，点右上角「新建」。')); return; }
    renderNav();
    ui.main.replaceChildren();
    const fn = ({
      home: renderHome, personal: () => renderCategory('personal'), contact: () => renderCategory('contact'),
      education: () => renderList('education'), employment: () => renderList('employment'),
      campus: () => renderList('campus'), projects: () => renderList('projects'),
      awards: () => renderList('awards'), certificates: () => renderList('certificates'),
      languages: () => renderList('languages'), family: () => renderList('family'),
      job: () => renderCategory('job'), misc: () => renderCategory('misc'),
      skills: renderSkills, files: renderFiles, ai: renderAI, sites: renderSites,
      history: renderHistory, logs: renderLogs, settings: renderSettings, answers: renderAnswers,
    })[tab];
    if (fn) fn();
  }

  function renderNav() {
    ui.nav.replaceChildren();
    ui.nav.append(el('div', 'sec', '资料'));
    for (const [k, label] of NAV) {
      if (k === 'files' || k === 'ai' || k === 'sites' || k === 'history' || k === 'logs' || k === 'settings') {
        if (k === 'files') ui.nav.append(el('div', 'sec', 'AI 与数据'));
      }
      if (k === 'history') ui.nav.append(el('div', 'sec', '记录'));
      if (k === 'settings') ui.nav.append(el('div', 'sec', '系统'));
      const b = el('button', tab === k ? 'active' : '', label);
      b.onclick = () => { tab = k; render(); };
      ui.nav.append(b);
    }
  }

  function renderHome() {
    const p = prof();
    const card = el('div', 'card');
    card.append(el('h1', null, p.title || '我的简历'));
    card.append(el('p', 'hint', '左边是全部板块。带 🔒 的字段已锁定，AI 不能修改真实事实（只能给建议）。资料只保存在这台电脑。'));
    const grid = el('div', 'grid');
    const counts = {};
    for (const [cat] of Object.entries(lib.categories())) {
      const defs = lib.byCategory(cat).length;
      let filled = 0, locked = 0;
      if (cat === 'skills') { for (const fid of Object.keys(p.skills || {})) { if (p.skills[fid].value) filled++; if (p.skills[fid].locked) locked++; } }
      else if (v2.SINGLE.includes(cat)) { for (const fid of Object.keys(p.singles?.[cat] || {})) { if (p.singles[cat][fid].value) filled++; if (p.singles[cat][fid].locked) locked++; } }
      else { for (const rec of (p.lists?.[cat] || [])) for (const fid of Object.keys(rec)) { if (rec[fid].value) filled++; if (rec[fid].locked) locked++; } }
      counts[cat] = { defs, filled, locked };
    }
    const t = el('table');
    t.innerHTML = '<tr><th>板块</th><th>已填 / 字段数</th><th>已锁定</th><th></th></tr>';
    for (const [cat, info] of Object.entries(counts)) {
      const meta = lib.categories()[cat];
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + (meta.icon || '') + ' ' + meta.name + '</td><td>' + info.filled + ' / ' + info.defs + '</td><td>' + info.locked + '</td>';
      const td = document.createElement('td');
      const go = btn('编辑', () => { tab = v2.LISTS.includes(cat) ? cat : cat; render(); }, 'mini');
      td.append(go);
      tr.append(td);
      t.append(tr);
    }
    card.append(t);
    ui.main.append(card);
  }

  // 单值板块：按字段库逐个渲染
  function renderCategory(cat) {
    const p = prof();
    const meta = lib.categories()[cat];
    const card = el('div', 'card');
    card.append(el('h2', null, (meta.icon || '') + ' ' + meta.name));
    const grid = el('div', 'grid');
    for (const def of lib.byCategory(cat)) grid.append(fieldControl(def, () => v2.getValue(p, def.fieldId), (val) => {
      v2.setValue(p, def.fieldId, val);
    }, () => v2.getInstance(p, def.fieldId), () => save()));
    card.append(grid);
    ui.main.append(card);
    if (cat === 'misc') ui.main.append(el('p', 'hint', '「其他」板块里的自我评价、职业规划等也是 AI 开放题的素材来源。'));
  }

  // 多条板块
  function renderList(cat) {
    const p = prof();
    const meta = lib.categories()[cat];
    const items = p.lists?.[cat] || [];
    const head = el('div');
    const title = el('h2', null, (meta.icon || '') + ' ' + meta.name);
    head.append(title);
    const add = btn('＋ 添加一条', () => { v2.addListItem(p, cat); cache = p; save(); render(); });
    add.style.marginLeft = '12px';
    head.append(add);
    ui.main.append(head);

    if (!items.length) { ui.main.append(el('p', 'hint', '还没有条目。点上面「添加一条」。')); return; }
    items.forEach((rec, i) => {
      const box = el('div', 'rec');
      const h = el('div', 'rhead');
      h.append(el('span', 'grow', '第 ' + (i + 1) + ' 条'));
      const up = btn('↑', () => { if (i > 0) { const t = items[i - 1]; items[i - 1] = items[i]; items[i] = t; save(); render(); } }, 'mini');
      const dn = btn('↓', () => { if (i < items.length - 1) { const t = items[i + 1]; items[i + 1] = items[i]; items[i] = t; save(); render(); } }, 'mini');
      const del = btn('删除', () => { v2.removeListItem(p, cat, i); cache = p; save(); render(); }, 'mini danger');
      h.append(up, dn, del);
      box.append(h);
      const grid = el('div', 'grid');
      for (const def of lib.byCategory(cat)) grid.append(fieldControl(def, () => v2.getValueFromRecord(rec, def.fieldId), (val) => {
        rec[def.fieldId] = rec[def.fieldId] || { value: '', locked: false, confidence: 0, source: 'user', status: 'empty' };
        rec[def.fieldId].value = val; rec[def.fieldId].source = 'user'; rec[def.fieldId].confidence = 1;
        v2.saveProfile(p);
      }, () => rec[def.fieldId], () => save(), () => {
        // 锁定列表字段时可能还没有实例，先建一个空占位，否则锁不上
        rec[def.fieldId] = rec[def.fieldId] || { value: '', locked: false, confidence: 0, source: 'user', status: 'empty' };
        return rec[def.fieldId];
      }));
      box.append(grid);
      ui.main.append(box);
    });
  }

  // 单个字段控件（含锁定按钮 + dataType 适配）
  // ensureInst 是可选的：只有列表型字段需要（锁定要落到“某条记录的某个字段”上），
  // 单值字段走 v2.setLocked，不需要它。
  function fieldControl(def, getVal, setVal, getInst, afterChange, ensureInst) {
    const wrap = el('div', 'f');
    const lab = el('label');
    const lock = el('span', 'lock' + (getInst()?.locked ? ' on' : ''), getInst()?.locked ? '🔒' : '🔓');
    lock.title = '锁定后 AI 不能修改这个字段的真实值';
    lock.onclick = () => {
      const cur = !!getInst()?.locked;
      if (v2.SINGLE.includes(def.category)) { v2.setLocked(prof(), def.fieldId, !cur); }
      // 列表字段（教育/工作/项目…）的锁定挂在“第几条记录的某个字段”上，所以必须先确保这个实例存在。
      // ensureInst 由列表渲染处传入，负责把 rec[fieldId] 这个占位对象建出来。
      else {
        const inst = ensureInst ? ensureInst() : getInst();
        if (inst) { inst.locked = !cur; save(); }
      }
      afterChange(); render();
    };
    lab.append(lock, document.createTextNode(def.name));
    wrap.append(lab);

    const val = getVal() || '';
    let input;
    if (def.dataType === 'textarea') {
      input = document.createElement('textarea');
      input.value = val;
      input.rows = Math.min(8, Math.max(2, Math.ceil(String(val).length / 40) || 2));
    } else if (def.dataType === 'select' && def.options) {
      input = document.createElement('select');
      input.append(new Option('（不填）', ''));
      for (const o of def.options) input.append(new Option(o, o));
      input.value = val;
    } else {
      input = document.createElement('input');
      input.type = def.dataType === 'number' ? 'number' : def.dataType === 'date' ? 'date' : def.dataType === 'month' ? 'month' : 'text';
      input.value = val;
    }
    input.oninput = () => { setVal(input.value); };
    input.onchange = () => { setVal(input.value); afterChange(); };
    wrap.append(input);
    const idl = el('div', 'idline', def.fieldId);
    wrap.append(idl);
    return wrap;
  }

  // ---------------------------------------------------------------- 技能
  function renderSkills() {
    const p = prof();
    for (const [cat, def] of Object.entries(lib.SKILL_CATEGORIES)) {
      const card = el('div', 'card skillcat');
      card.append(el('h3', null, def.name));
      const items = el('div', 'items');
      for (const name of def.items) {
        const fid = 'skills.' + name.toLowerCase().replace(/[^a-z0-9一-龥]+/g, '-');
        const inst = p.skills[fid];
        const has = inst && inst.value;
        const chip = el('div', 'skill' + (has ? ' has' : ''));
        chip.append(document.createTextNode(name));
        if (has) { const lv = el('span', 'lv', ':' + (typeof inst.value === 'object' ? (inst.value.level || '') : inst.value)); chip.append(lv); }
        chip.onclick = () => { openSkillEditor(fid, name, def.name); };
        items.append(chip);
      }
      card.append(items);
      ui.main.append(card);
    }
    const custom = el('div', 'card');
    custom.append(el('h3', null, '自定义技能'));
    custom.append(el('p', 'hint', '库里的技能不够用？在这里加一条，会存成 skills.custom*，同样能被 AI 识别。'));
    const row = el('div', 'row');
    const nameIn = document.createElement('input'); nameIn.placeholder = '技能名称，如：CPA、吉他、SQL 优化';
    const add = btn('添加', () => {
      const n = String(nameIn.value || '').trim();
      if (!n) return;
      const fid = 'skills.custom-' + Math.random().toString(36).slice(2, 8);
      p.skills[fid] = { value: '', locked: false, confidence: 1, source: 'user', status: 'empty', name: n, custom: true };
      v2.saveProfile(p);
      nameIn.value = '';
      render();
    });
    row.append(nameIn, add);
    custom.append(row);
    ui.main.append(custom);
  }

  function openSkillEditor(fid, name, catName) {
    const p = prof();
    p.skills[fid] = p.skills[fid] || { value: '', locked: false, confidence: 1, source: 'user', status: 'empty', name, custom: false };
    const inst = p.skills[fid];
    const card = el('div', 'card');
    card.append(el('h3', null, catName + ' · ' + name));
    const grid = el('div', 'grid');
    const levels = ['入门', '了解', '一般', '熟悉', '熟练', '精通'];
    const cur = typeof inst.value === 'object' ? inst.value : {};
    const mk = (label, key, opts) => {
      const f = el('div', 'f');
      f.append(el('label', null, label));
      let i;
      if (opts) { i = document.createElement('select'); i.append(new Option('（不填）', '')); for (const o of opts) i.append(new Option(o, o)); }
      else { i = document.createElement('input'); }
      i.value = cur[key] || '';
      i.oninput = () => { inst.value = Object.assign({}, inst.value, { [key]: i.value }); inst.status = 'confirmed'; v2.saveProfile(p); };
      f.append(i);
      grid.append(f);
      return f;
    };
    mk('熟练度', 'level', levels);
    mk('使用年限', 'years');
    mk('使用场景', 'scenario');
    const desc = mk('描述', 'desc');
    desc.querySelector('input').type = 'text';
    const lockRow = el('div', 'row');
    const lockBtn = btn(inst.locked ? '🔒 已锁定（点击解锁）' : '🔓 点击锁定', () => { inst.locked = !inst.locked; v2.saveProfile(p); openSkillEditor(fid, name, catName); render(); }, 'mini');
    lockRow.append(lockBtn);
    card.append(grid, lockRow);
    // 插到最前面
    ui.main.prepend(card);
    card.scrollIntoView({ block: 'nearest' });
  }

  // ---------------------------------------------------------------- 附件（§27/§28 确认态）
  function renderFiles() {
    const card = el('div', 'card');
    card.append(el('h2', null, 'AI知识库'));
    card.append(el('p','hint','上传 PDF / Word / 文本后，选择用途。识别并存入字段库会把有原文依据的事实填入当前简历空白字段，多段经历分别保存；已有内容和锁定字段保留并列出冲突。仅作为 AI 提纯知识库不会修改个人字段。'));
    if(files.list().some(f=>f.builtin))card.append(el('p','hint','另有内置个人素材，可查看。'));
    card.append(el('p','hint','AI 操作使用你配置的接口，文档去除证件号码、手机号等后发送。未配置 AI 时，字段识别可先提取明确标注的姓名、电话、邮箱。扫描版 PDF 暂需先 OCR 转成可复制文字。'));
    const inp=document.createElement('input');inp.type='file';inp.multiple=true;inp.accept='.pdf,.docx,.md,.markdown,.txt';inp.disabled=documentBusy;
    inp.onchange=async()=>{
      documentBusy=true;inp.disabled=true;const selected=Array.from(inp.files||[]);
      for(const f of selected){try{if(f.size>30*1024*1024)throw Error('文件超过 30MB');setStatus('正在读取 '+f.name+'…');const text=await files.parse(f);if(!text.trim())throw Error('未读到文字，扫描 PDF 请先做 OCR');pendingDocuments.push({name:f.name,text});setStatus('已读取，请选择导入字段或提纯知识。','ok');}catch(e){setStatus(f.name+'：'+e.message,'warn');}}
      documentBusy=false;render();
    };
    card.append(inp);
    for(const doc of pendingDocuments){
      const row=el('div','card document-preview');row.append(el('h3',null,doc.name));
      const text=document.createElement('textarea');text.value=doc.text;text.setAttribute('aria-label','可编辑文档原文');text.oninput=()=>{doc.text=text.value;};text.disabled=documentBusy;row.append(text);
      const buttons=el('div','row');
      const run=async(mode,event)=>{
        if(documentBusy)return;documentBusy=true;const profileId=prof().id;
        row.querySelectorAll('button,textarea').forEach(b=>b.disabled=true);
        try{
          if(mode==='fields'){
            setStatus('正在识别字段并核对原文依据…');const extracted=await root.ResumeDocumentImport.extractFields(doc.text);
            const current=v2.listProfiles().find(p=>p.id===profileId);if(!current)throw Error('目标简历已删除，未导入');
            const result=root.ResumeDocumentImport.importFields(current,extracted);if(v2.activeProfile().id===profileId)cache=result.profile;
            doc.report=result.report;doc.resultText='新增 '+result.report.added.length+' 项；已有相同 '+result.report.unchanged.length+' 项；冲突保留 '+result.report.conflicts.length+' 项；未可靠识别 '+result.report.rejected.length+' 项。'+(extracted.localOnly?' 未配置 AI，仅完成本地明确字段提取。':'');
            setStatus(doc.resultText,'ok');
          }else{
            setStatus('正在提纯知识，不修改个人字段…');const refined=await root.ResumeDocumentImport.refine(doc.text);
            const saved=await files.addText(doc.name+' · AI提纯',refined,{originalText:doc.text,refined:true});
            const p=v2.listProfiles().find(x=>x.id===profileId);if(p){p.attachments=[...(p.attachments||[]),{id:saved.id,name:saved.name,status:'confirmed',editedText:refined}];v2.saveProfile(p);if(v2.activeProfile().id===profileId)cache=p;}
            doc.resultText='已保存为 AI 提纯知识库，个人字段未修改。';setStatus(doc.resultText,'ok');
          }
        }catch(e){setStatus(e.message||'识别失败','warn');doc.resultText=e.message;}
        finally{documentBusy=false;render();}
      };
      buttons.append(btn('识别并存入字段库',e=>run('fields',e),'primary'),btn('仅作为 AI 提纯知识库',e=>run('knowledge',e)),btn('移除待处理文件',()=>{pendingDocuments=pendingDocuments.filter(d=>d!==doc);render();},'mini'));
      buttons.querySelectorAll('button').forEach(b=>b.disabled=documentBusy);row.append(buttons);
      if(doc.resultText)row.append(el('p','hint',doc.resultText));
      if(doc.report){const detail=el('details');detail.append(el('summary',null,'查看导入结果与保留冲突'));detail.append(el('pre',null,JSON.stringify(doc.report,null,2)));row.append(detail);}
      card.append(row);
    }
    ui.main.append(card);

    const list = files.list();
    const lc = el('div', 'card');
    lc.append(el('h3', null, '当前知识来源'));
    if (!list.length) lc.append(el('p', 'hint', '还没有附件。'));
    for (const f of list) {
      const p = prof();
      const meta = (p.attachments || []).find(a => a.id === f.id) || {};
      const status = f.builtin ? 'confirmed' : (meta.status || 'extracted');
      const row = el('div', 'item');
      row.append(el('span', 'grow', f.name + ' · ' + f.chunks + ' 片段 · ' + Math.round((f.size || 0) / 1024) + 'KB'));
      const badge = el('span', 'badge ' + (status === 'confirmed' ? 'ok' : status === 'pending' ? 'warn' : ''), f.builtin ? '内置 · 已确认 · AI检索' : (status === 'confirmed' ? '已确认' : status === 'pending' ? '待确认' : 'AI提取'));
      row.append(badge);
      if (f.builtin) {
        row.append(btn('查看素材', () => showExtracted(f, { editedText: '' }, true), 'mini'));
        lc.append(row);
        continue;
      }
      if (status !== 'confirmed') {
        row.append(btn('查看/编辑提取结果', () => showExtracted(f, meta), 'mini'));
        row.append(btn('确认', () => {
          p.attachments = p.attachments || [];
          const rec = p.attachments.find(a => a.id === f.id) || { id: f.id, name: f.name };
          rec.status = 'confirmed';
          p.attachments.push(rec); p.attachments = p.attachments.filter((x, i, a) => a.findIndex(y => y.id === x.id) === i);
          v2.saveProfile(p); render();
        }, 'mini primary'));
      }
      if(status==='confirmed')row.append(btn('查看 / 编辑知识',()=>showExtracted(f,meta),'mini'));
      row.append(btn('删除', async () => { await files.remove(f.id); p.attachments = (p.attachments || []).filter(a => a.id !== f.id); v2.saveProfile(p); render(); }, 'mini danger'));
      lc.append(row);
    }
    ui.main.append(lc);
  }

  // 展示/编辑提取出来的全文（§27 第四步「我能看到 AI 提取了什么」）
  // 打开就把 IndexedDB 里的原文读出来，而不是只给一个「读取中…」占位。
  function showExtracted(f, meta, readOnly = false) {
    const card = el('div', 'card');
    card.append(el('h3', null, '提取结果 · ' + f.name));
    card.append(el('p', 'hint', readOnly ? '这是随插件内置的已确认总素材库，AI 会按当前字段检索相关片段后再生成。' : '这是从文件里读出来的全文。确认无误后点「确认并保存」，它才会被标为已确认并参与 AI 检索。'));
    const ta = document.createElement('textarea');
    ta.style.minHeight = '300px';
    ta.readOnly = readOnly;
    ta.value = meta.editedText || '（读取中…）';
    card.append(ta);
    const row = el('div', 'row');
    row.append(btn('重新读取原文', async () => {
      ta.value = '（重新读取中…）';
      try { ta.value = (await files.getText(f.id)) || '（这个附件里没有文字）'; }
      catch (e) { ta.value = '读取失败：' + e.message; }
    }, 'mini'));
    // 打开弹窗就把原文读出来（§27：必须能看到 AI 提取了什么）。
    // 这里不用「点一下刷新按钮」的方式，因为那会把已编辑的 editedText 覆盖成原始提取结果。
    (async () => {
      if (meta.editedText) { ta.value = meta.editedText; return; }   // 已人工编辑过的优先显示
      try { ta.value = (await files.getText(f.id)) || '（这个附件里没有文字）'; }
      catch (e) { ta.value = '读取失败：' + e.message; }
    })();
    if (!readOnly) row.append(btn('确认并保存', async (e) => {
      const btnEl = e.currentTarget;   // btn() 传的是 onclick 事件，按钮本身要取 currentTarget
      btnEl.disabled = true;
      const p = prof();
      p.attachments = p.attachments || [];
      const rec = p.attachments.find(a => a.id === f.id) || { id: f.id, name: f.name };
      rec.status = 'confirmed';
      rec.editedText = ta.value;
      p.attachments = [...p.attachments.filter(a => a.id !== f.id), rec];
      v2.saveProfile(p);
      // 把编辑后的文本重新入库并重新分块，这样 AI 检索用的是确认版而不是原始提取版。
      // 之前这里写的是 `files.replaceText ? ... : null`，失败会被静默吞掉：状态显示「已确认」，
      // 但库里其实还是旧文本，检索结果和界面不一致很难查。所以这里必须 catch 并如实报错。
      try {
        await files.replaceText(f.id, ta.value);
        setStatus('已确认并保存：' + f.name, 'ok');
        render();
      } catch (e) {
        btnEl.disabled = false;
        setStatus('已标记为已确认，但写入附件库失败：' + e.message, 'warn');
      }
    }, 'mini primary'));
    card.append(row);
    ui.main.prepend(card);
  }

  // ---------------------------------------------------------------- AI 设置（§51）
  function renderAI() {
    const c = ai.config();
    const card = el('div', 'card');
    card.append(el('h2', null, 'AI 设置'));
    card.append(el('p', 'hint', '优先支持 OpenAI 兼容 API（DeepSeek / 通义千问 / Kimi / 智谱 GLM / OpenRouter / 本地模型 / 自定义中转都行）。不要锁死模型。Key 只存本机，不显示在日志里。'));
    const grid = el('div', 'grid');
    const pv = el('div', 'f');
    pv.append(el('label', null, '服务商'));
    const sel = document.createElement('select');
    for (const pr of ai.PROVIDERS) sel.append(new Option(pr.name, pr.id));
    sel.value = c.provider;
    sel.onchange = () => { c.provider = sel.value; ai.saveConfig(c); render(); };
    pv.append(sel);
    grid.append(pv);

    const kv = el('div', 'f');
    kv.append(el('label', null, 'API Key'));
    const ki = document.createElement('input'); ki.type = 'password'; ki.value = c.apiKey; ki.placeholder = 'sk-…';
    ki.oninput = () => { c.apiKey = ki.value; ai.saveConfig(c); };
    kv.append(ki);
    const trow = el('div', 'row');
    trow.append(btn('显示/隐藏', () => { ki.type = ki.type === 'password' ? 'text' : 'password'; }, 'mini'));
    kv.append(trow, el('div', 'hint', '当前：' + (ai.maskKey(c.apiKey) || '未设置')));
    grid.append(kv);

    const mf = el('div', 'f'); mf.append(el('label', null, 'Model'));
    const mi = document.createElement('input'); mi.value = c.model; mi.placeholder = '留空用服务商默认';
    mi.oninput = () => { c.model = mi.value; ai.saveConfig(c); };
    mf.append(mi); grid.append(mf);

    const bf = el('div', 'f'); bf.append(el('label', null, 'Base URL'));
    const bi = document.createElement('input'); bi.value = c.baseUrl; bi.placeholder = '留空用服务商默认';
    bi.oninput = () => { c.baseUrl = bi.value; ai.saveConfig(c); };
    bf.append(bi); grid.append(bf);

    const tf = el('div', 'f'); tf.append(el('label', null, 'Temperature'));
    const ti = document.createElement('input'); ti.type = 'number'; ti.step = '0.1'; ti.min = '0'; ti.max = '2'; ti.value = c.temperature;
    ti.oninput = () => { c.temperature = Number(ti.value); ai.saveConfig(c); };
    tf.append(ti); grid.append(tf);

    const mf2 = el('div', 'f'); mf2.append(el('label', null, 'Max Tokens'));
    const mi2 = document.createElement('input'); mi2.type = 'number'; mi2.min = '128'; mi2.step = '1'; mi2.value = c.maxTokens;
    mi2.onchange = () => { const value = Number(mi2.value); c.maxTokens = Number.isFinite(value) && value >= 128 ? Math.round(value) : 800; mi2.value = c.maxTokens; ai.saveConfig(c); };
    mf2.append(mi2); grid.append(mf2);
    card.append(grid);

    const row = el('div', 'row');
    const test = btn('测试连接', async () => { test.disabled = true; setStatus('测试中…'); try { setStatus('连接可用：' + await ai.ping(), 'ok'); } catch (e) { setStatus('失败：' + e.message, 'warn'); } test.disabled = false; }, 'primary');
    row.append(test);
    card.append(row);
    ui.main.append(card);

    const pv2 = el('div', 'card');
    pv2.append(el('h3', null, '隐私最小化（§54/§55）'));
    pv2.append(el('p', 'hint', '每次只发送与当前问题相关的资料切片。以下字段永远不发送：身份证号、护照号、家庭电话、详细住址、成绩单/GPA、期望薪资、照片。AI 也不能修改这些或任何已锁定字段的真实值。'));
    ui.main.append(pv2);
  }

  // ---------------------------------------------------------------- 网站适配（§23/§49）
  function renderSites() {
    const card = el('div', 'card');
    card.append(el('h2', null, '网站适配 · 字段映射学习'));
    card.append(el('p', 'hint', '每次你确认一个字段映射，这里就会记住，以后同一网站优先用你的规则（优先级：用户确认 > 网站适配 > 通用规则 > AI）。这就是"越用越准"。'));
    const learned = mapping.siteMappings();
    const t = el('table');
    t.innerHTML = '<tr><th>网页字段</th><th>标准字段</th><th>来源</th><th></th></tr>';
    if (!learned.length) t.innerHTML += '<tr><td colspan="4" class="hint">当前站点还没有学到的映射。去识别页面时确认几个，就会出现在这里。</td></tr>';
    for (const m of learned) {
      const tr = document.createElement('tr');
      for (const value of [m.label, m.fieldId, m.source === 'user' ? '用户确认' : 'AI 采纳']) {
        const cell = document.createElement('td');
        cell.textContent = value;
        tr.append(cell);
      }
      const td = document.createElement('td');
      td.append(btn('删除', () => { mapping.forget(m.label, m.site); render(); }, 'mini danger'));
      tr.append(td);
      t.append(tr);
    }
    card.append(t);
    ui.main.append(card);

    const sc = el('div', 'card');
    sc.append(el('h3', null, '内置站点预设'));
    const s = presets.all();
    for (const site of s.sites) {
      const row = el('div', 'item');
      row.append(el('span', 'grow', site.name + '（' + site.domains.join(', ') + '）'));
      const tgl = btn(presets.isDisabled(site.id) ? '启用' : '停用', () => { presets.isDisabled(site.id) ? presets.enable(site.id) : presets.disable(site.id); render(); }, 'mini');
      row.append(tgl);
      sc.append(row);
    }
    ui.main.append(sc);
  }

  // ---------------------------------------------------------------- 历史
  function renderHistory() {
    const card = el('div', 'card');
    card.append(el('h2', null, '填写历史'));
    const list = history.all();
    if (!list.length) card.append(el('p', 'hint', '还没有填写记录。填一次就会自动记录。'));
    for (const r of list.slice(0, 40)) {
      const row = el('div', 'rec');
      const h = el('div', 'rhead');
      h.append(el('span', 'grow', (r.company || '(未识别公司)') + ' · ' + (r.role || '(未识别岗位)')));
      h.append(el('span', 'badge ok', '成功 ' + r.success));
      if (r.failed) h.append(el('span', 'badge warn', '失败 ' + r.failed));
      h.append(el('span', 'hint', new Date(r.at).toLocaleString('zh-CN')));
      row.append(h);
      if (r.failures.length) {
        const d = el('details');
        d.append(el('summary', null, '失败字段 ' + r.failures.length + ' 个'));
        for (const f of r.failures) d.append(el('p', 'hint warn', f.label + ' → ' + (f.reason || '')));
        row.append(d);
      }
      row.append(btn('删除', () => { history.remove(r.id); render(); }, 'mini danger'));
      card.append(row);
    }
    ui.main.append(card);

    const ah = el('div', 'card');
    ah.append(el('h3', null, 'AI 回答历史'));
    const al = history.aiAll();
    if (!al.length) ah.append(el('p', 'hint', '还没有 AI 回答记录。'));
    for (const a of al.slice(0, 40)) {
      const row = el('div', 'rec');
      row.append(el('strong', null, a.question));
      row.append(el('p', 'hint', (a.company || '') + ' / ' + (a.role || '') + ' · ' + new Date(a.at).toLocaleString('zh-CN') + (a.used ? ' · 已采用' : ' · 未采用')));
      row.append(el('pre', null, a.final || a.recommendation));
      ah.append(row);
    }
    ui.main.append(ah);
  }

  function renderAnswers() {
    const card = el('div', 'card');
    card.append(el('h2', null, '常用网申资料'));
    card.append(el('p', 'hint', '右下角助手每次“写入当前字段”成功后，会把最终写入内容自动更新为常用资料。分段经历会保留所属模块和具体段落，避免串用。'));
    const answerLib = root.ResumeAnswerLibrary;
    const list = answerLib?.all?.() || [];
    if (!list.length) card.append(el('p', 'hint', '还没有常用资料。'));
    for (const a of list.slice(0, 200)) {
      const row = el('div', 'rec');
      row.append(el('strong', null, a.label || '未命名字段'));
      const meta = [a.scope?.recordLabel || '通用', a.source === 'preset' ? '预制' : '已确认', '已用 ' + (a.useCount || 0) + ' 次'].join(' · ');
      row.append(el('p', 'hint', meta));
      row.append(el('pre', null, a.value || ''));
      row.append(btn('删除', () => { answerLib.remove(a.id); render(); }, 'mini danger'));
      card.append(row);
    }
    const legacy = store.get('savedAnswers') || [];
    if (Array.isArray(legacy) && legacy.length) {
      const details = document.createElement('details');
      details.append(el('summary', null, '旧版常用答案（兼容保留 ' + legacy.length + ' 条）'));
      details.append(el('p', 'hint', '旧版答案没有模块/段落信息，不再参与新的分段推荐。需要使用时可在网页里重新写入一次，它会自动进入新版常用资料。'));
      for (const a of legacy.slice(0, 100)) {
        const row = el('div', 'rec');
        row.append(el('strong', null, a.question || '旧版答案'));
        row.append(el('pre', null, a.text || ''));
        row.append(btn('删除', () => { ai.removeAnswer(a.question, a.contextKey); render(); }, 'mini danger'));
        details.append(row);
      }
      card.append(details);
    }
    ui.main.append(card);
  }

  // ---------------------------------------------------------------- 日志 / 设置
  function renderLogs() {
    const card = el('div', 'card');
    const h = el('h2', null, '运行日志');
    const trow = el('div', 'row');
    trow.append(btn('导出日志', () => { const b = new Blob([logger.exportText()], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = '简历轻填-日志.txt'; a.click(); }, 'mini'));
    trow.append(btn('清空', () => { logger.clear(); render(); }, 'mini danger'));
    card.append(h, trow);
    const pre = el('pre', null, logger.list(400).map(e => '[' + e.t + '][' + e.level + '] ' + e.message + (e.data ? '  ' + e.data : '')).join('\n') || '(空)');
    card.append(pre);
    ui.main.append(card);
  }

  function renderSettings() {
    const card = el('div', 'card');
    card.append(el('h2', null, '系统设置'));
    const row = el('div', 'row');
    const lg = el('input'); lg.type = 'checkbox'; lg.checked = logger.enabled;
    lg.onchange = () => { logger.enabled = lg.checked; };
    row.append(lg, document.createTextNode(' 记录运行日志'));
    card.append(row);
    const row2 = el('div', 'row');
    const sel = document.createElement('select');
    for (const lv of ['DEBUG', 'INFO', 'SUCCESS', 'WARNING', 'ERROR']) sel.append(new Option(lv, lv));
    sel.value = logger.minLevel; sel.style.width = '160px';
    sel.onchange = () => { logger.minLevel = sel.value; };
    row2.append(sel, document.createTextNode(' 最低日志等级'));
    card.append(row2);

    const p = prof();
    const lockCard = el('div', 'card');
    lockCard.append(el('h3', null, '已锁定字段'));
    lockCard.append(el('p', 'hint', '锁定后 AI 不能修改这些字段的真实值，只能给建议。'));
    const locks = v2.lockedFields(p);
    if (!locks.length) lockCard.append(el('p', 'hint', '还没有锁定任何字段。在各字段的标题上点 🔓 即可锁定。'));
    for (const fid of locks) {
      const row = el('div', 'item');
      row.append(el('span', 'grow', (lib.byId(fid)?.name || fid) + '  ·  ' + fid));
      row.append(btn('解锁', () => { const def = lib.byId(fid); if (def && v2.SINGLE.includes(def.category)) v2.setLocked(p, fid, false); else { /* list 内的在对应板块解锁 */ } save(); render(); }, 'mini'));
      lockCard.append(row);
    }
    ui.main.append(card, lockCard);

    // 旧版引擎有些字段尚未进入标准字段库。兼容数据仍会参与填写，必须让用户看见并能修改。
    const extras = p.legacyExtras || {};
    const legacyCard = el('div', 'card');
    const details = document.createElement('details');
    details.append(el('summary', null, '旧版兼容字段（仍参与自动填写）'));
    details.append(el('p', 'hint', '升级时无法对应到新字段库的原资料保存在这里。修改或删除后会立即保存到本机。'));
    let count = 0;
    const addField = (group, index, key, value, record) => {
      if (value === '' || value == null) return;
      count++;
      const label = group === 'basics'
        ? root.ResumeCore.basics.find(([name]) => name === key)?.[1] || key
        : root.ResumeCore.groups[group]?.fields.find(([name]) => name === key)?.[1] || key;
      const wrap = el('div', 'f');
      wrap.append(el('label', null, (group === 'basics' ? '个人信息' : root.ResumeCore.groups[group]?.title || group) + (index == null ? '' : ' ' + (index + 1)) + ' · ' + label));
      const input = el(String(value).length > 100 ? 'textarea' : 'input');
      input.value = String(value);
      input.onchange = () => { record[key] = input.value; v2.saveProfile(p); setStatus('兼容字段已保存。', 'ok'); };
      wrap.append(input, btn('删除', () => { delete record[key]; v2.saveProfile(p); render(); }, 'mini danger'));
      details.append(wrap);
    };
    for (const [group, data] of Object.entries(extras)) {
      if (group === 'basics') for (const [key, value] of Object.entries(data || {})) addField(group, null, key, value, data);
      else if (Array.isArray(data)) data.forEach((record, index) => {
        for (const [key, value] of Object.entries(record || {})) addField(group, index, key, value, record);
      });
    }
    if (!count) details.append(el('p', 'hint', '没有旧版兼容字段。'));
    legacyCard.append(details);
    ui.main.append(legacyCard);
  }

  // ---------------------------------------------------------------- 导入导出
  function exportJSON() {
    const storage = store.exportAll();
    if (storage.aiConfig) storage.aiConfig = Object.assign({}, storage.aiConfig, { apiKey: '' });
    const data = { format: 'resume-light-fill-backup', version: 2, exportedAt: new Date().toISOString(), storage };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '简历轻填-资料-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  function importJSON() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        let n = 0;
        if (obj.format === 'resume-light-fill-backup') {
          if (obj.version !== 2 || !obj.storage || typeof obj.storage !== 'object' || !Array.isArray(obj.storage.profilesV2)) throw new Error('备份格式无效或版本不兼容');
          n = store.importAll(obj.storage);
        } else if (obj.v === 2) {
          n = v2.importAll(obj);
          if (obj.presets) store.set('presets', obj.presets);
        } else {
          n = store.importAll(obj);
        }
        setStatus('已恢复 ' + n + ' 项本地数据。请刷新页面后核对资料、映射和历史。', 'ok');
        cache = null; render();
      } catch (e) { setStatus('导入失败：' + e.message, 'warn'); }
    };
    inp.click();
  }

  root.ResumeProfileEditor = { show, hide, isOpen };
})(typeof globalThis !== 'undefined' ? globalThis : this);
