// 输入框旁的 AI 推荐气泡。
//
// 三条硬约束：
// 1. 写入走引擎的 fill()（原生 setter + input/change 事件 + 读回校验），不自己 set value。
//    React 受控组件只认这条路，而且这保证了「填好了」是读回来的事实，不是我们敲进去的字。
// 2. AI 写的东西不豁免校验。fill() 读回失败就如实报失败。
// 3. closed shadow DOM：既不被网站 CSS 影响，也不被页面脚本窥探。
(function (root) {
  'use strict';

  const ai = root.ResumeAI;
  const context = root.ResumeContext;
  const files = root.ResumeFiles;
  const answerLib = root.ResumeAnswerLibrary;
  // 「网页里能直接吃到文字的控件」。点选组和下拉触发器没有 input，靠引擎登记节点另行识别。
  const TEXT_INPUT = 'input:not([type="hidden"]),textarea,select,[contenteditable="true"]';

  let host = null, shadow = null, els = {};
  let current = null;              // 当前关联的输入控件（真实 DOM 元素）
  let currentField = null;
  let busy = false;
  let writing = false;
  let confirmedNewField = false;
  let suspended = false;
  let manualPosition = null;
  let lastScanAt = 0;
  let drag = null;
  let currentRecommendationId = '';
  let semanticToken = 0;
  let scopeLocked = root.ResumeStore?.get('aiScopeLocked') === true;
  let lockedGroup = root.ResumeStore?.get('aiLockedGroup') || 'global';
  const selectedRecordByGroup = Object.create(null); // 多段经历：用户明确选中的资料段，跨同组字段复用
  const MODULES = [
    ['global', '全局通用'],
    ['personal', '基本信息'], ['job', '求职意向'], ['misc', '个人描述 / 开放题'],
    ['education', '教育经历'], ['work', '工作 / 实习经历'], ['projects', '项目经历'],
    ['campus', '校园经历'], ['awards', '荣誉奖项'], ['certificates', '证书 / 培训'],
    ['family', '家庭成员'], ['professionalSkills', '专业技能'],
    ['computerSkills', '计算机技能'], ['languages', '语言能力'],
  ];
  const MODULE_TITLE = Object.fromEntries(MODULES);
  const WRITE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.75A1.75 1.75 0 0 1 6.75 4h5.5A1.75 1.75 0 0 1 14 5.75v3.5h-1.5v-3.5a.25.25 0 0 0-.25-.25h-5.5a.25.25 0 0 0-.25.25v12.5c0 .14.11.25.25.25h5.5c.14 0 .25-.11.25-.25v-3.5H14v3.5A1.75 1.75 0 0 1 12.25 20h-5.5A1.75 1.75 0 0 1 5 18.25V5.75Z"/><path d="M11.47 11.25h5.72l-1.72-1.72 1.06-1.06L20.06 12l-3.53 3.53-1.06-1.06 1.72-1.72h-5.72v-1.5Z"/></svg>';

  const STYLE = `:host{color-scheme:light;all:initial}
*{box-sizing:border-box;font:14px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.trigger{position:fixed;right:18px;bottom:18px;display:flex;z-index:2147483647;pointer-events:auto!important;touch-action:manipulation;width:58px;height:58px;min-width:58px;padding:0;border-radius:18px;border:1px solid #c99b8e;background:#b8452f;color:#fff;cursor:pointer;box-shadow:0 8px 24px #54241845;align-items:center;justify-content:center}
.trigger:hover{background:#a03d29;transform:translateY(-1px)}
.trigger:active{transform:translateY(0);box-shadow:0 4px 12px #54241835}
.trigger svg{width:24px;height:24px;display:block;fill:currentColor;pointer-events:none}
.card{position:fixed;z-index:2147483647;width:min(360px,calc(100vw - 24px));max-height:min(86vh,780px);background:#fff;color:#172338;
  border:1px solid #e0b4aa;border-radius:8px;box-shadow:0 10px 40px #15294440;overflow:hidden;display:flex;flex-direction:column}
.hd{display:flex;align-items:center;gap:8px;background:#fff0ed;padding:10px 12px;border-bottom:1px solid #f0d8d2;cursor:move;touch-action:none;user-select:none}
.hd strong{flex:1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hd button{flex:none}
button{font:inherit;cursor:pointer;border:1px solid #d9b6ad;border-radius:6px;background:#fff;color:#7a2f20;padding:5px 9px}
button:hover:not(:disabled){background:#fff4f1}
button:disabled{opacity:.45;cursor:default}
button.primary{background:#b8452f;border-color:#b8452f;color:#fff}
button.primary:hover:not(:disabled){background:#a03d29}
.bd{padding:12px;overflow:auto;min-height:0;overscroll-behavior:contain}
.actions{flex:none;padding:10px 12px;background:#fff;border-bottom:1px solid #eee1dc}
.actions .row{margin:0}.actions .field-actions,.actions .segment-mode{margin-top:7px}.segment-mode button{width:100%;background:#eef5ff;color:#254e80}.segment-mode button[aria-pressed=true]{background:#e8f6ed;color:#17643a;border-color:#78ae8b}.version-badge{font-size:10px;color:#7a2f20;white-space:nowrap}.field-actions button{flex:1}.actions .meta{max-height:76px;overflow:auto}
.conversion{font-size:12px;color:#245647;background:#f0f8f3;border:1px solid #cee5d6;border-radius:6px;padding:7px 9px;margin:8px 0 0}
.conversion.warn{color:#943f2d;background:#fff3ee;border-color:#efc8b9}
.conversion select{width:auto;padding:1px 5px;font-size:12px;margin-top:5px}
.scopebox,.advanced{border:1px solid #e4dedb;border-radius:7px;padding:8px 10px;margin:10px 0;background:#faf9f8}
summary{cursor:pointer;font-size:12px;font-weight:600;user-select:none}
.scopebox .modulebox,.scopebox .recordbox{border:0;background:transparent;margin:8px 0 0;padding:0}
.content-label{margin:0 0 5px;color:#3f5877;font-weight:700}
@media(max-width:480px){.card{max-height:calc(100dvh - 92px)}.hd{padding:8px 10px;gap:5px}.hd button{padding:4px 7px}}
label{display:block;margin:10px 0 4px;font-size:12px;color:#59677b}
select,input[type=text],input[type=number]{width:100%;font:inherit;padding:5px 6px;border:1px solid #c9b4af;border-radius:5px;background:#fff;color:#172338}
textarea{width:100%;min-height:124px;font:inherit;padding:8px;border:1px solid #c9b4af;border-radius:6px;resize:vertical;color:#172338;line-height:1.6}
.row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px}
.row .spacer{flex:1}
/* 粘贴是主操作：独占一行铺满，窄浮窗里才不会被挤成两行字。 */
.row.fill{margin-top:8px}
.row.fill button.primary{flex:1;min-width:0}
.meta{font-size:12px;color:#59677b;margin:8px 0 0}
.meta.warn{color:#9c3927}
.meta.ok{color:#17643a}
.modulebox,.recordbox{margin:0 0 10px;padding:8px;border:1px solid #d8e2ef;border-radius:7px;background:#f8fbff}.modulebox label,.recordbox label{margin:0 0 5px;color:#3f5877;font-weight:700}.modulebox select,.recordbox select{background:#fff}.modulehint{font-size:11px;color:#61758f;margin-top:4px}
.recbox{margin:0 0 10px;padding:8px;border:1px solid #eadfce;border-radius:7px;background:#fffdf8}
.recbox .ttl{font-size:12px;font-weight:700;margin-bottom:6px;color:#725d35}
.rec{display:flex;gap:6px;align-items:flex-start;padding:7px 0;border-top:1px solid #f1eadf}
.rec:first-of-type{border-top:0}.rec .txt{flex:1;min-width:0}.rec .val{font-size:12px;white-space:pre-wrap;max-height:68px;overflow:hidden}.rec .sub{font-size:11px;color:#7b8797;margin-top:2px}.rec button{padding:3px 7px;font-size:12px}
details{margin-top:8px;font-size:12px;color:#59677b}
details pre{white-space:pre-wrap;max-height:170px;overflow:auto;background:#f7f5f3;padding:8px;border-radius:5px;margin:6px 0 0;font:12px/1.5 ui-monospace,monospace}
[hidden]{display:none!important}`;

  function ensure() {
    if (host) return host;
    host = document.createElement('div');
    host.setAttribute('data-resume-ai', '');
    host.style.cssText = 'all:initial!important;position:static!important;';
    shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style'); style.textContent = STYLE;
    const trigger = document.createElement('button');
    trigger.className = 'trigger'; trigger.type = 'button'; trigger.innerHTML = WRITE_ICON;
    trigger.title = '打开/关闭一键写入助手'; trigger.setAttribute('aria-label', '打开/关闭一键写入助手');

    const card = document.createElement('div'); card.className = 'card'; card.hidden = true;
    const hd = document.createElement('div'); hd.className = 'hd'; hd.title = '拖动这里移动浮窗';
    const title = document.createElement('strong'); title.textContent = '一键写入助手';
    const btnManage = document.createElement('button'); btnManage.textContent = '资料'; btnManage.title = '管理简历资料';
    const btnSupport=document.createElement('button');btnSupport.textContent='支持';btnSupport.title='自愿支持项目维护';btnSupport.onclick=()=>root.ResumeSupport?.show();
    const btnSettings = document.createElement('button'); btnSettings.textContent = 'AI'; btnSettings.title = 'AI 设置';
    const btnClose = document.createElement('button'); btnClose.textContent = '关闭';
    const versionBadge=document.createElement('span');versionBadge.className='version-badge';versionBadge.textContent='v'+root.ResumeEngineVersion;
    hd.append(title,versionBadge,btnManage,btnSettings,btnSupport,btnClose);

    const bd = document.createElement('div'); bd.className = 'bd';

    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const lStyle = mk('label', null, '风格'), selStyle = document.createElement('select');
    for (const s of ['务实贴合岗位', '简洁克制（约100字）', '热情积极', '详实（把经历讲透）']) {
      const o = document.createElement('option'); o.value = s; o.textContent = s; selStyle.append(o);
    }
    selStyle.value = '务实贴合岗位';
    const lLen = mk('label', null, '字数上限'), inpLen = document.createElement('input');
    inpLen.type = 'number'; inpLen.min = '30'; inpLen.max = '3000'; inpLen.placeholder = '留空则不限';
    const lQ = mk('label', null, '要回答的问题（可改）'), inpQ = document.createElement('input');
    inpQ.type = 'text'; inpQ.placeholder = '例如：为什么申请这个岗位';
    const modulebox = mk('div', 'modulebox');
    const moduleLabel = mk('label', null, '这个字段属于哪个资料模块');
    const moduleSelect = document.createElement('select');
    for (const [value, label] of MODULES) moduleSelect.append(new Option(label, value));
    const moduleHint = mk('div', 'modulehint', '这里永远可以手动改归属。插件不认识的新字段默认“通用”，不会再根据附近文字乱分模块；进入某模块后还可选“模块通用”或具体哪一段。');
    const lockLabel = mk('label', 'scope-lock-label');
    const scopeLock = document.createElement('input');scopeLock.type='checkbox';scopeLock.className='scope-lock';scopeLock.checked=scopeLocked;
    lockLabel.append(scopeLock,document.createTextNode(' 限定所选模块 / 阶段（点击字段不切换）'));
    modulebox.append(moduleLabel, moduleSelect, moduleHint);
    const btnNewField=mk('button',null,'自定义字段名称');btnNewField.className='new-field';
    const customBox=mk('details','custom-fields');customBox.append(mk('summary',null,'已保存字段'));
    const customList=mk('div','custom-list');customBox.append(customList);
    const newForm=mk('div','new-field-form');newForm.hidden=true;
    const customName=mk('input');customName.type='text';customName.setAttribute('aria-label','新字段名称');
    const customAliases=mk('input');customAliases.type='text';customAliases.setAttribute('aria-label','字段别名');customAliases.placeholder='用逗号分隔，例如：工作亮点、主要成果';
    const customValue=mk('textarea');customValue.setAttribute('aria-label','新字段内容');
    const customScope=mk('p','meta');
    const customSave=mk('button','primary','保存新字段'),customCancel=mk('button',null,'取消');
    newForm.append(mk('label',null,'字段名称'),customName,mk('label',null,'别名（选填）'),customAliases,mk('label',null,'字段内容'),customValue,customScope,customSave,customCancel);

    const recordbox = mk('div', 'recordbox'); recordbox.hidden = true;
    const recordLabel = mk('label', null, '选择具体哪一段，或设为该模块通用');
    const recordSelect = document.createElement('select');
    recordbox.append(recordLabel, recordSelect);
    const recbox = mk('details', 'recbox');
    const recTitle = mk('summary', 'ttl', '常用资料推荐');
    const recList = mk('div', 'reclist'); recbox.append(recTitle, recList);
    const ta = document.createElement('textarea'); ta.placeholder = '可直接手动输入，也可点「AI生成」。写入成功后会自动记为常用资料；你修改后的版本也会以本次最终写入内容为准。';

    const row1 = mk('div', 'row');
    const btnGen = mk('button', null, 'AI生成'), btnAgain = mk('button', null, '换一版');
    const sp1 = mk('span', 'spacer');
    row1.append(btnGen, btnAgain, sp1);

    // 写入与结果提示固定在顶部，内容区滚动不影响主操作。
    // 主按钮是“粘贴到当前字段”：把建议写进网页控件，并按引擎的读回校验确认网页真的收下了。
    // 复制降为副按钮，保留“不想直接改网页、只拿文字”的用法。
    // 两者都贴着文本框排：标题栏只有 278px 宽，塞三个按钮会把标题压成竖排。
    const btnPaste = mk('button', 'primary', '写入当前字段');
    const btnCopy = mk('button', null, '复制');
    const rowFill = mk('div', 'row fill');
    rowFill.append(btnPaste, btnCopy);

    const row2 = mk('div', 'row');
    const btnSaveAns = mk('button', null, '保存为常用');
    const btnLocate = mk('button', null, '定位网页字段');
    const sp2 = mk('span', 'spacer');

    row2.append(btnNewField, btnSaveAns, btnLocate, sp2);

    const status = mk('p', 'meta');
    const details = document.createElement('details');
    const sum = document.createElement('summary'); sum.textContent = '这次会发送哪些内容给 AI';
    const pre = document.createElement('pre');
    details.append(sum, pre);

    const actions = mk('div', 'actions');
    const conversion = mk('div', 'conversion'); conversion.hidden = true;
    const conversionText = mk('div', 'conversion-text');
    const salaryPolicy = document.createElement('select');salaryPolicy.setAttribute('aria-label','区间转换为单值的方式');
    for(const [v,t] of [['lower','取下限'],['midpoint','取中值'],['upper','取上限']])salaryPolicy.append(new Option(t,v));
    salaryPolicy.value='lower';salaryPolicy.hidden=true;conversion.append(conversionText,salaryPolicy);
    const confirmNewField=mk('button',null,'确认为新字段');confirmNewField.className='confirm-new-field';confirmNewField.setAttribute('aria-pressed','false');
    const fieldActions=mk('div','row field-actions');fieldActions.append(confirmNewField);
    const lockSegment=document.createElement('button');lockSegment.className='lock-segment';lockSegment.textContent='只在本具体段内识别';lockSegment.setAttribute('aria-pressed','false');
    const segmentMode=document.createElement('div');segmentMode.className='row segment-mode';segmentMode.append(lockSegment);
    lockLabel.hidden=true;
    actions.append(rowFill,fieldActions,segmentMode,lockLabel,status,conversion);
    const scopebox = mk('details', 'scopebox');scopebox.open=true;
    const scopeTitle = mk('summary', null, '资料归属与经历选择');scopebox.append(scopeTitle,modulebox,recordbox);
    const advanced = mk('details','advanced');advanced.append(mk('summary',null,'AI 生成选项与问题'),lStyle,selStyle,lLen,inpLen,lQ,inpQ,details);
    bd.append(scopebox,mk('label','content-label','待写入内容'),ta,row1,recbox,advanced,row2,newForm,customBox);
    card.append(hd,actions,bd);
    shadow.append(style, trigger, card);

    const mount = () => (document.body || document.documentElement).appendChild(host);
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });

    els = { trigger, card, modulebox, moduleSelect, recordbox, recordSelect, recbox, recList, selStyle, inpLen, inpQ, ta, btnGen, btnAgain, btnPaste, btnCopy, btnSaveAns, btnLocate, status, pre, title, btnManage, btnSettings, btnClose, conversion, conversionText, salaryPolicy, scopebox, scopeTitle, scopeLock, lockSegment, confirmNewField, btnNewField, newForm, customName, customAliases, customValue, customScope, customSave, customCancel, customBox, customList };
    const savedPosition = root.ResumeStore?.get('aiFloatPosition');
    if (Number.isFinite(savedPosition?.left) && Number.isFinite(savedPosition?.top)) manualPosition = savedPosition;
    wire();
    return host;
  }

  function wire() {
    els.btnClose.onclick = hideCard;
    els.btnManage.onclick = () => root.ResumeProfileEditor?.show?.();
    els.btnSettings.onclick = () => root.ResumeProfileEditor?.show?.('ai');
    els.trigger.onclick = ev => {
      ev.preventDefault(); ev.stopPropagation();
      if (els.card.hidden) openCard(); else hideCard();
    };
    els.btnGen.onclick = () => generate(false);
    els.btnAgain.onclick = () => generate(true);
    els.btnPaste.onclick = pasteIntoField;
    els.salaryPolicy.onchange = refreshConversion;
    els.ta.addEventListener('input',()=>{clearTimeout(els.ta._previewTimer);els.ta._previewTimer=setTimeout(refreshConversion,100);});
    els.btnCopy.onclick = copySuggestion;
    els.btnSaveAns.onclick = saveAsAnswer;
    els.btnLocate.onclick = locateField;

    els.lockSegment.onclick=()=>{
      if(scopeLocked){els.scopeLock.checked=false;els.scopeLock.onchange();return;}
      if(scopeSelection(currentField).mode!=='record'){els.scopebox.open=true;setStatus('先在下面选择资料模块和具体一段经历，再点“只在本具体段内识别”。','warn');els.moduleSelect.focus();return;}
      els.scopeLock.checked=true;els.scopeLock.onchange();
    };
    els.scopeLock.onchange=()=>{
      scopeLocked=els.scopeLock.checked;lockedGroup=els.moduleSelect.value;
      const raw=els.recordSelect.value;
      if(raw)selectedRecordByGroup[lockedGroup]=raw==='__module__'?raw:Number(raw);
      persistScope();semanticToken++;refreshModuleSelector(currentField);
      els.ta.value=profileSuggestion(currentField)?.value||'';
      refreshRecommendations(currentField);renderSavedFields();
      setStatus(scopeLocked?'已限定所选模块 / 阶段。之后点击字段只在这个范围内识别。':'已开启自动识别模块和网页阶段。','ok');
    };
    els.btnNewField.onclick=()=>openNewField();
    els.confirmNewField.onclick=()=>{
      if(!current?.isConnected){setStatus('请先点击网页中要填写的新字段。','warn');return;}
      confirmedNewField=!confirmedNewField;semanticToken++;currentRecommendationId='';refreshNewFieldButton();
      setStatus(confirmedNewField?'已确认为新字段：'+(currentField?.label||els.inpQ.value)+'。填写内容后点“写入并保存新字段”，写入成功即保存。':'已取消新字段确认，恢复正常匹配。','ok');
    };
    els.customCancel.onclick=()=>{els.newForm.hidden=true;};
    els.customSave.onclick=saveNewField;
    els.moduleSelect.onchange = () => {
      semanticToken++;lockedGroup=els.moduleSelect.value;persistScope();
      refreshRecordSelector(currentField, els.moduleSelect.value);
      const suggestion = profileSuggestion(currentField);
      if (suggestion) els.ta.value = suggestion.value;
      else if (els.moduleSelect.value !== 'global') els.ta.value = '';
      refreshRecommendations(currentField);renderSavedFields();refreshScopeTitle();refreshConversion();
    };
    els.recordSelect.onchange = () => {
      const info = recordGroupInfo(currentField, els.moduleSelect.value);
      if (!info) return;
      const raw = els.recordSelect.value;
      selectedRecordByGroup[info.group] = raw === '__module__' ? '__module__' : (raw === '' ? null : Number(raw));
      scopeLocked=true;lockedGroup=els.moduleSelect.value;els.scopeLock.checked=true;
      semanticToken++;persistScope();
      currentRecommendationId = '';
      const suggestion = profileSuggestion(currentField);
      if (suggestion) {
        els.ta.value = suggestion.value;
        setStatus('已切换到：' + (els.recordSelect.selectedOptions[0]?.textContent || '当前资料') + '。当前字段已取这段资料，可直接写入。', 'ok');
      } else {
        els.ta.value = '';
        if (raw === '') setStatus('请先选择具体哪一段，或选择“模块通用”。', 'warn');
        else setStatus('当前选择下没有已保存内容，可手动填写或用 AI 生成。', 'warn');
      }
      refreshRecommendations(currentField);renderSavedFields();refreshScopeTitle();refreshConversion();
    };
    const hd = els.card.querySelector('.hd');
    hd.addEventListener('pointerdown', ev => {
      if (ev.button !== 0 || ev.target.closest?.('button')) return;
      const rect = els.card.getBoundingClientRect();
      drag = { x: ev.clientX, y: ev.clientY, left: rect.left, top: rect.top };
      ev.preventDefault();
    });
    document.addEventListener('pointermove', ev => {
      if (!drag) return;
      manualPosition = { left: drag.left + ev.clientX - drag.x, top: drag.top + ev.clientY - drag.y };
      positionCard();
      ev.preventDefault();
    }, true);
    document.addEventListener('pointerup', () => {
      if (!drag) return;
      drag = null;
      root.ResumeStore?.set('aiFloatPosition', manualPosition);
    }, true);
    // 事件必须在 shadow 边界停掉，否则页面脚本会以为用户正在编辑并触发校验/重渲染。
    for (const type of ['click', 'input', 'change', 'keydown', 'keyup', 'focusin', 'focusout']) {
      shadow.addEventListener(type, ev => ev.stopPropagation());
    }
    document.addEventListener('scroll', () => { if (!els.card.hidden) positionCard(); }, true);
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') hideCard(); }, true);
    // 新交互：页面里不再生成任何跟随输入框的小按钮。
    // 用户先点一个字段，助手只记住“当前字段”；真正的入口始终固定在右下角。
    const offer = ev => {
      const source = ev.target;
      if (writing || suspended || !source || host?.contains(source)) return;
      const target = controlRootFor(source);
      if (!target) return;
      if (target !== current) attachTo(target);
    };
    document.addEventListener('click', offer, true);
    document.addEventListener('focusin', ev => { if (ev.isTrusted) offer(ev); }, true);
    const reposition = () => { positionTrigger(); if (!els.card.hidden) positionCard(); };
    window.addEventListener('resize', reposition, true);
    document.addEventListener('scroll', reposition, true);
  }

  // 点到的节点未必是引擎登记的那个：点选组登记的是外层容器（.phoenix-radio-group），
  // 无 input 的下拉/弹层控件登记的是触发器，日期弹层登记的又是另一个 input。
  // 所以先看「点到的就是登记节点」，再沿 DOM 上溯找登记节点——点选、日期、下拉才能全覆盖。
  function controlRootFor(source) {
    if (!source || typeof source.closest !== 'function') return null;
    // 日历格子属于弹层，不是另一个待填写字段。
    if (source.closest('.ant-picker-dropdown,.el-picker-panel,.arco-picker-dropdown,.phoenix-calendar,.constant-main-selector-container,.area-selector-container,.phoenix-selectList__contentWraper,.ant-select-dropdown,.el-select-dropdown,.common-unmodeled-layer')) return null;
    const hit = registeredRootFor(source);
    if (hit) return hit;
    // 登记表要 scan() 之后才有内容：首屏还没扫过时，点选组、下拉、日期都认不出来。
    // 解析失败才补扫，并按节流兜底，免得在页面别处乱点时反复全页扫描。
    rescan();
    return registeredRootFor(source) || untrackedInputFor(source);
  }

  function registeredRootFor(source) {
    if (registeredControl(source)) return source;
    for (let node = source.parentElement, depth = 0; node && depth < 12; node = node.parentElement, depth++) {
      if (registeredControl(node)) return node;
    }
    // 图标/边框是 input 的兄弟节点，沿祖先查登记节点无法命中；
    // 只在单个控件容器内找，范围控件则要求点中明确的一端。
    const endpoint = source.closest('.ant-picker-input,.ant-picker,.el-date-editor,.arco-picker,.phoenix-select,[class*="sd-Input-container"],.ant-select-selector');
    const label = source.closest('label');
    const box = endpoint || source.closest('.ant-form-item-label,.el-form-item__label') || label;
    if (box) {
      const scope = box.matches('.ant-form-item-label,.el-form-item__label') ? box.closest('.ant-form-item,.el-form-item') : box;
      const candidates = Array.from(scope?.querySelectorAll('input,textarea,select,[role="combobox"]') || []).filter(registeredControl);
      if (label?.control && registeredControl(label.control)) return label.control;
      if (candidates.length === 1) return candidates[0];
    }
    return null;
  }

  // 引擎没登记的控件：label 指向的输入框，或本身就是能吃文字的输入框。
  function untrackedInputFor(source) {
    const label = source.closest('label');
    const labelled = label?.control || label?.querySelector?.(TEXT_INPUT);
    if (labelled && isOpenQuestion(labelled)) return labelled;
    return isOpenQuestion(source) ? source : null;
  }

  function registeredControl(el) {
    try { return !!root.ResumePage?.fieldIdForElement?.(el); } catch { return false; }
  }

  function rescan() {
    const now = Date.now();
    if (now - lastScanAt < 800) return;
    lastScanAt = now;
    try { root.ResumePage.scan(); } catch { /* 扫不了就按「没登记」处理，不影响文本框 */ }
  }

  function isOpenQuestion(el) {
    if (!el || !el.isConnected || el.disabled || el.closest?.('[data-resume-panel],[data-resume-profile],[data-resume-results],[data-resume-ai]')) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return true;
    if (tag !== 'INPUT') return false;
    const type = (el.type || 'text').toLowerCase();
    return !['hidden', 'password', 'file', 'button', 'submit', 'reset', 'image'].includes(type);
  }

  // 问题文案：优先用引擎扫描时算好的标签（context · label），拿不到才退回 DOM 推断。
  function questionFor(el, field) {
    let question = '';
    if (field) question = [field.context, field.label].filter(Boolean).join(' · ');
    return question || inferByDOM(el) || '这个开放性问题';
  }

  function domRecordIndex(el) {
    if (!el) return null;
    const card = el.closest?.('.record-item,[data-resume-record],[class*=record-item],[class*=recordItem]');
    const title = card?.querySelector?.('.record-item-title,[class*=record-item-title],[class*=recordItemTitle],.item-title,.record-title,[class*=record-title]')?.textContent || '';
    let m = String(title).match(/[（(]\s*(\d+)\s*[）)]/);
    if (!m) m = String(title).match(/第\s*(\d+)\s*(?:条|段|项)/);
    const n = m ? Number(m[1]) - 1 : NaN;
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  function scanFocusedField(el) {
    try {
      const real = fieldForElement(el, root.ResumePage.scan());
      if (real) {
        // 网页扫描器没拿到模块/序号时，用当前经历卡片标题补齐；不覆盖扫描器已经确定的信息。
        const g = domRepeatGroup(el);
        const idx = domRecordIndex(el);
        if (!real.groupHint && g) real.groupHint = g;
        if (!Number.isInteger(real.recordIndex) && Number.isInteger(idx)) real.recordIndex = idx;
        return real;
      }
    } catch { /* fallback below */ }
    const label = inferByDOM(el) || '当前字段';
    return { id: '', label, labels: [label], semanticLabels: [label], context: '', groupHint: domRepeatGroup(el) || '', recordIndex: domRecordIndex(el) };
  }

  // 点到的元素不一定是引擎登记的那个：点选组的登记元素是外层容器（.phoenix-radio-group），
  // 无 input 的弹层控件登记的是触发器，日期弹层登记的又是另一个 input。
  // 所以先按 id 找，找不到再按“登记元素包含被点中的节点”回溯，点选/日期/下拉才能全覆盖。
  function fieldForElement(el, snap) {
    if (!el || !snap) return null;
    const id = root.ResumePage.fieldIdForElement(el);
    const direct = snap.fields.find(f => String(f.id) === String(id));
    if (direct) return direct;
    for (const f of snap.fields) {
      const node = root.ResumePage.elementOfField(f.id);
      if (!node) continue;
      if (node === el || node.contains?.(el) || el.contains?.(node)) return f;
    }
    return null;
  }

  function inferByDOM(el) {
    if (!el) return '';
    let label = '';
    if (el.id) {
      try { label = (document.querySelector('label[for="' + CSS.escape(el.id) + '"]')?.textContent || '').trim(); } catch (e) { /* noop */ }
    }
    if (!label) {
      const box = el.closest('div,section,li,tr,fieldset,form');
      const lb = box && box.querySelector('label,.label,.form-label,legend,h3,h4,.ant-form-item-label,.el-form-item__label,.semi-form-field-label');
      if (lb) label = (lb.textContent || '').trim();
    }
    if (!label) label = (el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('name') || '').trim();
    return label;
  }

  function engineProfile() {
    const profile = currentProfile();
    return profile?.lists ? root.ResumeProfileV2.toEngineProfile(profile) : profile;
  }

  // 真实招聘站经常把模块标题写成“教育经历(1) / 实习经历（2） / 校内职务(1)”。
  // 引擎上下文偶尔拿不到时，右下角助手必须能直接从当前 DOM 的记录标题兜底，
  // 否则“开始时间/结束时间”这种跨模块重名字段会掉成全局，从而没有任何推荐。
  function moduleFromText(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    const t = raw.replace(/[（(]\s*\d+\s*[）)]/g, '').replace(/(?:删除|编辑|收起|展开|必填项?)/g, '').trim();
    if (/教育|学历|院校|学校/.test(t)) return 'education';
    if (/实习|工作|任职|就业|社会经历|实践经历/.test(t)) return 'work';
    if (/项目|课题/.test(t)) return 'projects';
    if (/校内职务|校内任职|校园|学生工作|学生会|社团|干部|在校实践/.test(t)) return 'campus';
    if (/荣誉|获奖|奖项|奖励/.test(t)) return 'awards';
    if (/证书|资格|资质|培训/.test(t)) return 'certificates';
    if (/家庭|亲属|家属/.test(t)) return 'family';
    if (/专业技能/.test(t)) return 'professionalSkills';
    if (/计算机|电脑|软件技能/.test(t)) return 'computerSkills';
    if (/语言|外语|英语/.test(t)) return 'languages';
    return '';
  }

  function domRepeatGroup(el) {
    if (!el) return '';
    // 先看当前经历卡片自己的标题，这是最可靠的。兼容用户发来的 Wintalent/大易页面：.record-item-title。
    const card = el.closest?.('.record-item,[data-resume-record],[class*=record-item],[class*=recordItem]');
    const ownTitle = card?.querySelector?.('.record-item-title,[class*=record-item-title],[class*=recordItemTitle],.item-title,.record-title,[class*=record-title]');
    let g = moduleFromText(ownTitle?.textContent || '');
    if (g) return g;
    // 再向上找模块标题；只看短文本，避免整张表单的文字把字段误分到家庭等无关模块。
    for (let node = el.parentElement, depth = 0; node && depth < 16; node = node.parentElement, depth++) {
      const candidates = Array.from(node.children || []).filter(x => x !== el && !x.contains?.(el)).slice(0, 16);
      for (const c of candidates) {
        const txt = String(c.textContent || '').replace(/\s+/g, ' ').trim();
        if (!txt || txt.length > 40) continue;
        g = moduleFromText(txt);
        if (g) return g;
      }
    }
    return '';
  }

  // 把“字段名称的不同说法”归一到更稳定的语义形态。不是用一个大正则猜答案，
  // 而是在已经知道模块后，帮助“企业名称≈公司名称、岗位≈职位、起始日期≈开始时间”这类同义词命中。
  function fuzzyFieldText(value) {
    let s = normLabel(value)
      .replace(/^(请输入|请选择|请填写|请录入|请补充|请说明|本人|您的|个人)/, '')
      .replace(/(信息|详情)$/g, '');
    const pairs = [
      [/院校|高校|大学名称/g, '学校'],
      [/企业|单位|雇主/g, '公司'],
      [/岗位|职务/g, '职位'],
      [/起始|起点|入职|入校|入学|就读开始|任职开始|工作开始|实习开始/g, '开始'],
      [/截止|终止|到期|离职|离校|毕业|就读结束|任职结束|工作结束|实习结束/g, '结束'],
      [/年月日|年月|日期/g, '时间'],
      [/职责描述|岗位职责|工作职责|主要职责|工作内容|主要工作|负责内容/g, '描述'],
      [/奖励|获奖|荣誉/g, '奖项'],
      [/颁发机构|发证机构|授予单位|发证单位/g, '颁发单位'],
      [/语种/g, '语言'],
      [/得分|分数/g, '成绩'],
      [/熟练程度|掌握程度|熟练度|等级/g, '水平'],
      [/所在部门|部门名称/g, '部门'],
      [/专业名称|所学专业|毕业专业/g, '专业'],
      [/学校名称|毕业院校/g, '学校'],
      [/公司名称|企业名称|单位名称/g, '公司'],
      [/职位名称|岗位名称/g, '职位'],
      [/项目名/g, '项目名称'],
      [/组织机构|社团名称|学生组织/g, '组织名称'],
    ];
    for (const [re, to] of pairs) s = s.replace(re, to);
    return s;
  }

  function fuzzyFieldScore(label, alias) {
    const a = fuzzyFieldText(label), b = fuzzyFieldText(alias);
    if (!a || !b) return 0;
    if (a === b) return 130;
    if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) >= 2 ? 105 : 0;
    // 两个短中文字段至少共享两个连续字符才允许模糊命中，避免“时间”误撞到所有日期。
    let common = 0;
    for (let i = 0; i < a.length - 1; i++) if (b.includes(a.slice(i, i + 2))) common++;
    return common ? 70 + Math.min(20, common * 5) : 0;
  }

  // 多段经历不允许“猜第一段”。即使“证明人/联系人/备注”不在固定字段表里，
  // 只要它位于某个重复经历区块，也要继承该经历的作用域，保存/推荐不能跨段。
  function inferRepeatGroup(field) {
    // 基本信息已经被引擎确定，不能再被后面的经历标题归到重复模块。
    if (field?.basicKey) return '';
    const labelText = String(field?.label || '').trim();
    // 先看字段名本身。字段名是最可靠的信号，避免 DOM 邻近文本把“荣誉”误分进家庭等模块。
    const labelRules = [
      ['education', /^(学校|院校|学院|专业|学历|学位|入学时间|毕业时间|主修课程|专业排名|教育经历|教育背景)$/],
      ['work', /^(公司|公司名称|实习单位|工作单位|职位|岗位|部门|工作地点|入职时间|离职时间|工作描述|工作内容|工作职责|离职原因|证明人|推荐人|实习经历|工作经历)$/],
      ['projects', /^(项目名称|项目角色|项目职责|项目描述|项目时间|项目成果|项目经历|项目经验)$/],
      ['campus', /^(组织名称|社团名称|校园职务|学生干部职务|校园经历描述|校园经历|学生工作)$/],
      ['awards', /^(荣誉|荣誉奖项|奖项荣誉|获奖情况|个人荣誉|主要荣誉|奖项名称|获奖时间|颁奖单位|奖项级别|获奖描述)$/],
      ['certificates', /^(证书|资格证书|证书名称|证书编号|发证机构|发证时间|培训经历)$/],
      ['family', /^(与本人关系|家庭成员姓名|亲属姓名|家庭成员工作单位|家庭成员职务|家庭成员|家庭关系)$/],
      ['professionalSkills', /^(专业技能|专业技能名称|专业技能熟练度)$/],
      ['computerSkills', /^(计算机技能|软件技能|软件名称|使用年限|软件熟练度)$/],
      ['languages', /^(语言能力|外语能力|语言名称|语言等级|语言证书|语言成绩)$/],
    ];
    for (const [group, re] of labelRules) if (re.test(labelText)) return group;
    const domGroup = domRepeatGroup(current);
    if (domGroup) return domGroup;
    // v2.6.8：只要引擎已经识别出“模块 + 字段类型”，就信模块；recordIndex 只决定具体哪一段，
    // 不能再拿“有没有识别出第几段”来决定“是不是教育/工作模块”。
    // 旧版要求 recordIndex 才信 groupHint，会让教育经历里的“入学/毕业时间”等字段退回全局，正是这次回归的根因。
    // 对真正未知字段（没有 fieldKey）仍默认“通用”，由用户手动选择所属模块，避免附近 DOM 文案乱猜。
    if (field?.groupHint && field?.fieldKey && MODULE_TITLE[field.groupHint]) return field.groupHint;
    return '';
  }

  function normLabel(value) {
    return String(value || '').toLowerCase().replace(/[＊*：:()（）\s/_\-]/g, '');
  }

  // 在“用户已经选定模块”的前提下，重新判断这个字段在该模块里到底是什么。
  // 例如网页只写“开始时间”，教育=入学时间、工作=入职时间、项目/校园=开始时间；
  // 不能沿用上一次或错误模块的 fieldKey。这个函数同时覆盖教育/工作/项目/校园/荣誉/证书/技能/语言等所有重复模块。
  function currentRangeSide(group = '') {
    const el = current;
    if (!el) return '';
    const row = el.closest?.('.ant-form-item,.el-form-item,.arco-form-item,.semi-form-field,.t-form__item,.ivu-form-item,.n-form-item,.layui-form-item,.van-field,.MuiFormControl-root,.form-item,.form-group,.field-item,.field-row,.resume-item,.control-group,tr,li');
    if (!row) return '';
    const controls = Array.from(row.querySelectorAll('input,select,[role="combobox"]')).filter(x => {
      if (x.matches?.('input') && /^(checkbox|radio|hidden|button|submit|reset|file|image|range|color)$/.test(String(x.type))) return false;
      return !x.disabled;
    }).filter((x, i, all) => !all.some((o, j) => j < i && o.contains?.(x)));
    if (controls.length < 2) return '';
    const mine = controls.indexOf(el);
    if (mine < 0) return '';
    const ph = String(el.getAttribute?.('placeholder') || el.getAttribute?.('aria-label') || '');
    if (/开始|起始|起点|from/i.test(ph)) return 'start';
    if (/结束|截止|终止|到期|毕业|离校|离职|to/i.test(ph)) return 'end';
    const rowText = [fieldLabelForRange(), row.textContent || ''].join(' ').replace(/\s+/g, ' ');
    const genericTime = /^(时间|日期|年月|时间段|日期段)$/.test(normLabel(currentField?.label || inferByDOM(current)));
    const groupCanRange = !!group && (root.ResumeCore?.groups?.[group]?.fields || []).some(([k]) => k === 'start') && (root.ResumeCore?.groups?.[group]?.fields || []).some(([k]) => k === 'end');
    const rangeSignal = /就读时间|学习时间|在校时间|教育时间|任职时间|工作时间|实习时间|项目时间|活动时间|经历时间|起止时间|起迄时间|时间范围|日期范围|开始.*(?:至|到|~|-|—).*结束|from.*to/i.test(rowText) || (groupCanRange && genericTime);
    if (!rangeSignal) return '';
    if (controls.length === 2) return mine === 0 ? 'start' : 'end';
    if (controls.length % 2 === 0) return mine < controls.length / 2 ? 'start' : 'end';
    return '';
  }

  function fieldLabelForRange() {
    return [currentField?.label, ...(currentField?.semanticLabels || []), inferByDOM(current), current?.getAttribute?.('placeholder'), current?.getAttribute?.('aria-label')].filter(Boolean).join(' ');
  }

  function resolveFieldKeyForGroup(field, group) {
    if (!group || group === 'global' || !root.ResumeCore?.groups?.[group]) return '';
    const rangeSide = currentRangeSide(group);
    // 范围控件的左右端点比旧扫描结果更可靠：同一个“就读时间”行里的两个输入框必须分别对应 start/end。
    if (rangeSide && root.ResumeCore.groups[group]?.fields?.some(([key]) => key === rangeSide)) return rangeSide;
    if (field?.groupHint === group && field?.fieldKey) return field.fieldKey;
    const def = root.ResumeCore.groups[group];
    const rawLabels = [
      field?.label,
      ...(scopeLocked ? [] : (Array.isArray(field?.labels) ? field.labels : [])),
      scopeLocked ? (field?.label ? '' : inferByDOM(current)) : inferByDOM(current),
      // context 往往是“教育经历 · 开始时间”，只取最后一段，避免模块标题本身干扰字段判断。
      scopeLocked ? '' : String(field?.context || '').split(/[·>|｜]/).at(-1),
    ].filter(Boolean);
    const labels = [...new Set(rawLabels.map(normLabel).filter(Boolean))];
    if (!labels.length) return '';
    let best = null, second = null;
    for (const [key, title, aliases] of def.fields || []) {
      const candidates = [title, ...(aliases || [])].filter(Boolean);
      let score = 0;
      for (const l of rawLabels) for (const a of candidates) score = Math.max(score, fuzzyFieldScore(l, a));
      const hit = { key, score };
      if (!best || score > best.score) { second = best; best = hit; }
      else if (!second || score > second.score) second = hit;
    }
    // “时间/名称/描述”这类过短词若没有更具体上下文，不允许靠低分模糊猜。
    // 但用户已经选定模块，且字段是“开始时间/结束时间”等明确方向时可以稳定命中。
    const raw = fuzzyFieldText(rawLabels[0] || '');
    const generic = /^(时间|日期|名称|描述|内容|信息)$/.test(raw);
    if (!best || best.score < 100) return '';
    if (generic && second && best.score - second.score < 25) return '';
    return best.key;
  }

  function recordGroupInfo(field, forcedGroup = '') {
    const group = forcedGroup && forcedGroup !== 'global' ? forcedGroup : inferRepeatGroup(field);
    if (!group) return null;
    const profile = engineProfile();
    const rows = Array.isArray(profile?.[group]) ? profile[group] : [];
    if (!rows.length) return null;
    return { group, rows, fieldKey: resolveFieldKeyForGroup(field, group) };
  }

  function recordTitle(group, row, index) {
    const date = [row.start, row.end].filter(Boolean).join(' ～ ');
    const names = group === 'education' ? [row.school, row.major, row.degree]
      : group === 'work' ? [row.company, row.title]
      : group === 'projects' ? [row.name, row.role]
      : group === 'campus' ? [row.organization, row.title]
      : group === 'awards' ? [row.name, row.level]
      : group === 'certificates' ? [row.name, row.issuer]
      : group === 'family' ? [row.relation, row.name]
      : [row.name, row.title, row.organization, row.company];
    const main = names.filter(Boolean).join(' · ') || ('第 ' + (index + 1) + ' 段');
    return date ? main + '｜' + date : main;
  }

  function recordIdentity(group, row, index) {
    const parts = group === 'education' ? [row.school, row.college, row.major, row.degree, row.start, row.end]
      : group === 'work' ? [row.company, row.department, row.title, row.start, row.end]
      : group === 'projects' ? [row.name, row.role, row.start, row.end]
      : group === 'campus' ? [row.organization, row.department, row.title, row.start, row.end]
      : group === 'awards' ? [row.name, row.issuer, row.date]
      : group === 'certificates' ? [row.name, row.issuer, row.date]
      : group === 'family' ? [row.relation, row.name, row.birthDate]
      : group === 'professionalSkills' ? [row.name, row.level]
      : group === 'computerSkills' ? [row.category, row.useTime, row.level]
      : group === 'languages' ? [row.language, row.certificateName, row.level]
      : [row.name, row.title, row.organization, row.company, row.start, row.end];
    const stable = parts.map(x => String(x || '').trim()).filter(Boolean).join('|');
    return stable || ('index:' + index);
  }

  function scopeSelection(field) {
    const group = els.moduleSelect?.value || 'global';
    if (group === 'global') return { mode: 'global', scope: null, group: 'global' };
    const info = recordGroupInfo(field, group);
    const raw = els.recordSelect?.value ?? '';
    if (raw === '__module__') return {
      mode: 'module', group,
      scope: { group, recordIndex: null, recordKey: '__module__', recordLabel: (MODULE_TITLE[group] || group) + ' · 通用' },
    };
    const idx = raw === '' ? null : Number(raw);
    if (!info || !Number.isInteger(idx) || !info.rows[idx]) return { mode: 'pending', group, scope: null };
    const row = info.rows[idx];
    return {
      mode: 'record', group,
      scope: { group, recordIndex: idx, recordKey: recordIdentity(group, row, idx), recordLabel: recordTitle(group, row, idx) },
    };
  }

  function currentRecordScope(field) { return scopeSelection(field).scope; }

  function refreshModuleSelector(field) {
    if (!els.moduleSelect) return;
    const inferred = scopeLocked ? lockedGroup : inferRepeatGroup(field);
    els.moduleSelect.value = inferred && MODULE_TITLE[inferred] ? inferred : 'global';
    refreshRecordSelector(field, els.moduleSelect.value);
  }

  function refreshRecordSelector(field, forcedGroup = '') {
    const group = forcedGroup || els.moduleSelect?.value || 'global';
    if (!group || group === 'global') { els.recordbox.hidden = true; els.recordSelect.replaceChildren(); return; }
    const info = recordGroupInfo(field, group);
    els.recordbox.hidden = false;
    els.recordSelect.replaceChildren();
    const rows = info?.rows || [];
    let preferred = null;
    const domIndex = domRecordIndex(current);
    if (scopeLocked && (selectedRecordByGroup[group] === '__module__' || (Number.isInteger(selectedRecordByGroup[group]) && rows[selectedRecordByGroup[group]]))) preferred=selectedRecordByGroup[group];
    else if (Number.isInteger(domIndex) && rows[domIndex]) preferred = domIndex;
    else if (field?.recordIndex != null && inferRepeatGroup(field) === group && Number.isInteger(field.recordIndex) && rows[field.recordIndex]) preferred = field.recordIndex;
    else if (selectedRecordByGroup[group] === '__module__') preferred = '__module__';
    else if (Number.isInteger(selectedRecordByGroup[group]) && rows[selectedRecordByGroup[group]]) preferred = selectedRecordByGroup[group];
    else if (rows.length === 1) preferred = 0;

    if (preferred == null && rows.length > 1) els.recordSelect.append(new Option('请选择具体一段，或选择“模块通用”', ''));
    els.recordSelect.append(new Option((MODULE_TITLE[group] || group) + ' · 模块通用', '__module__'));
    rows.forEach((row, i) => els.recordSelect.append(new Option(recordTitle(group, row, i), String(i))));
    els.recordSelect.value = preferred == null ? (rows.length > 1 ? '' : '__module__') : String(preferred);
    if (preferred != null) selectedRecordByGroup[group] = preferred;
  }

  // 把当前 profile 跟这个问题相关的部分切出来。宁少勿多，且过隐私闸。
  function profileSlice() {
    const selection=scopeSelection(currentField);
    if(scopeLocked && selection.group!=='global'){
      if(selection.mode==='pending')return '';
      const profile=engineProfile();
      const stored=currentProfile();
      const value=selection.mode==='record'?profile[selection.group]?.[selection.scope.recordIndex]:(profile[selection.group]||stored?.singles?.[selection.group]);
      return ai.scrubValue(JSON.stringify(value||{}));
    }
    const slice = root.ResumeProfileAI ? root.ResumeProfileAI.sliceForQuestion(els.inpQ.value) : '';
    return ai.scrubValue(slice);
  }

  function attachTo(el) {
    ensure();
    if (suspended) return;
    if (!el) { els.trigger.style.display = 'none'; current = null; currentField = null; hideCard(); return; }
    if (current !== el) { confirmedNewField=false;refreshNewFieldButton();els.salaryPolicy.value='lower'; els.ta.value = ''; currentRecommendationId = ''; setStatus(''); }
    current = el;
    positionTrigger();
    const field = scanFocusedField(el);
    currentField = field;
    els.title.textContent = field?.label || inferByDOM(el) || '当前字段';
    els.title.title = questionFor(el,field);
    els.inpQ.value = questionFor(el, field);
    // 字数上限从岗位预设里找（如果这个问题恰好是预设里的经典问法）
    const role = context.presetBundle().role;
    const q = els.inpQ.value;
    const preset = role?.questions?.find(x => q.includes(x.key) || x.key.includes(q.slice(0, 4)));
    els.inpLen.value = preset?.limit || '';
    refreshModuleSelector(field);
    const suggestion = confirmedNewField ? null : profileSuggestion(field);
    if (confirmedNewField) {setStatus('已确认为新字段。填好内容后写入即保存。','ok');}
    else if (suggestion) {
      els.ta.value = suggestion.value;
      setStatus('已从当前简历匹配到：' + suggestion.label + '。可直接写入，也可改成常用答案/AI内容。', 'ok');
    } else if (!ai.isConfigured()) {
      setStatus('没有可靠现成内容。你可以手动填写并保存；配置 AI 后还可生成。', 'warn');
    } else {
      setStatus('没有可靠现成内容。可选常用推荐、AI生成或手动填写。');
    }
    semanticToken++;refreshRecommendations(field);renderSavedFields();
  }

  function profileSuggestion(field) {
    try {
      const profile = currentProfile();
      if (!profile) return null;
      const simple = profile.lists ? root.ResumeProfileV2.toEngineProfile(profile) : profile;
      const selectedGroup = els.moduleSelect?.value || 'global';
      const info = selectedGroup === 'global' ? null : recordGroupInfo(field, selectedGroup);
      if (info) {
        const raw = els.recordSelect?.value;
        const idx = (raw === '' || raw === '__module__') ? null : Number(raw);
        // 多段资料且网页没有可靠 recordIndex 时，必须等用户选，绝不偷偷拿第 1 条。
        if (!Number.isInteger(idx)) return null;
        const row = simple?.[info.group]?.[idx];
        const fieldKey = info.fieldKey || resolveFieldKeyForGroup(field, info.group);
        const value = fieldKey ? row?.[fieldKey] : '';
        if (String(value ?? '').trim()) return { label: recordTitle(info.group, row, idx) + ' · ' + (field?.label || fieldKey), value: String(value) };
        return null;
      }
      if(selectedGroup!=='global' && root.ResumeCore.groups[selectedGroup])return null;
      const values = root.ResumeCore.entries(simple).filter(v => v.value.trim() && (selectedGroup==='global'||v.group==='basics'));
      const key = root.ResumeCore.match(field, values);
      const found = values.find(v => v.key === key);
      return found ? { label: found.label, value: found.value } : null;
    } catch { return null; }
  }

  function positionTrigger() {
    if (!els.trigger) return;
    els.trigger.style.display = suspended ? 'none' : 'flex';
    els.trigger.style.right = '18px';
    els.trigger.style.bottom = '18px';
    els.trigger.style.left = '';
    els.trigger.style.top = '';
  }

  function openCard() {
    ensure();
    if (suspended) return;
    const active = controlRootFor(document.activeElement);
    if (active && (!current || !current.isConnected)) attachTo(active);
    els.card.hidden = false;
    if (!current || !current.isConnected) {
      current = null; currentField = null;
      els.title.textContent = '一键写入助手 · 未选择字段';
      els.inpQ.value = '';
      els.moduleSelect.value = scopeLocked ? lockedGroup : 'global';
      refreshRecordSelector(null,els.moduleSelect.value);
      els.recordbox.hidden = els.moduleSelect.value==='global';
      els.recbox.hidden = true;
      setStatus('请先点击网页里要填写的输入框，再回到这里选择常用内容、AI生成或手动输入。', 'warn');
    }
    // 不自动调用 AI：打开时先展示本地/历史推荐，用户明确点“AI生成”才发请求。
    renderSavedFields();refreshScopeTitle();positionCard();
  }

  function hideCard() { if (els.card) els.card.hidden = true; }

  function positionCard() {
    const w = els.card.offsetWidth || Math.min(360,window.innerWidth-24), h = els.card.offsetHeight || Math.min(window.innerHeight * .86, 780);
    const left = manualPosition?.left ?? (window.innerWidth - w - 18);
    const top = manualPosition?.top ?? (window.innerHeight - h - 88);
    els.card.style.left = Math.max(8, Math.min(left, window.innerWidth - w - 8)) + 'px';
    els.card.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + 'px';
  }

  function setSuspended(value) {
    suspended = !!value;
    if (suspended) { hideCard(); current = null; currentField = null; }
    positionTrigger();
  }

  function setStatus(text, cls) {
    if (!els.status) return;
    els.status.textContent = text;
    els.status.className = 'meta' + (cls ? ' ' + cls : '');
    refreshScopeTitle();
    refreshConversion();
  }

  function refreshNewFieldButton(){
    if(!els.confirmNewField)return;
    els.confirmNewField.textContent=confirmedNewField?'已确认新字段（点此取消）':'确认为新字段';
    els.confirmNewField.setAttribute('aria-pressed',String(confirmedNewField));
    els.btnPaste.textContent=confirmedNewField?'写入并保存新字段':'写入当前字段';
  }

  function refreshScopeTitle(){
    if(!els.scopeTitle)return;
    const group=els.moduleSelect?.selectedOptions?.[0]?.textContent||'全局通用';
    const record=els.recordSelect?.selectedOptions?.[0]?.textContent||'';
    if(els.lockSegment){
      const selection=scopeSelection(currentField);
      els.lockSegment.textContent=scopeLocked?(selection.mode==='record'?'已限定本具体段 · 解除':'已限定所选模块 · 解除'):'只在本具体段内识别';
      els.lockSegment.setAttribute('aria-pressed',String(scopeLocked));
    }
    els.scopeTitle.textContent=(scopeLocked?'当前限定范围 · ':'自动识别范围 · ')+group+(els.recordbox.hidden?'':' · '+record.split('｜')[0]);
  }

  function refreshConversion(){
    if(!els.conversion)return;
    if(!writing)els.btnPaste.disabled=!current?.isConnected||!els.ta.value.trim();
    els.conversion.hidden=true;els.salaryPolicy.hidden=true;
    if(!current?.isConnected||!els.ta.value.trim()||!root.ResumePage?.previewValue)return;
    const convertible=['salary','expectedAnnualSalary','currentSalary'].includes(currentField?.basicKey)||['annualSalary','monthlySalary','useTime'].includes(currentField?.fieldKey)||/薪酬|薪资|工资|年薪|月薪|期望待遇/.test(currentField?.label||'');
    if(!convertible)return;
    try{
      const snap=root.ResumePage.scan();const field=fieldForElement(current,snap);if(!field)return;
      const p=root.ResumePage.previewValue({scanId:snap.scanId,id:field.id,value:els.ta.value.trim(),salaryRangePolicy:els.salaryPolicy.value});
      if(!p.salary&&!p.duration)return;
      els.conversion.hidden=false;els.conversion.className='conversion'+(p.error?' warn':'');
      if(p.error){els.conversionText.textContent=p.error;return;}
      if(p.text){els.conversionText.textContent='保留原文：'+p.value;return;}
      const method={lower:'下限',midpoint:'中值',upper:'上限'}[els.salaryPolicy.value];
      els.conversionText.textContent=p.scalar?'将写入 '+p.value+' '+p.unitText+(p.isRange?'（区间 '+p.range+'，取'+method+'）':''):'对应 '+p.range+' '+p.unitText+'；'+(currentField?.custom?'写入时匹配网页薪资档位':p.value!==els.ta.value.trim()?'将写入 '+p.value:'保留原文');
      els.salaryPolicy.hidden=!(p.scalar&&p.isRange);
    }catch{/* 预览不能阻断正常字段选择；写入时仍按引擎报告失败。 */}
  }

  // 主按钮：把建议写进当前控件。写入仍走引擎的 fill()，回读校验不过就如实报失败——
  // 「点了按钮」不等于「网页收下了」，不能靠按钮文案假装成功。
  async function pasteIntoField() {
    if(writing)return;
    const value = els.ta.value.trim();
    if (!value) { setStatus('暂无可粘贴的建议', 'warn'); return; }
    if (!current || !current.isConnected) { setStatus('当前字段已失效，请重新点一次', 'warn'); return; }
    const saveAsNew=confirmedNewField;
    writing=true;els.ta.disabled=true;els.btnPaste.disabled = true;els.confirmNewField.disabled=true;
    try {
      const snap = root.ResumePage.scan();
      const field = fieldForElement(current, snap);
      if (!field) throw new Error('这个控件没被识别成可填写字段，请手动粘贴');
      const selection = scopeSelection(field);
      if (selection.mode === 'pending') throw new Error('已选择“' + (MODULE_TITLE[selection.group] || selection.group) + '”模块，请先选择具体哪一段，或选择“模块通用”，再写入。');
      const result = await root.ResumePage.fill({ scanId: snap.scanId, items: [{ id: field.id, value, salaryRangePolicy:els.salaryPolicy.value }], overwrite: true });
      const report = result?.reports?.[0];
      if (!report?.ok) throw new Error(report?.message || '网页未确认保留该值');
      root.ResumeSupport?.recordSuccess();
      els.btnPaste.textContent = '✓ 已写入';
      const common = answerLib?.save?.({
        label: field?.label || (els.inpQ.value || '').trim(),
        context: field?.context || (els.inpQ.value || '').trim(),
        value, source: saveAsNew ? 'custom' : 'write-confirmed',
        company: context.value('company'), role: context.value('role'), aliases: [els.inpQ.value],
        scope: selection.scope,
        replaceSameField: true,
      });
      if (common?.id) { answerLib.markUsed(common.id, els.inpQ.value); currentRecommendationId = common.id; }
      renderSavedFields();
      const where = selection.scope?.recordLabel || '通用';
      refreshConversion();
      setStatus((saveAsNew?'已写入并保存新字段 · ':'已写入并自动更新为常用资料 · ') + where + '。你手动修改后的最终内容会成为下次推荐版本。', 'ok');
    } catch (e) {
      els.btnPaste.textContent = '未写入';
      setStatus(e.message || '写入失败', 'warn');
    } finally {
      writing=false;els.ta.disabled=false;els.confirmNewField.disabled=false;els.btnPaste.disabled = false;
      refreshConversion();
      clearTimeout(els.btnPaste._timer);
      els.btnPaste._timer = setTimeout(refreshNewFieldButton, 7000);
    }
  }

  async function copySuggestion() {
    const value = els.ta.value.trim();
    if (!value) { setStatus('暂无可复制的建议', 'warn'); return; }
    try {
      if (root.GM_setClipboard) root.GM_setClipboard(value, 'text');
      else await navigator.clipboard.writeText(value);
      els.btnCopy.textContent = '✓ 已复制';
      setStatus('已复制，可粘贴到网页输入框。', 'ok');
    } catch {
      els.ta.focus(); els.ta.select();
      els.btnCopy.textContent = '按 Cmd+C 复制';
      setStatus('浏览器未允许直接复制，已选中文字。', 'warn');
    }
    clearTimeout(els.btnCopy._timer);
    els.btnCopy._timer = setTimeout(() => { els.btnCopy.textContent = '复制'; }, 7000);
  }

  function currentProfile() {
    const activeV2 = root.ResumeProfileV2?.activeProfile?.();
    if (activeV2) return activeV2;
    const store = root.ResumeStore;
    const profiles = store.get('profiles') || [];
    const active = store.get('activeProfile');
    return profiles.find(p => p.id === active) || profiles[0] || globalThis.ResumeDefaultProfile;
  }

  function narrativeField() {
    return current?.tagName === 'TEXTAREA' || current?.isContentEditable ||
      current?.tagName === 'INPUT' && Number(current.getAttribute('maxlength')) >= 120;
  }

  async function scalarRecommendation(question, pslice, aslice, revise) {
    const options = (currentField?.options || []).map(x => x.text || x.label || '').filter(Boolean).slice(0, 30);
    const key = 'field:' + [question, pslice, aslice, options.join('|')].join('|');
    const cached = !revise && ai.cacheGet(key);
    if (cached) return { text: cached, from: '缓存' };
    const messages = [
      { role: 'system', content: '你是简历表单字段助手。只根据提供的候选人资料回答当前字段，绝不猜测或编造。只输出一个适合填写的简短值；若资料不足，严格只输出“资料不足”。若提供网页候选项，只能从候选项中选一个。不要解释。' },
      { role: 'user', content: `字段：${question}\n网页候选：${options.join('、') || '无'}\n相关简历资料：${pslice || '未找到'}\n参考材料：${aslice || '无'}` },
    ];
    els.pre.textContent = messages.map(m => '[role:' + m.role + ']\n' + m.content).join('\n\n');
    const answer = (await ai.chat(messages, { maxTokens: 1024 })).trim();
    if (answer !== '资料不足') ai.cachePut(key, answer);
    return { text: answer, from: 'AI 生成' };
  }

  async function generate(revise) {
    if (busy) return;
    const target = current;
    const targetScope=JSON.stringify(scopeSelection(currentField));
    const question = (els.inpQ.value || '').trim();
    if (!question) { setStatus('请先填入要回答的问题', 'warn'); return; }
    if (ai.isNeverSend('', question)) { setStatus('这个字段包含敏感信息，请直接核对简历资料，不发送给 AI。', 'warn'); return; }
    if (!ai.isConfigured()) { setStatus('还没有配置 AI。请点面板上的「AI 设置」填入 API key。', 'warn'); return; }
    busy = true;
    els.btnGen.disabled = true; els.btnAgain.disabled = true;
    setStatus('正在生成…');
    const limit = Number(els.inpLen.value) || 0;
    const previous = revise ? els.ta.value : '';
    const pslice = profileSlice();
    const aslice = files && !(scopeLocked && els.moduleSelect.value!=='global') ? ai.scrubValue(await files.search(question, 1600)) : '';
    // 预览"将要发送的内容"，让"资料离开本机"这件事对用户可见。
    if (narrativeField()) {
      const preview = context.buildPrompt({ question, limit, style: els.selStyle.value, previous, profileSlice: pslice, attachmentSlice: aslice });
      els.pre.textContent = preview.messages.map(m => '[role:' + m.role + ']\n' + m.content).join('\n\n');
    }
    try {
      const res = narrativeField() ? await context.recommend({
        question, limit, style: els.selStyle.value,
        contextKey: [context.value('company'), context.value('role')].join('|'),
        previous, profileSlice: pslice, attachmentSlice: aslice, force: !!revise,
      }) : await scalarRecommendation(question, pslice, aslice, revise);
      if (current !== target || JSON.stringify(scopeSelection(currentField))!==targetScope) return;
      if (res.text === '资料不足') { els.ta.value = ''; setStatus('AI 未在资料中找到可靠答案，请手动填写或先补充简历资料。', 'warn'); return; }
      els.ta.value = res.text;
      const n = res.text.replace(/\s/g, '').length;
      setStatus(res.from + (aslice ? ' · 已参考知识库' : '') + ' · ' + n + ' 字' + (limit && n > limit ? '（超出上限 ' + (n - limit) + ' 字，可点「换一版」或自己压一下）' : ''), (limit && n > limit) ? 'warn' : 'ok');
      els.btnAgain.disabled = false;
    } catch (e) {
      if (current === target) setStatus(e.message, 'warn');
    } finally {
      busy = false; els.btnGen.disabled = false;
      // 切换字段后保留本地建议，下一次生成仍由用户主动发起。
    }
  }

  function locateField() {
    if (!current) return;
    current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    current.focus?.({ preventScroll: true });
    setStatus('已定位到网页字段。', 'ok');
  }


  function persistScope(){
    root.ResumeStore?.set('aiScopeLocked',scopeLocked);root.ResumeStore?.set('aiLockedGroup',lockedGroup);
    root.ResumeStore?.set('aiSelectedRecords',{...selectedRecordByGroup});
  }
  Object.assign(selectedRecordByGroup,root.ResumeStore?.get('aiSelectedRecords')||{});
  let editingFieldId='', newFieldScope=null, newFieldScopePending=false;
  function openNewField(item){
    editingFieldId=item?.id||'';const selection=scopeSelection(currentField);newFieldScope=selection.scope;newFieldScopePending=selection.mode==='pending';els.newForm.hidden=false;
    els.customName.value=item?.label||currentField?.label||'';
    els.customAliases.value=(item?.aliases||[]).filter(a=>a!==item?.label).join('，');
    els.customValue.value=item?.value||els.ta.value;
    els.customScope.textContent='保存到：'+(item?.scope?.recordLabel||scopeSelection(currentField).scope?.recordLabel||'全局通用');
    els.customSave.textContent=item?'保存修改':'保存新字段';els.customName.focus();
  }
  function saveNewField(){
    const selection=scopeSelection(currentField);
    const existing=editingFieldId?answerLib.all().find(x=>x.id===editingFieldId):null;
    if(editingFieldId&&!existing){setStatus('该字段已被删除，请重新创建。','warn');return;}
    if(!existing&&newFieldScopePending){setStatus('请先选择阶段或模块通用，再保存新字段。','warn');return;}
    try{
      const data={label:els.customName.value.trim(),value:els.customValue.value.trim(),aliases:els.customAliases.value.split(/[,，;；\n]/).map(x=>x.trim()).filter(Boolean),scope:existing?existing.scope:newFieldScope,source:'custom'};
      const item=existing?answerLib.update(existing.id,data):answerLib.save({...data,replaceSameField:true});
      els.newForm.hidden=true;editingFieldId='';renderSavedFields();refreshRecommendations(currentField);
      setStatus('已保存字段：'+item.label+'。可在“已保存字段”中修改、删除，之后在相同阶段匹配。','ok');
    }catch(e){setStatus(e.message||'保存失败','warn');}
  }
  function renderSavedFields(){
    if(!els.customList)return;els.customList.replaceChildren();
    const selection=scopeSelection(currentField);
    const list=selection.mode==='pending'?[]:answerLib.all().filter(x=>answerLib.sameScope(x.scope,selection.scope));
    const summary=els.customBox.querySelector('summary');summary.textContent='已保存字段 · '+(selection.scope?.recordLabel||'全局通用')+'（'+list.length+'）';
    for(const item of list){
      const row=document.createElement('div');row.className='rec';
      const text=document.createElement('div');text.className='txt';
      const title=document.createElement('strong');title.textContent=item.label;
      const val=document.createElement('div');val.className='val';val.textContent=item.value;text.append(title,val);
      const use=document.createElement('button');use.textContent='选用';use.onclick=()=>{els.ta.value=item.value;currentRecommendationId=item.id;setStatus('已选用：'+item.label,'ok');};
      const edit=document.createElement('button');edit.textContent='修改';edit.onclick=()=>openNewField(item);
      const del=document.createElement('button');del.textContent='删除';del.onclick=()=>{answerLib.remove(item.id);if(currentRecommendationId===item.id){currentRecommendationId='';els.ta.value='';}semanticToken++;renderSavedFields();refreshRecommendations(currentField);};
      row.append(text,use,edit,del);els.customList.append(row);
    }
  }

  function saveAsAnswer() {
    const question = (els.inpQ.value || '').trim();
    const text = els.ta.value.trim();
    if (!question || !text) { setStatus('字段名称和内容都需要有值才能保存', 'warn'); return; }
    const selection = scopeSelection(currentField);
    const scope = selection.scope;
    if (selection.mode === 'pending') {
      setStatus('请先选择具体哪一段，或明确选择“模块通用”。不会替你猜归属。', 'warn');
      return;
    }
    try {
      const rec = answerLib?.save?.({
        label: currentField?.label || question,
        context: currentField?.context || question,
        value: text,
        source: 'confirmed',
        company: context.value('company'),
        role: context.value('role'),
        aliases: [question],
        scope,
        replaceSameField: true,
      });
      currentRecommendationId = rec?.id || '';
      const sc = scope;
      setStatus(sc ? ('已保存为常用资料：' + sc.recordLabel + '。') : '已保存为通用常用资料。以后遇到相似字段会优先推荐。', 'ok');
      refreshRecommendations(currentField);renderSavedFields();
    } catch (e) { setStatus(e.message || '保存失败', 'warn'); }
  }


  function renderRecommendations(matches, aiDone = false) {
    if (!els.recList) return;
    els.recList.replaceChildren();
    const visible = (matches || []).filter(x => x.stars >= 3).slice(0, 5);
    els.recbox.hidden = !visible.length;
    if (!visible.length) return;
    for (const m of visible) {
      const row = document.createElement('div'); row.className = 'rec';
      const text = document.createElement('div'); text.className = 'txt';
      const val = document.createElement('div'); val.className = 'val'; val.textContent = m.item.value;
      const sub = document.createElement('div'); sub.className = 'sub';
      sub.textContent = '★'.repeat(m.stars) + '☆'.repeat(5 - m.stars) + ' · 已用 ' + (m.item.useCount || 0) + ' 次' + (m.item.scope?.recordLabel ? ' · ' + m.item.scope.recordLabel : ' · 通用') + (aiDone && m.aiScore != null ? ' · AI语义复核' : '');
      text.append(val, sub);
      const use = document.createElement('button'); use.type = 'button'; use.textContent = '选用';
      use.onclick = () => { els.ta.value = m.item.value; currentRecommendationId = m.item.id; setStatus('已选中常用资料：' + m.item.label + '。点“写入当前字段”即可。', 'ok'); };
      row.append(text, use); els.recList.append(row);
    }
  }

  async function refreshRecommendations(field) {
    if (confirmedNewField) {semanticToken++;els.recbox.hidden=true;return;}
    if (!answerLib || !field) { if (els.recbox) els.recbox.hidden = true; return; }
    const label = field.label || els.inpQ.value || '';
    const ctx = [field.context, context.value('role'), context.value('company')].filter(Boolean).join(' · ');
    const selection = scopeSelection(field);
    const scope = selection.scope;
    const token = ++semanticToken;
    // 用户选了某个模块但还没明确具体段/模块通用时，不推荐任何其它作用域的内容。
    if (selection.mode === 'pending') {
      els.recbox.hidden = true;
      els.recList?.replaceChildren();
      currentRecommendationId = '';
      return;
    }
    const local = answerLib.find(label, ctx, 10, 3, scope);
    renderRecommendations(local, false);
    if (local[0] && local[0].stars >= 4) {
      els.ta.value = local[0].item.value;
      currentRecommendationId = local[0].item.id;
      setStatus('已自动选中常用资料：' + local[0].item.label + '（' + local[0].stars + '★）。点“写入当前字段”即可。', 'ok');
    }
    if (!ai.isConfigured()) return;
    const semanticPool = answerLib.find(label, ctx, 12, 1, scope);
    if (!semanticPool.length) return;
    const ranked = await answerLib.rerankWithAI(label, ctx, semanticPool);
    if (token !== semanticToken || currentField !== field) return;
    renderRecommendations(ranked, true);
    if (ranked[0] && ranked[0].stars >= 4) {
      els.ta.value = ranked[0].item.value;
      currentRecommendationId = ranked[0].item.id;
      setStatus('AI语义复核后已自动选中常用资料：' + ranked[0].item.label + '（' + ranked[0].stars + '★）。点“写入当前字段”即可。', 'ok');
    }
  }

  function annotate() {
    if (suspended) return;
    ensure();
    positionTrigger();
    const ae = controlRootFor(document.activeElement);
    if (ae && ae !== current) attachTo(ae);
  }

  root.ResumeAIUI = { ensure, annotate, attachTo, isOpenQuestion, positionCard, hideCard, setSuspended };
})(typeof globalThis !== 'undefined' ? globalThis : this);
