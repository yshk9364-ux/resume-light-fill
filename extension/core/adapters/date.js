// Date parsing and precision are deliberately independent of generic text matching.
 function parseDateValue(value){
  // 招聘页常在日期后追加注解，Moka 的出生日期就是 “2004-02 (22岁)”。不去掉尾巴会直接解析失败，
  // 回读校验永远对不上，日期就永远填不进去。只截末尾一个短括号，不动日期本体。
  const text=String(value??'').trim().replace(/[（(][^（）()]{0,12}[）)]\s*$/,'').trim();
 const m=text.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})(?:\s*[-/.月]\s*(\d{1,2}))?\s*[月日]?$/)||text.match(/^(\d{4})(\d{2})(\d{2})$/);
 if(!m)return null;const year=Number(m[1]),month=Number(m[2]),day=m[3]?Number(m[3]):null;
 if(year<1000||month<1||month>12||day!==null&&(day<1||day>new Date(year,month,0).getDate()))return null;
 return {year,month,day};
}
function datePartForEntry(entry){
 if(['date','month','datetime-local'].includes(entry?.el?.type))return null;
 const labels=[entry?.label,...(entry?.semanticLabels||[])].filter(Boolean).map(x=>String(x).trim().replace(/[＊*:：]/g,''));
 // “开始日期” and “生日” are full dates, not a standalone day component.
 for(const text of labels){
  if(/^(年|year)$/i.test(text)||/年份|年度|\byear\b/i.test(text))return 'year';
  if(/^(月|month)$/i.test(text)||/月份|月度|\bmonth\b/i.test(text))return 'month';
  if(/^(日|day|开始日|结束日)$/i.test(text)||/日份|日期中的日|\bday\b/i.test(text))return 'day';
 }
 // Moka 的“就读时间／起止时间”是一个月份范围组件，内部是 [年][月] - [年][月] 四个独立下拉，
 // 四个控件顶着同一个标签，只能靠各自 input 的 placeholder 区分年月。认不出就会拿 “2022-09”
 // 去年份列表里找，永远匹配不上。
 if(isDateEntry(entry)){
  const ph=String(entry?.el?.getAttribute?.("placeholder")||"").trim();
  if(/^(年|年份|year)$/i.test(ph))return "year";
  if(/^(月|月份|month)$/i.test(ph))return "month";
  if(/^(日|日期|day)$/i.test(ph))return "day";
 }
 return null;
}
function isDateEntry(entry){return ['birthday','graduationDate'].includes(entry?.basicKey)||['start','end','date','birthDate'].includes(entry?.fieldKey);}
function monthControl(el){
 if(el.type==='month')return true;if(el.type==='date')return false;
 const format=el.getAttribute('placeholder')||'';
 if(el.closest?.('.el-date-editor--month,.el-date-editor--monthrange'))return true;
 // WinTalent/Ant Design often uses a normal text input with placeholder="选择日期"
 // even when the popup is actually a month picker. Detect the surrounding picker/panel
 // instead of relying on placeholder text alone. This keeps YYYY-MM profile values from
 // being treated as full-day dates and is shared by education/work/project/campus ranges.
 const antPicker=el.closest?.('.ant-picker');
 if(antPicker){
  const mode=String(antPicker.getAttribute?.('data-picker')||antPicker.getAttribute?.('picker')||'').toLowerCase();
  if(mode==='month')return true;
  if(antPicker.querySelector?.('.ant-picker-month-panel,[class*="month-panel"]'))return true;
  // WinTalent 把面板放在 picker 的兄弟节点，且 placeholder 统一写“选择日期”。
  // 限定到当前表单行，不能借用另一个日期字段的月份面板。
  const row=antPicker.closest('.ant-form-item');
  const pickers=row?Array.from(row.querySelectorAll('.ant-picker')):[];
  if(pickers.length===1&&row.querySelector('.ant-picker-month-panel'))return true;
  // 已选值的精度也是可靠依据，适用于月份弹层尚未挂载的只读控件。
  if(el.readOnly&&/^\d{4}[-/]\d{2}$/.test(String(el.value||el.getAttribute('title')||'').trim()))return true;
 }
 const owner=el.ownerDocument;
 const controls=(el.getAttribute?.('aria-controls')||el.getAttribute?.('aria-owns')||'').split(/\s+/).filter(Boolean);
 for(const id of controls){
  const popup=owner?.getElementById?.(id);
  if(popup?.querySelector?.('.ant-picker-month-panel,[class*="month-panel"]')||/month-panel|month-picker/i.test(String(popup?.className||'')))return true;
 }
 return /yyyy\s*[-/.年]\s*mm/i.test(format)&&!/dd/i.test(format)||/month-picker|monthpicker/.test(String(el.className))||/选择月份|选择年月/.test(format);
}
function normalizedDatePartsForControl(parts,el){
 // Profile dates often only know YYYY-MM. If the website requires a full date,
 // use day 01 as the deterministic placeholder. Real known days are always kept.
 if(!parts)return parts;
 if(parts.day!=null||monthControl(el))return {...parts};
 return {...parts,day:1};
}
function dateCandidates(parts,el){
 const normalized=normalizedDatePartsForControl(parts,el);
 const y=String(normalized.year),m=String(normalized.month).padStart(2,'0'),d=normalized.day==null?null:String(normalized.day).padStart(2,'0');
 const month=monthControl(el),placeholder=el.getAttribute('placeholder')||'';
 const result=month?[`${y}-${m}`,`${y}/${m}`,`${y}.${m}`,`${y}年${normalized.month}月`]:[`${y}-${m}-${d}`,`${y}/${m}/${d}`,`${y}.${m}.${d}`,`${y}年${normalized.month}月${normalized.day}日`];
 if(/yyyy\/mm/i.test(placeholder))result.unshift(month?`${y}/${m}`:`${y}/${m}/${d}`);
 else if(/yyyy\.mm/i.test(placeholder))result.unshift(month?`${y}.${m}`:`${y}.${m}.${d}`);
 return [...new Set(result)];
}
// keepFocus：可搜索下拉靠“边输入边过滤候选”工作，一 blur 菜单立刻关掉，后面再也读不到选项；
// 只有明确要走“键入后失焦提交”的日期/文本路径才默认失焦。
async function forceTextValue(el,value,{keepFocus=false}={}){
  if(el.readOnly)throw new Error('只读日期需要通过日历选择');
 const win=el.ownerDocument.defaultView||window;el.focus?.();
 Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value')?.set?.call(el,value);
 el.dispatchEvent(new win.InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:value}));
  el.dispatchEvent(new win.Event('change',{bubbles:true,composed:true}));
  if(keepFocus)return;
 await delay(10);
 if(el.ownerDocument.activeElement===el||el.getRootNode()?.activeElement===el)el.blur();
 else {el.dispatchEvent(new win.FocusEvent('blur',{composed:true}));el.dispatchEvent(new win.FocusEvent('focusout',{bubbles:true,composed:true}));}
}
function dateDisplayValue(el){
 const phoenix=el.closest?.('.phoenix-select');
 if(phoenix){
  // 凤凰下拉把已选值存在三个地方：tipEle（选中后才渲染）、calcEle（一直都在）和 input 自己的 value。
  // 只读 tipEle 会在“值已经写进去、提示层还没渲染”的那几百毫秒里读回空字符串，
  // 于是每次日历选择都被判成“网页没接受”，日期永远填不进去——其实值早就落在框里了。
  const tip=phoenix.querySelector('.phoenix-select__tipEle')?.textContent?.trim();
  if(tip)return tip;
  const calc=phoenix.querySelector('.phoenix-select__calcEle')?.textContent?.trim();
  if(calc)return calc;
  return String(('value' in el?el.value:'')||'').trim();
 }
 // 年/月这类下拉选中后，值在 Semi 的 display-value 兄弟节点里，input 自己是空的。
  const shown=(el.closest?.('label')?.querySelector?.('[class*="sd-Input-display-value"]')?.textContent||'').trim();
  if(shown)return shown;
  return el.value||'';
}
async function stableDate(el,value,windowMs=500){
 const start=Date.now();do{
  if(!el.isConnected||el.getAttribute('aria-invalid')==='true'||el.validity&&!el.validity.valid||!semanticEquivalent(dateDisplayValue(el),value,{label:'日期',el}))return false;
  await delay(80);
 }while(Date.now()-start<windowMs);
 return el.isConnected&&semanticEquivalent(dateDisplayValue(el),value,{label:'日期',el});
}
// Moka/Semi prefixes every component with "sd-" and hashes the suffix; the calendar is an HTML table, so
// its day cells still match the text-based day lookup used further down.
const DATE_POPUPS='.ant-picker-dropdown,.el-picker-panel,.el-date-picker,.arco-picker-container,.arco-picker-dropdown,.semi-datepicker,.t-date-picker__panel,.n-date-panel,.ivu-date-picker-transfer,.ivu-date-picker-dropdown,.mx-datepicker-popup,.MuiPickersPopper-root,.datepicker-dropdown,.phoenix-calendar-picker,.phoenix-calendar,.calendar,[role="dialog"][data-calendar],[class*="sd-DatePicker-"] [class*="sd-Calendar-calendar"],[class*="sd-Calendar-calendar"]';
const activeCalendars=new WeakMap();
function calendarPanels(el){
 const panels=roots().flatMap(r=>Array.from(r.querySelectorAll(DATE_POPUPS))).filter(n=>visible(n,{allowReadonly:true})&&n.ownerDocument===el.ownerDocument);
 return panels.filter(n=>!panels.some(parent=>parent!==n&&parent.contains(n)));
}
function calendarScope(el){
 const active=activeCalendars.get(el);
 if(active?.isConnected&&visible(active,{allowReadonly:true}))return active;
 const root=el.getRootNode(),associated=[];
 for(const attr of ['aria-controls','aria-owns'])for(const id of (el.getAttribute(attr)||'').split(/\s+/).filter(Boolean)){
  const node=root.getElementById?.(id);if(node&&visible(node,{allowReadonly:true}))associated.push(node);
 }
 let panels=associated.length?associated:calendarPanels(el);
 panels=panels.filter(n=>!panels.some(parent=>parent!==n&&parent.contains(n)));
 // 上一个日期字段失败后会把它的日历留在页面上；两个面板同时可见时，抛错会让后面每一个日期字段跟着失败。
 // 日期弹层总是开在控件附近，按距离取最近的那个；只有近到分不出先后时才报错，不猜。
 if(panels.length>1){
  const ranked=panels.map(n=>[n,panelDistance(el,n)]).sort((a,b)=>a[1]-b[1]);
  if(ranked.length<2||ranked[1][1]-ranked[0][1]>40)return ranked[0][0];
  throw new Error('发现多个日历浮层，无法确定当前日期控件');
 }
 return panels[0]||null;
 }
function panelDistance(el,panel){
 try{
  const a=el.getBoundingClientRect?.(),b=panel.getBoundingClientRect?.();
  if(!a||!b)return Number.MAX_SAFE_INTEGER;
  const dx=Math.max(0,Math.max(a.left-b.right,b.left-a.right)),dy=Math.max(0,Math.max(a.top-b.bottom,b.top-a.bottom));
  return Math.hypot(dx,dy);
 }catch{return Number.MAX_SAFE_INTEGER;}
}
function visibleCalendarNodes(el){
  const scope=calendarScope(el);if(!scope)return [];
 // Semi/Moka hashes the class suffix, so its day cells are matched on the stable prefix.
 return Array.from(scope.querySelectorAll('button,[role="gridcell"],[role="option"],td,.ant-picker-cell,.el-date-picker__header-label,.arco-picker-cell,.semi-datepicker-day,.semi-datepicker-month,.semi-datepicker-year,.n-date-panel-date,.n-date-panel-month,.n-date-panel-year,.ivu-date-picker-cells-cell,.phoenix-calendar-year-select,.phoenix-calendar-month-select,.phoenix-calendar-prev-month-btn,.phoenix-calendar-next-month-btn,.phoenix-calendar-prev-year-btn,.phoenix-calendar-next-year-btn,.phoenix-calendar-year-panel-cell,.phoenix-calendar-month-panel-cell,.phoenix-calendar-cell,[data-date],[data-value],[class*="sd-Calendar-calendar-day"],[class*="sd-Calendar-calendar-body-cell"]')).filter(n=>visible(n,{allowReadonly:true})&&!n.disabled&&n.getAttribute('aria-disabled')!=='true'&&!/(?:^|\s)(?:disabled|is-disabled|ant-picker-cell-disabled|phoenix-calendar-disabled-cell|phoenix-calendar-last-month-cell|phoenix-calendar-next-month-cell|phoenix-calendar-last-month-btn-day|phoenix-calendar-next-month-btn-day|prev-month|next-month|outside|sd-Calendar-calendar-disabled-day|sd-Calendar-calendar-disabled-cell)(?:\s|$)/.test(String(n.className)));
}
function calendarAttributeDate(node){
 for(const attr of ['data-date','title','data-value','aria-label']){const parsed=parseDateValue(node.getAttribute(attr));if(parsed)return parsed;}return null;
}
async function datePanelClick(el,node,value){
 smartClick(node);await delay(100);
 const scope=calendarScope(el);
 const confirm=scope?Array.from(scope.querySelectorAll('button,[role=button],.phoenix-calendar-ok-btn')).filter(n=>visible(n,{allowReadonly:true})&&(/^(确定|确认|完成|ok|confirm|done)$/i.test(buttonText(n))||n.matches?.('.phoenix-calendar-ok-btn'))&&safeAction(n,'save')):[];
 if(confirm.length===1)smartClick(confirm[0]);
 if(el.ownerDocument.activeElement===el)el.blur();
 return stableDate(el,value);
}
async function chooseDateWidget(el,value){
 const rawParts=parseDateValue(value);if(!rawParts)throw new Error('日期资料无法识别，请使用 YYYY-MM 或 YYYY-MM-DD；“至今”请手动选择');
 let parts=normalizedDatePartsForControl(rawParts,el);
 const phoenixMonth=rawParts.day==null&&!!el.closest?.('.phoenix-select');
 value=monthControl(el)||phoenixMonth?`${parts.year}-${String(parts.month).padStart(2,'0')}`:`${parts.year}-${String(parts.month).padStart(2,'0')}-${String(parts.day).padStart(2,'0')}`;
 if(el.type==='date'||el.type==='month'){
  const v=dateCandidates(parts,el)[0];if(el.min&&v<el.min||el.max&&v>el.max)throw new Error('日期超出网页允许的范围');
  el.focus();setNative(el,v);el.blur();
  if(await stableDate(el,value))return dateDisplayValue(el);
  throw new Error('日期在失焦后未保留或未通过网页校验');
 }
 // Editable picker inputs are allowed to commit through the framework's input/change/blur events.
 if(!el.readOnly&&!el.closest?.('.phoenix-select')){
  for(const candidate of dateCandidates(parts,el)){
   await forceTextValue(el,candidate);if(await stableDate(el,value))return dateDisplayValue(el);
  }
 }
 // Click the specific range endpoint instead of its shared wrapper.
 const wrapper=el.closest('.phoenix-select,.ant-picker,.el-date-editor,.ivu-date-picker,.arco-picker,.t-date-picker,.n-date-picker,.mx-datepicker,.MuiFormControl-root')||el;
 // Moka 的日期控件除 input 外还可能只认容器或日历图标（sd-picker-addon），逐个试到面板出现。
 const container=el.closest('[class*="sd-Input-container"],[class*="datepicker"],[class*="picker"]');
 const pickerIcon=wrapper.querySelector?.('.phoenix-select__arrow,[class*="calendar-icon"],[class*="iconcalendar"]')||el.closest('label')?.querySelector?.('[class*="sd-picker-addon"],[class*="sd-Input-addon"],[class*="picker-icon"],[class*="calendar-icon"],[class*="iconcalendar"]')||el.parentElement?.querySelector?.('[class*="picker-icon"],[class*="calendar-icon"],[class*="iconcalendar"]');
 await openCalendarPanel(el,[wrapper!==el?wrapper:null,container!==el?container:null,pickerIcon]);
 // 空白控件只有展开后才暴露 month 模式；按当前活动面板重算精度。
 const openedScope=calendarScope(el);
 const popupMonth=!!openedScope?.querySelector('.ant-picker-month-panel,.el-month-table,[data-month-panel]');
 if(popupMonth){parts={...rawParts,day:null};value=`${parts.year}-${String(parts.month).padStart(2,'0')}`;}
 for(let attempt=0;attempt<32;attempt++){
  const nodes=visibleCalendarNodes(el);if(!nodes.length)break;
  const exact=nodes.filter(n=>{const d=calendarAttributeDate(n);return d&&d.year===parts.year&&d.month===parts.month&&(parts.day==null?d.day==null:d.day===parts.day);});
  const leaves=exact.filter(n=>!exact.some(child=>child!==n&&n.contains(child)));
  if(leaves.length===1){if(await datePanelClick(el,leaves[0],value))return dateDisplayValue(el);break;}
  const yearNode=nodes.find(n=>/year-btn|header-label|phoenix-calendar-year-select/.test(String(n.className))&&/^\d{4}年?$/.test(n.textContent.trim()));
  const yearOptions=nodes.filter(n=>/^\d{4}年?$/.test(n.textContent.trim())&&!/header|year-btn|year-select/.test(String(n.className)));
  if(yearOptions.length>=4){
   const hit=yearOptions.find(n=>Number(n.textContent.replace(/\D/g,''))===parts.year);
   if(hit){smartClick(hit);await delay(100);continue;}
   const years=yearOptions.map(n=>Number(n.textContent.replace(/\D/g,''))),direction=parts.year<Math.min(...years)?'prev':'next';
    // 年份面板要翻的是“十年”，必须点年翻页；点上一月/下一月只会把月份挪一格，永远走不到目标年份。
   const nav=nodes.find(n=>/year|super/.test(String(n.className))&&new RegExp(direction+'|'+(direction==='prev'?'上一|前一':'下一|后一'),'i').test(n.className+' '+n.getAttribute('aria-label')+' '+n.getAttribute('title')));
   if(nav){smartClick(nav);await delay(100);continue;}break;
  }
  // Semi 的日历头有类名但不在名单里，导致“当前显示的年月与目标一致才点日期”这道保护永远读不到年月而直接放弃。
  const scope=calendarScope(el),header=scope?.querySelector('.ant-picker-header-view,.el-date-picker__header,.arco-picker-header,.phoenix-calendar-header,[data-calendar-header],[class*="sd-Calendar-calendar-header"],[class*="sd-Calendar-calendar-picker-text"]');
  const headerText=header?.textContent||'',year=Number(headerText.match(/(?:19|20)\d{2}/)?.[0]);
  if(year&&year!==parts.year&&yearNode){smartClick(yearNode);await delay(100);continue;}
  if(phoenixMonth&&year===parts.year&&!Array.from(scope?.querySelectorAll('.phoenix-calendar-month-panel')||[]).some(n=>visible(n,{allowReadonly:true})&&!n.classList.contains('phoenix-calendar-hidden'))){
   const monthSelect=scope?.querySelector('.phoenix-calendar-month-select');
   if(monthSelect&&visible(monthSelect,{allowReadonly:true})){smartClick(monthSelect);await delay(100);continue;}
  }
  const months=nodes.filter(n=>n.closest('.el-month-table,.ant-picker-month-panel,.phoenix-calendar-month-panel,[data-month-panel]'));
  if(months.length&&year===parts.year){
   const chinese=['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
   const english=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
   const hit=months.find(n=>n.textContent.trim()===`${parts.month}月`||n.textContent.trim()===String(parts.month)||n.textContent.trim()===chinese[parts.month-1]||n.textContent.trim().toLowerCase()===english[parts.month-1]);
   if(hit){smartClick(hit);await delay(100);if(phoenixMonth&&!calendarScope(el))el.blur?.();if(await stableDate(el,value,250))return dateDisplayValue(el);if(phoenixMonth&&el.isConnected&&semanticEquivalent(el.closest('.phoenix-select')?.querySelector('.phoenix-select__tipEle')?.textContent,value,{label:'日期',el}))return dateDisplayValue(el);continue;}
  }
  const displayedMonth=headerText.match(/(?:19|20)\d{2}\s*[年\-/]\s*(\d{1,2})\s*月?/);
  if(year&&displayedMonth){
   const month=Number(displayedMonth[1]);
   if(year!==parts.year||month!==parts.month){
    const direction=year*12+month>parts.year*12+parts.month?'prev':'next';
    const nav=nodes.find(n=>new RegExp(direction,'i').test(String(n.className)+' '+n.getAttribute('aria-label'))&&!/super|year/i.test(String(n.className)));
    if(nav){smartClick(nav);await delay(100);continue;}
   }else if(parts.day!=null){
    const days=nodes.filter(n=>/^(TD|BUTTON)$/.test(n.tagName)||n.getAttribute('role')==='gridcell').filter(n=>n.textContent.trim()===String(parts.day));
    if(days.length===1&&await datePanelClick(el,days[0],value))return el.value;
   }
  }
  break;
 }
 // 报错要能定位：Moka 的日历结构无法离线核实，面板是否存在、显示的是哪年哪月、里面有哪些可点格子，
 // 决定了是月份面板、需要翻页，还是根本没展开。这些证据下一次反馈就能直接给出修法，不必再来回试。
 let scope=null,cells=[];
 try{scope=calendarScope(el);cells=visibleCalendarNodes(el);}catch{}
 const sample=[...new Set(cells.map(n=>String(n.textContent||'').trim()).filter(Boolean))].slice(0,12).join('、');
 throw new Error(`日历未确认目标日期，或日期在失焦后恢复；已保留表单，请手动选择该日期。`
  +`（回读值=${JSON.stringify(dateDisplayValue(el))}；日历面板=${scope?'已找到':'未找到'}`
  +(scope?`；面板文字=${JSON.stringify(String(scope.textContent||'').replace(/\s+/g,' ').trim().slice(0,80))}；可点格子=${cells.length}${sample?`；格子文本=${sample}`:''}`:''));
}
// Semi 的日期控件不一定在点 input 时展开日历——Moka 的出生日期要点容器或日历图标才开。
// 只点一次会停在“未展开”，后面整个日历分支全部走不到，最终只能报“请手动选择”。
// 逐个目标试到面板真的出现为准；每次尝试前先试 input 自己，其余目标不改变原有顺序。
async function openCalendarPanel(el,extra=[]){
 const before=new Set(calendarPanels(el));
 for(const t of [el,...extra]){
  if(!t||t===el&&t.readOnly&&extra.indexOf(t)>=0)continue;
  if(t===el){try{el.focus?.();}catch{}}
  const focused=calendarPanels(el).filter(n=>!before.has(n));
  if(focused.length===1){activeCalendars.set(el,focused[0]);return true;}
  smartClick(t);await delay(200);
  const opened=calendarPanels(el).filter(n=>!before.has(n));
  if(opened.length===1){activeCalendars.set(el,opened[0]);return true;}
  try{if(calendarScope(el))return true;}catch{}
 }
 return false;
}
