// Closed shadow tree keeps assistant controls out of site scanning and widget matching.
let resultPanel=null,panelBusy=false,reviewedBusy=false;
function panelNode(tag,text){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;}
function showResults(){if(resultPanel){resultPanel.host.style.removeProperty('display');resultPanel.body.hidden=false;resultPanel.minimize.textContent='收起';}return !!resultPanel;}
function resultNotice(message){if(resultPanel)resultPanel.notice.textContent=message;return !!resultPanel;}
// 面板跑在页面里，拿不到 popup 的 buildErrorReport()，所以这里按同一格式自建一份。控件结构来自 describeEntry()，
// 是定位写入失败原因的关键。
function panelErrorReport(state){
  const lines=['# 简历轻填 需处理字段',`版本: ${globalThis.ResumeEngineVersion||'-'}`,`时间: ${new Date().toLocaleString('zh-CN')}`];
  if(state?.url)lines.push(`页面: ${state.url}`);
  const rows=state?.rows||[];
  lines.push(`状态: ${rows.filter(r=>!r.ok).length} 项需处理`);
  lines.push('',`--- 需处理明细（${rows.length} 条）---`);
  for(const r of rows){
    const suffix=r._duplicates>1?`（${r._duplicates} 个同类控件）`:'';
    lines.push(`[${r.ok?'已手动处理':'失败'}] ${r.label||'(无标签)'}${suffix} | 资料字段=${r.canonical||'-'} | 写入值=${r.target??'-'} | 控件=${r.adapter||r.type||'-'} | 控件结构=${r.control||'-'} | ${r.message||''}`);
  }
  return lines.join('\n');
}
async function copyPanelReport(state,shadow,button){
  const text=panelErrorReport(state),hint=panelNode('p');hint.className='hint';
  hint.textContent='已复制，可直接粘贴给 AI';
  let copied=false;
  try{
    await navigator.clipboard.writeText(text);
    copied=true;
  }catch{
    // 页面里可能没有剪贴板权限，留一个可选中的文本框让用户自己按 Cmd+C。
    let box=shadow.querySelector('.panel-copy-fallback');
    if(!box){box=panelNode('textarea');box.className='panel-copy-fallback';box.setAttribute('aria-label','错误信息，请手动复制');state.body.prepend(box);}
    box.hidden=false;box.value=text;box.focus();box.select();
    hint.textContent='已选中，请按 Cmd+C 复制';
  }
  button.textContent=copied?'✓ 已复制':'请按 Cmd+C';
  button.setAttribute('aria-label',hint.textContent);
  state.copyHint?.remove();state.copyHint=hint;state.body.prepend(hint);
  clearTimeout(state.copyTimer);state.copyTimer=setTimeout(()=>{hint.remove();state.copyHint=null;button.textContent='复制错误给 AI';button.removeAttribute('aria-label');},7000);
}
function presentResults(request,reports,extra=''){
 const rawFailures=(reports||[]).filter(r=>!r.ok&&(!r.skipped||r.field?.required));
 const byKey=new Map();
 for(const row of rawFailures){
  const key=[row.canonical||row.label||'',String(row.target??'')].join('|');
  const prev=byKey.get(key);
  if(!prev)byKey.set(key,{...row,_duplicates:1});
  else {prev._duplicates++;if((row.message||'').length>(prev.message||'').length)prev.message=row.message;}
 }
 const failures=[...byKey.values()];
 if(!failures.length&&!extra){resultPanel?.host.remove();resultPanel=null;return false;}
 resultPanel?.host.remove();
 const host=panelNode('div');host.setAttribute('data-resume-results','');
 host.style.cssText='all:initial!important;position:fixed!important;right:16px!important;bottom:16px!important;z-index:2147483647!important;';
 const shadow=host.attachShadow({mode:'closed'}),style=panelNode('style');
 style.textContent=`:host{color-scheme:light}*{box-sizing:border-box}section{font:14px/1.5 system-ui,sans-serif;color:#172338;background:#fff;width:min(440px,calc(100vw - 32px));border:1px solid #e0b4aa;border-radius:8px;box-shadow:0 8px 35px #15294440;overflow:hidden}header{display:flex;align-items:center;flex-wrap:wrap;gap:8px;background:#fff0ed;padding:12px}header strong{flex:1 0 100%}article strong{display:block}button{font:inherit;cursor:pointer;border:1px solid #d9b6ad;border-radius:6px;background:white;color:#7a2f20;padding:5px 8px}button:disabled,textarea:disabled{opacity:.5}main{max-height:65vh;overflow:auto;padding:12px}p{margin:6px 0;overflow-wrap:anywhere}article{border-top:1px solid #eee;padding:10px 0}textarea{display:block;width:100%;min-height:54px;resize:vertical;font:inherit;margin:7px 0;padding:6px;border:1px solid #c9b4af;border-radius:5px}.panel-copy-fallback{max-height:130px}.actions{display:flex;flex-wrap:wrap;gap:5px}.status{color:#9c3927}.ok{color:#17643a}.hint{font-size:12px;color:#59677b}[hidden]{display:none!important}`;
 const box=panelNode('section'),header=panelNode('header'),title=panelNode('strong','简历轻填 · 需处理字段'),body=panelNode('main'),summary=panelNode('p'),notice=panelNode('p',extra||'可在这里补填，或定位网页字段手动处理。补填不会修改已保存的简历。');
 notice.setAttribute('role','status');
 const copy=panelNode('button','复制错误给 AI'),minimize=panelNode('button','收起'),close=panelNode('button','关闭');
 minimize.onclick=()=>{body.hidden=!body.hidden;minimize.textContent=body.hidden?'展开':'收起';};close.onclick=()=>{host.style.setProperty('display','none','important');};
 header.append(title,copy,minimize,close);body.append(summary,notice);
 for(const type of ['click','input','change','keydown','keyup'])shadow.addEventListener(type,event=>event.stopPropagation());
 box.append(header,body);shadow.append(style,box);document.documentElement.append(host);
 const state={host,body,notice,minimize,request,url:location.href,rows:failures,summary};resultPanel=state;
 copy.onclick=()=>copyPanelReport(state,shadow,copy);
 const updateSummary=()=>{summary.textContent=`需处理 ${state.rows.filter(r=>!r.ok).length} 项${extra?' · 流程异常':''}`;};updateSummary();
 for(const row of failures){
  const suffix=row._duplicates>1?`（${row._duplicates} 个同类控件）`:'';
  const card=panelNode('article'),label=panelNode('strong',(row.label||'未识别字段')+suffix),status=panelNode('p',row.message||'网页未确认保留该值');status.className='status';card.append(label,status);
  if(row.canonical){const source=panelNode('p','字段：'+row.canonical);source.className='hint';card.append(source);}
  if(row.target!==undefined&&String(row.target).trim()){const target=panelNode('p','目标值：'+String(row.target));target.className='hint';card.append(target);}
  if(row.adapter){const adapter=panelNode('p','控件：'+row.adapter);adapter.className='hint';card.append(adapter);}
  if(row.field&&row.element&&row._duplicates===1){
   const input=panelNode('textarea');input.value=String(row.target??'');input.placeholder='补填内容';input.setAttribute('aria-label',`${row.label}的补填内容`);
   const actions=panelNode('div');actions.className='actions';
   const write=panelNode('button','写入并核对'),locate=panelNode('button','定位网页字段'),check=panelNode('button','重新核对');actions.append(write,locate,check);card.append(input,actions);
   if(row.field.options?.length){const hint=panelNode('p','网页可选值：'+row.field.options.map(o=>o.text).filter(Boolean).join('、').slice(0,240));hint.className='hint';card.append(hint);}
   const resolve=()=>{
    if(location.href!==state.url)throw new Error('页面已切换，请重新识别');
    const snapshot=row.raw?scan():scanSelected(state.request);
    const field=reviewedFieldMatch(snapshot.fields,row.field);
    if(!field)throw new Error('原字段无法唯一定位，请重新识别');
    const entry=registry.get(field.id);
    if(entry?.el!==row.element)throw new Error('原表单已更换，请重新识别');
    return {snapshot,field,entry};
   };
   const execute=async(action)=>{
    if(panelBusy||running||reviewedBusy){status.textContent='正在填写，请稍候';return;}
    panelBusy=true;for(const el of shadow.querySelectorAll('.actions button,textarea'))el.disabled=true;
    try{
     const {snapshot,field,entry}=resolve();
     if(action==='locate'){
      entry.el.scrollIntoView?.({block:'center',behavior:'smooth'});entry.el.focus?.({preventScroll:true});
      status.textContent='已定位；在网页手动完成后可点“重新核对”';return;
     }
     if(!input.value.trim())throw new Error('请先输入补填内容');
     if(action==='write'){
      const result=await fill({scanId:snapshot.scanId,items:[{id:field.id,value:input.value}],overwrite:true});
      if(!result.reports[0]?.ok)throw new Error(result.reports[0]?.message||'写入失败');
     }
     await delay(1200);
     const fresh=resolve(),expected=valueForEntry(fresh.entry,input.value);
     const actual=fresh.entry.el.tagName==='SELECT'?fresh.entry.el.selectedOptions[0]?.text||'':read(fresh.entry);
     if(!semanticEquivalent(actual,expected,fresh.entry)||fresh.entry.el.validity&&!fresh.entry.el.validity.valid||fresh.entry.el.getAttribute('aria-invalid')==='true')throw new Error('网页未保留目标值，请在网页手动处理');
     row.ok=true;row.target=input.value;status.className='ok';status.textContent='网页已保留该值；请在网站核对并保存';
    }catch(error){row.ok=false;status.className='status';status.textContent=error.message;}
    finally{panelBusy=false;updateSummary();for(const el of shadow.querySelectorAll('.actions button,textarea'))el.disabled=false;}
   };
   input.addEventListener('input',()=>{row.ok=false;status.className='status';status.textContent='内容已修改，尚未写入网页';updateSummary();});
   write.onclick=()=>execute('write');locate.onclick=()=>execute('locate');check.onclick=()=>execute('check');
  }
  body.append(card);
 }
 return true;
}
function reviewedResults(request,reports,fields){
 const values=selectedEntries(request.profile,validateSelection(request.profile,request.selection));
 const rows=reports.map(r=>{const item=request.items.find(i=>i.field.id===r.id);const current=item?reviewedFieldMatch(fields,item.field):null;return {...r,field:item?.field,target:values.find(v=>v.key===item?.key)?.value,element:current?registry.get(current.id)?.el:null};});
 const known=new Set(rows.map(r=>r.element).filter(Boolean));
 const dialogs=visibleDialogs().filter(d=>[...known].some(el=>d.contains(el)));
 if(dialogs.length===1){const raw=scan();for(const field of raw.fields){const element=registry.get(field.id)?.el;
  if(element&&field.required&&dialogs[0].contains(element)&&!known.has(element))rows.push({field,element,raw:true,label:field.label,skipped:true,ok:false,target:'',message:'未匹配的必填字段，请手动补填'});
 }}
 presentResults(request,rows);
}

// 只读访问器：把一个 DOM 控件映射回本次扫描给它的字段 id（以及反向）。
// 油猴壳里的 AI 推荐气泡需要「点哪个输入框 → 写到哪个字段」，但 registry 是闭包私有的。
// 这里只做查询、不参与任何写入决策；写入一律仍走 fill()，读回校验逻辑一行没动。
function fieldIdForElement(el){for(const [id,entry] of registry)if(entry.el===el)return id;return null;}
function elementOfField(id){return registry.get(id)?.el||null;}
