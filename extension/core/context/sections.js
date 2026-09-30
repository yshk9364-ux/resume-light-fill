function buildSectionMarkers(){
  const list=[]; const seen=new Set();
  const selector='h1,h2,h3,h4,h5,h6,legend,[role="heading"],.title,.form-title,.section-title,.module-title,.panel-title,.resume-title,.item-title,div,span';
  for(const r of roots())for(const el of r.querySelectorAll(selector)){
    const t=(el.textContent||'').trim().replace(/\s+/g,' '); if(!t||t.length>24)continue;
    const canonical=sectionNameFor(t); if(!canonical)continue;
    const key=`${canonical}:${Math.round(el.getBoundingClientRect().top+scrollY)}:${Math.round(el.getBoundingClientRect().left+scrollX)}`;if(seen.has(key))continue;seen.add(key);
    list.push({el,text:canonical,y:el.getBoundingClientRect().top+scrollY,x:el.getBoundingClientRect().left+scrollX});
  }
  return list;
}
function inferContext(el){
  const explicit=el.closest?.('[data-resume-section]')?.getAttribute('data-resume-section');if(ResumeCore.groups[explicit])return ResumeCore.groups[explicit].title;
  const model=el.closest?.('.form-model');
  const modelTitle=model?.querySelector(':scope > .form_com-item-title .form-model-name')?.textContent;
  const modelSection=sectionNameFor(modelTitle);if(modelSection)return modelSection;
  // 弹窗常被挂到 body 末尾，无法继承原区块标题；ARIA 名称是它自己的可靠上下文。
  const dialog=el.closest?.('[role="dialog"],[aria-modal="true"]');
  const dialogName=dialog?.getAttribute('aria-label')||dialog?.querySelector('h1,h2,h3,[role="heading"]')?.textContent;
  const dialogSection=sectionNameFor(dialogName);if(dialogSection)return dialogSection;
  // On some full-page application forms the section heading is a sibling of
  // the whole form block, rather than a heading inside it. Follow the current
  // branch upward and use only an exact known section title from its siblings.
  for(let branch=el,depth=0;branch?.parentElement&&depth<24;branch=branch.parentElement,depth++){
    for(let sibling=branch.previousElementSibling,seen=0;sibling&&seen<4;sibling=sibling.previousElementSibling,seen++){
      const text=shortText(sibling).replace(/[必填*＊]/g,'');
      const canonical=sectionNameFor(text);if(canonical)return canonical;
    }
  }
  // Prefer an actual section title inside a nearby ancestor.
  // Moka nests a control ten levels below its section block (input > label > dropdown > tooltip > item >
  // range wrapper > ctrl > field > fields > block), so a shallow walk never reaches the block's own title.
  for(let parent=el.parentElement,depth=0;parent&&depth<14;parent=parent.parentElement,depth++){
    for(const child of Array.from(parent.children).slice(0,12)){
      if(child===el||child.contains(el))continue;const t=shortText(child).replace(/[必填*＊]/g,'');const canonical=sectionNameFor(t);if(canonical)return canonical;
    }
    const heading=parent.querySelector(':scope > legend,:scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > [role="heading"],:scope > .title,:scope > .form-title,:scope > .section-title,:scope > .module-title,:scope > [class*="blockTitle-"]');
    if(heading){const t=shortText(heading).replace(/[必填*＊]/g,'');const canonical=sectionNameFor(t);if(canonical)return canonical;}
  }
  // Fallback: closest preceding section marker by document Y coordinate. Works well on long resume forms.
  const rect=el.getBoundingClientRect(), y=rect.top+scrollY, x=rect.left+scrollX;
  const candidates=sectionMarkers.filter(m=>m.el.getRootNode()===el.getRootNode()&&(m.el.compareDocumentPosition(el)&4)&&m.y<=y+8).map(m=>({...m,dy:y-m.y,dx:Math.abs(x-m.x)})).filter(m=>m.dy<2400);
  candidates.sort((a,b)=>a.dy-b.dy||a.dx-b.dx);return candidates[0]?.text||'';
}
function nearestText(el){
  const bits=[];
  const container=fieldContainer(el);
  if(container){
    const labelSelectors=CONTAINER_LABEL_SELECTOR;
    try{for(const lab of container.querySelectorAll(labelSelectors)){const t=shortText(lab);if(t)bits.push(t);}}catch{}
  }
  let branch=el; let p=el.parentElement;
  for(let d=0;p&&d<5;p=p.parentElement,d++){
    const direct=Array.from(p.children).filter(x=>x!==branch&&!x.contains(el)&&/^(LABEL|SPAN|DIV|P|DT|TH)$/.test(x.tagName)).map(shortText).filter(Boolean);
    bits.push(...direct.slice(0,4)); branch=p;
  }
  return bits;
}

function directFieldLabels(el){
  const out=[]; const add=v=>{v=String(v||'').trim().replace(/\s+/g,' ');if(v&&v.length<=80&&!out.includes(v))out.push(v);};
  const root=el.getRootNode?.()||document;
  // 表格行通常没有每格的 label；同列 th 才是字段名。优先于宽泛的旁边说明文字。
  const cell=el.closest?.('td,th'),table=cell?.closest('table');
  if(cell&&table){
    const header=table.tHead?.rows?.[table.tHead.rows.length-1]?.cells?.[cell.cellIndex];
    if(header)add(header.textContent);
  }
  // Explicit semantic sources are authoritative. Geometry is only a last-resort fallback;
  // putting a nearby label first can turn an email input into “性别” on dense two-column forms.
  // A <label for="…"> is a real question. A <label> that *wraps* a custom widget is not: its text is
  // whatever the widget currently shows (Moka dropdowns render "男" / "四川" / "请选择" inside the label),
  // so taking it early names the field after a selected option instead of the question.
  const wrapping=[];
  if(el.labels) for(const lab of Array.from(el.labels))(lab.contains?.(el)?wrapping:out).push(shortText(lab));
  for(const id of String(el.getAttribute?.('aria-labelledby')||'').split(/\s+/).filter(Boolean)) add(root.getElementById?.(id)?.textContent||'');
  add(el.getAttribute?.('aria-label')); add(el.getAttribute?.('data-label'));
  const c=fieldContainer(el);
  if(c){
    const sels=CONTAINER_LABEL_SELECTOR;
    try{for(const lab of c.querySelectorAll(sels))add(shortText(lab));}catch{}
    // common two-column row: label immediately before the control wrapper
    let node=el; while(node&&node.parentElement!==c)node=node.parentElement;
    if(node?.previousElementSibling) add(shortText(node.previousElementSibling));
  }
  // placeholders are useful after visible/direct labels. Geometry is used only when no
  // explicit/container label was found, which greatly reduces cross-column misbinding.
  add(el.getAttribute?.('placeholder')); add(el.getAttribute?.('title'));
  for(const t of wrapping) add(t);
  if(!out.length)add(geometricFieldLabel(el));
  return out;
}
function semanticLabelsForField(field){
  // A one-character label is a date part, never a question: split date rows (Moka, Element) render the
  // year/month/day as separate inputs whose placeholder is literally “年”/“月”/“日”. Alias matching is a prefix
  // test, so “月薪税前”.startsWith(“月”) would otherwise make the month box steal 职位月薪. Two-character labels
  // still match normally; this only drops labels too short to name a field.
  return (field.semanticLabels?.length?field.semanticLabels:field.labels||[]).map(norm).filter(l=>l.length>1);
}
function describe(el,extra=[]){
  const root=el.getRootNode(); const labels=[...extra];
  if(el.labels) labels.push(...Array.from(el.labels).map(shortText));
  const aria=(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>root.getElementById?.(id)?.textContent||'').join(' ');
  labels.push(el.getAttribute('aria-label'),aria,el.getAttribute('placeholder'),el.getAttribute('title'));
  labels.push(...nearestText(el)); labels.push(el.name,el.id);
  const semanticLabels=directFieldLabels(el); return {labels:[...new Set([...semanticLabels,...labels.filter(Boolean).map(x=>String(x).trim()).filter(x=>x.length<=160)])],semanticLabels,context:inferContext(el),autocomplete:(el.autocomplete||'').split(' ').at(-1)};
}
function commonAncestor(nodes){if(!nodes.length)return null;let p=nodes[0].parentElement;while(p){if(nodes.every(n=>p.contains(n)))return p;p=p.parentElement;}return nodes[0].parentElement;}
function questionLabels(anchor,peers=[]){
  const optionTexts=new Set(peers.map(optionLabel).map(norm).filter(Boolean));const out=[];let group=commonAncestor(peers.length?peers:[anchor])||anchor.parentElement;
  for(let p=group,depth=0;p&&depth<5;p=p.parentElement,depth++){
    const query=p.querySelectorAll(CONTAINER_LABEL_SELECTOR+',:scope > p,:scope > span');
    for(const el of query){if(peers.some(n=>el.contains(n)))continue;const t=shortText(el);if(!t||optionTexts.has(norm(t)))continue;if(t.length<=60)out.push(t);}
    let child=group;while(child&&child.parentElement!==p)child=child.parentElement;
    // A neighbouring form column carries its own label and its own widget, so its text ("婚姻状况 未婚")
    // belongs to a different question and must not become this control's label. Only a sibling that is
    // plain label text counts.
    const sibling=child?.previousElementSibling;
    if(sibling&&!sibling.querySelector?.('input,textarea,select,[contenteditable="true"],[role="combobox"],[role="radiogroup"],[role="switch"],.form-item,.ant-radio-wrapper,.el-radio,.phoenix-radio-group,.ant-select,.el-select,.phoenix-select,.ant-cascader,.el-cascader')){const t=shortText(sibling);if(t&&!optionTexts.has(norm(t))&&t.length<=60)out.push(t);}
    group=p;
  }
  // Broad ancestor text often contains several unrelated questions on dense forms. Only
  // use it as a fallback when no direct question label was found and exactly one known
  // question appears in a small local text block.
  if(!out.length){
    const localText=(group?.parentElement?.textContent||group?.textContent||'').replace(/\s+/g,' ').trim();
    if(localText.length<=180){
      const knownQuestions=['是否接受调剂','接受调剂','是否服从调剂','服从调剂','是否独生子女','是否是独生子女','是否为独生子女','是否独生女','是否是独生女','是否为独生女','是否独生子','是否是独生子','是否为独生子','独生子女','独生女','独生子','政治面貌','政治身份','党派','婚姻状况','是否有亲属在本公司任职','是否曾在本公司任职','性别'];
      const hits=knownQuestions.filter(q=>localText.includes(q));if(hits.length===1)out.push(hits[0]);
    }
  }
  return [...new Set(out)];
}
function fieldRequired(el,labels=[]){return !!(el.required||el.getAttribute('aria-required')==='true'||labels.some(x=>/[＊*]|必填/.test(x))||nearestText(el).some(x=>/[＊*]|必填/.test(x)));}
function radioGroup(el){
  if(el.type!=='radio')return [el];
  const container=fieldContainer(el);
  const pool=container?Array.from(container.querySelectorAll('input[type="radio"]')):Array.from(el.getRootNode().querySelectorAll('input[type="radio"]'));
  let peers=pool.filter(x=>!x.disabled&&choiceVisible(x));
  if(el.name){const same=peers.filter(x=>x.name===el.name);if(same.length>=2)peers=same;}
  return peers.length?peers:[el];
}
function optionLabel(el){
  const wrap=el?.closest?.('label,.ant-radio-wrapper,.el-radio,.el-radio-button,.ivu-radio-wrapper,.arco-radio,.semi-radio,.t-radio,.n-radio,.layui-form-radio,.MuiFormControlLabel-root,[role="radio"]');
  return [...Array.from(el?.labels||[]).map(shortText),shortText(wrap),el?.getAttribute?.('aria-label'),el?.getAttribute?.('data-label'),el?.getAttribute?.('data-value'),el?.value].filter(Boolean)[0]||el?.value||'';
}
const MODAL_SELECTOR='.ant-drawer-content,.el-drawer,.arco-drawer,.t-drawer,.n-drawer,.MuiDrawer-paper,.van-popup,[role="dialog"],.ant-modal,.el-dialog,.arco-modal,.semi-modal,.t-dialog,.ivu-modal,.n-modal,.layui-layer,.MuiDialog-root,.modal.show,.modal[style*="display"]';
function visibleDialogs(){
  const out=[];for(const r of roots())for(const d of r.querySelectorAll(MODAL_SELECTOR))if(visible(d,{allowReadonly:true}))out.push(d);return [...new Set(out)];
}
function elementInActiveAddDialog(el){return !!(activeAddTarget?.dialog?.isConnected&&el&&activeAddTarget.dialog.contains(el));}
// A classification label (“证书种类”, “院校类别”, “学历性质”) names a category, not the
// concrete value the field stores. Without this guard the fuzzy prefix rule matches
// “证书种类” to the alias “证书”, which consumes a record slot; the real “证书名称”
// then inherits it and lands on an index the profile does not have. “类型” is deliberately
// absent, because “语言类型” is exactly the language value itself.
const CLASSIFICATION_LABEL=/(类别|种类|性质|分类)$/;
// ATS 字段经常只是在标准叫法外套一层同义词，例如“企业名称/单位名称/雇主”、
// “岗位/职位/职务”、“起始日期/开始时间”。在模块已确定时做一层保守语义归一，
// 让每个标准字段天然拥有模糊别名，而不是每遇到一个网站就手工补一条。
function fuzzySemanticLabel(value){
  let s=norm(String(value||'').replace(/^(请输入|请选择|请填写|请录入|请补充|请说明)/,''));
  const rules=[
    [/院校|高校/g,'学校'],[/企业|单位|雇主/g,'公司'],[/岗位|职务/g,'职位'],
    [/起始|起点|入职|入校|入学|就读开始|任职开始|工作开始|实习开始/g,'开始'],
    [/截止|终止|到期|离职|离校|毕业|就读结束|任职结束|工作结束|实习结束/g,'结束'],
    [/年月日|年月|日期/g,'时间'],
    [/职责描述|岗位职责|工作职责|主要职责|工作内容|主要工作|负责内容/g,'描述'],
    [/奖励|获奖|荣誉/g,'奖项'],[/颁发机构|发证机构|授予单位|发证单位/g,'颁发单位'],
    [/语种/g,'语言'],[/得分|分数/g,'成绩'],[/熟练程度|掌握程度|熟练度|等级/g,'水平'],
    [/所在部门|部门名称/g,'部门'],[/专业名称|所学专业|毕业专业/g,'专业'],
    [/学校名称|毕业院校/g,'学校'],[/公司名称|企业名称|单位名称/g,'公司'],[/职位名称|岗位名称/g,'职位'],
    [/项目名/g,'项目名称'],[/社团名称|学生组织/g,'组织名称']
  ];
  for(const [re,to] of rules)s=s.replace(re,to);
  return s.replace(/(信息|详情)$/,'');
}
function fuzzySemanticScore(label,alias){
  const l=fuzzySemanticLabel(label),a=fuzzySemanticLabel(alias);if(!l||!a)return 0;
  if(l===a)return 9;
  if(l.includes(a)||a.includes(l))return Math.min(l.length,a.length)>=2?8:0;
  return 0;
}
function bestFieldKeyForGroup(field,group){
  const def=ResumeCore.groups[group];if(!def)return null;const labels=semanticLabelsForField(field);let best=null,bestScore=0,second=0;
  for(const [key,,aliases] of def.fields){let local=0;for(const alias of aliases){const a=norm(alias);if(!a)continue;for(const l of labels){if(CLASSIFICATION_LABEL.test(l)&&!CLASSIFICATION_LABEL.test(a))continue;let score=0;if(l===a||l===`请输入${a}`||l===`请选择${a}`)score=10;else if(prefixAliasScore(a,l)>=7)score=7;else score=fuzzySemanticScore(l,a);local=Math.max(local,score);}}if(local>bestScore){second=bestScore;bestScore=local;best=key;}else if(local>second)second=local;}
// ambiguous labels such as “时间/名称/描述” must never win only by a fuzzy substring.
  const generic=labels.some(l=>/^(时间|日期|年月|名称|描述|内容|信息)$/.test(fuzzySemanticLabel(l)));
  return bestScore>=7 && bestScore>second && !(generic&&bestScore<9) ? best : null;
}
// A date range is one row, not two fields. Moka renders a single row titled 就读时间 / 起止时间 holding two
const RANGE_NON_PART=/^(checkbox|radio|hidden|button|submit|reset|file|image|range|color)$/;
// 年+月 dropdown pairs (plus an optional 至今 checkbox), so every part input carries the same label and alias
// scoring cannot separate them. Position inside the row decides: the first pair is the start value and the
// second pair the end value.
function dateRangeSideForField(field){
  const el=registry.get(field.id)?.el;if(!el)return null;
  const row=el.closest?.(FIELD_CONTAINER_SELECTOR);if(!row)return null;
  // 同一行的日期范围既可能是两个完整日期/月输入框，也可能拆成 4/6 个年/月/日控件。
  // 旧逻辑强制要求“至少 4 个控件 + 当前控件必须先被识别成年/月/日”，导致最常见的
  // “就读时间：开始日期 - 结束日期”两端式控件完全无法识别。
  const controls=Array.from(row.querySelectorAll('input,select,[role="combobox"]')).filter(i=>{
    if(i.matches?.('input')&&RANGE_NON_PART.test(String(i.type)))return false;
    return visible(i,{allowReadonly:true});
  }).filter((i,idx,all)=>!all.some((other,j)=>j<idx&&other.contains?.(i)));
  if(controls.length<2)return null;
  const mine=controls.indexOf(el);if(mine<0)return null;

  const ownHint=String(el.getAttribute?.('placeholder')||el.getAttribute?.('aria-label')||'');
  if(/开始|起始|起点|from/i.test(ownHint))return 'start';
  if(/结束|截止|终止|到期|毕业|离校|离职|to/i.test(ownHint))return 'end';

  const labels=[field.label,...(field.semanticLabels||[]),...directFieldLabels(el),shortText(row)]
    .filter(Boolean).join(' ').replace(/\s+/g,' ');
  const groupCanRange=ResumeSchema.contextGroups(field.context).some(g=>{const keys=(ResumeCore.groups[g]?.fields||[]).map(([k])=>k);return keys.includes('start')&&keys.includes('end');});
  const genericTime=/^(时间|日期|年月|时间段|日期段)$/.test(norm(field.label||''))||directFieldLabels(el).some(x=>/^(时间|日期|年月|时间段|日期段)$/.test(norm(x)));
  const rangeSignal=/就读时间|学习时间|在校时间|教育时间|任职时间|工作时间|实习时间|项目时间|活动时间|经历时间|起止时间|起迄时间|时间范围|日期范围|开始.*(?:至|到|~|-|—).*结束|from.*to/i.test(labels)||(groupCanRange&&genericTime);

  // 两端各一个完整控件时，只有在明确是“范围”的行里才按左右拆，避免把同一行两个无关字段误判。
  if(controls.length===2)return rangeSignal?(mine===0?'start':'end'):null;

  // 拆分年/月(/日)范围通常是 4 或 6 个控件。只要行本身是范围，或能识别出至少两个日期部件，
  // 就按前后半段分别归 start / end。
  const partCount=controls.reduce((n,c)=>n+(datePartForEntry({...field,el:c})?1:0),0);
  if(controls.length%2===0&&(rangeSignal||partCount>=2))return mine<controls.length/2?'start':'end';
  return null;
}
