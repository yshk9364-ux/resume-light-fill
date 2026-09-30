const TRANSITIONS={IDLE:['SCANNING'],SCANNING:['FILLING','OPENING_ADD','DONE','ERROR'],OPENING_ADD:['WAITING_FORM','ERROR'],WAITING_FORM:['SCANNING','ERROR'],FILLING:['VERIFYING','ERROR'],VERIFYING:['SAVING','RESCANNING','ERROR'],SAVING:['WAITING_CLOSE','ERROR'],WAITING_CLOSE:['RESCANNING','ERROR'],RESCANNING:['SCANNING','NEXT_RECORD','DONE','ERROR'],NEXT_RECORD:['SCANNING','DONE','ERROR'],DONE:[],ERROR:[]};
let running=false,lastRun=null,runProfile=null,runOverwrite=true;
class Workflow {
 constructor(){this.state='IDLE';this.history=[{state:'IDLE',at:Date.now()}];}
 move(next){if(!TRANSITIONS[this.state].includes(next))throw new Error(`非法流程 ${this.state} → ${next}`);this.state=next;this.history.push({state:next,at:Date.now()});}
}
async function waitUntil(fn,timeout=2200){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return true;await delay(80);}return false;}
function mappedScan(profile){
 const snapshot=scan();
 // Match records by identity inside their actual container; never shift fields across cards.
 for(const field of snapshot.fields){
  const entry=registry.get(field.id);if(!entry||!field.groupHint||elementInActiveAddDialog(entry.el))continue;
  const containers=recordContainers(field.groupHint);const container=containers.find(x=>x.contains(entry.el));
  if(container){
   const rows=profile[field.groupHint]||[];const matched=recordIdentity(container,field.groupHint,rows);
   if(matched>=0)field.recordIndex=matched;
   else {
    const key=identityFields[field.groupHint];
    const ownFields=snapshot.fields.filter(f=>f.groupHint===field.groupHint&&f.fieldKey===key&&container.contains(registry.get(f.id)?.el));
    // Unrecognized existing identity must not be overwritten by a positional guess.
    let fallback=containers.indexOf(container);
    if(field.groupHint==='work'&&rows.some(row=>String(row.workType||'').trim())){
     const eligible=rows.map((row,i)=>recordFitsProfileRow(container,'work',row)?i:-1).filter(i=>i>=0);
     const sameSection=containers.filter(c=>/实习/.test(inferContext(c))===/实习/.test(inferContext(container)));
     fallback=eligible[sameSection.indexOf(container)]??-1;
    }
    field.recordIndex=ownFields.some(f=>String(f.value||'').trim())?-1:fallback;
   }
   entry.recordIndex=field.recordIndex;
  }else if((profile[field.groupHint]||[]).length>1){
   // 一条经历里“起止时间”常被拆成年+月两个下拉，按控件个数计数会得到 start:2 / company:1 这种
   // 天然不等的结果，于是整组被判成“对不上哪条经历”而全部跳过——页面上一条经历都填不进去。
   // 这里按记录行计数：同一条经历里的年、月、日属于同一行，只有真正缺字段的行才会让各字段行数不等。
   const grouped=snapshot.fields.filter(f=>f.groupHint===field.groupHint&&f.fieldKey);
   const counts={};
   for(const f of grouped){
    const el=registry.get(f.id)?.el;
    const row=(el&&datePartForEntry({...f,el})?el.closest(FIELD_CONTAINER_SELECTOR):null)||el;
    if(!row)continue;
    if(!counts[f.fieldKey])counts[f.fieldKey]=new Set();
    counts[f.fieldKey].add(row);
   }
   const sizes=new Set(Object.values(counts).map(s=>s.size));
   if(sizes.size>1){field.recordIndex=-1;entry.recordIndex=-1;}
  }
 }
 return applySelection(snapshot,profile,runSelection);
}
function fieldSemanticIdentity(field){
 if(field.basicKey)return `b:${field.basicKey}`;
 if(field.groupHint&&field.fieldKey)return `g:${field.groupHint}:${Number.isInteger(field.recordIndex)?field.recordIndex:'?'}:${field.fieldKey}`;
 return `u:${field.context||''}:${field.label||''}:${field.type||''}`;
}
function reportKey(field){
 const part=(()=>{try{return datePartForEntry({...field,el:registry.get(field.id)?.el})||'';}catch{return'';}})();
 // Mirror controls for the same canonical value collapse into one report. Split year/month/day
 // controls remain separate because their date part differs.
 return [fieldSemanticIdentity(field),part].join('|');
}
async function fillPass(profile,machine,reports){
 const snapshot=mappedScan(profile),values=selectedEntries(profile,runSelection);machine.move('FILLING');
 for(const field of snapshot.fields){
  let entry=registry.get(field.id);if(activeAddTarget&&!elementInActiveAddDialog(entry?.el))continue;
  const match=ResumeSchema.rank(field,values),value=values.find(v=>v.key===match.key);
  const base={field,element:entry?.el,label:field.label,canonical:match.canonical,confidence:match.confidence,adapter:adapterName(entry),control:describeEntry(entry),action:'skip',result:'skipped',message:match.reason};
  // 组合字段（区号/证件类型下拉 + 真正装值的输入框）共用同一个 reportKey，谁覆盖谁取决于文档顺序。
  // 低置信度的那条不许覆盖已核对成功的结果，否则输入框明明填好了反而会被下拉顶成“需人工确认”。
  if(!value){if(reports.get(reportKey(field))?.result==='verified')continue;reports.set(reportKey(field),{...base,message:match.candidate?'低置信度，需人工确认':'profile 无资料或字段语义不确定'});continue;}
  base.target=value.value;base.canonical=ResumeSchema.canonical(value.key);
  // Re-scan before each mutation to avoid using nodes replaced by conditional rendering.
  // Relocate by canonical semantic identity + stable slot, never by display label text.
  const fresh=mappedScan(profile);const identity=fieldSemanticIdentity(field);
  const matches=fresh.fields.filter(f=>fieldSemanticIdentity(f)===identity&&ResumeSchema.rank(f,values).key===value.key);
  let current=matches.find(f=>(f.semanticSlot??0)===(field.semanticSlot??0));
  if(!current&&matches.length===1)current=matches[0];
  if(!current){
   const existing=reports.get(reportKey(field));
   if(existing?.result!=='verified')reports.set(reportKey(field),{...base,result:'failed',message:matches.length?'同一字段存在多个控件且无法稳定定位':'字段在页面重绘后暂时不可定位'});
   continue;
  }
  entry=registry.get(current.id);
  const response=await fill({scanId:fresh.scanId,items:[{id:current.id,value:value.value}],overwrite:runOverwrite});
  const result=response.reports[0];const previous=reports.get(reportKey(field));
  if(result.skipped&&previous?.result==='verified')continue;
   reports.set(reportKey(field),{...base,field:current,element:entry?.el,label:current.label||field.label,control:describeEntry(entry),action:result.skipped?'unchanged':'fill',result:result.skipped?'skipped':result.ok?'verified':'failed',message:result.message});
 }
 machine.move('VERIFYING');return snapshot;
}
async function conditionalRounds(profile,machine,reports){
 let previous='',stable=0;
 for(let round=0;round<5;round++){
  const snapshot=await fillPass(profile,machine,reports);
  const signature=JSON.stringify(snapshot.fields.map(f=>[fieldSemanticIdentity(f),f.semanticSlot,f.type]));
  stable=signature===previous?stable+1:0;previous=signature;
  machine.move('RESCANNING');await delay(180);machine.move('SCANNING');
  if(stable>=2)return;
 }
}
async function openExisting(profile,group,index){
 const rows=profile[group]||[];
 const matching=recordContainers(group).filter(el=>recordIdentity(el,group,rows)===index);
 if(matching.length!==1)return {exists:matching.length>0,ambiguous:matching.length>1};
 const row=matching[0];if(row.querySelector('input:not([type=hidden]),textarea,select,[contenteditable=true]'))return {exists:true};
 const buttons=Array.from(row.querySelectorAll((siteAdapter.edit?siteAdapter.edit+',':'')+'button,a,[role=button]')).filter(el=>/^(编辑|修改|edit)$/i.test(buttonText(el))&&safeAction(el,'edit'));
 if(buttons.length!==1)return {exists:true,blocked:true};
 const old=new Set(visibleDialogs());smartClick(buttons[0]);
 const opened=await waitUntil(()=>visibleDialogs().some(d=>!old.has(d))||!row.isConnected||row.querySelector('input:not([type=hidden]),textarea,select'));
 if(!opened)return {exists:true,blocked:true};
 const dialog=visibleDialogs().find(d=>!old.has(d));if(dialog)activeAddTarget={group,index,dialog};
 return {exists:true,opened:true};
}
async function expandResumeSections(){
 for(const root of roots())for(const el of root.querySelectorAll('button,[role=button],a')){
  if(!visible(el,{allowReadonly:true})||!safeAction(el,'expand'))continue;
  if(!/^(展开|展开更多|更多|补充信息|expand|show more)$/i.test(buttonText(el)))continue;
  if(!sectionGroup(el))continue;smartClick(el);await delay(100);
 }
}
async function run(request){
 if(running||panelBusy||reviewedBusy)throw new Error('填写任务正在运行');running=true;
 const profile=request?.profile;if(!profile){running=false;throw new Error('缺少 profile');}
 runProfile=profile;runOverwrite=request.overwrite!==false;const machine=new Workflow(),reports=new Map();let error='',completionMessage='';
 try{
  runSelection=validateSelection(profile,request.selection);
  machine.move('SCANNING');
  if(runSelection){
   activeAddTarget=null;
   if(!mappedScan(profile).fields.length)throw new Error('请先在网站打开本条新增／编辑表单');
   await conditionalRounds(profile,machine,reports);
   if(request.closeModal!==false){
    if([...reports.values()].some(r=>r.result==='failed'))throw new Error('存在填写失败项，未保存关闭弹窗');
    machine.move('FILLING');machine.move('VERIFYING');machine.move('SAVING');
    const saved=await finishSelected(request);machine.move('WAITING_CLOSE');
    if(!saved.ok)throw new Error(saved.message);completionMessage=saved.message;
    machine.move('RESCANNING');machine.move('SCANNING');
   }
   machine.move('DONE');
  }else{
  await expandResumeSections();await conditionalRounds(profile,machine,reports);
  for(const group of Object.keys(ResumeCore.groups)){
   const rows=(profile[group]||[]).slice(0,30);
   for(let index=0;index<rows.length;index++){
    if(!Object.values(rows[index]).some(v=>String(v||'').trim()))continue;
    mappedScan(profile);
    const containers=recordContainers(group);
    const exists=containers.some(el=>recordIdentity(el,group,rows)===index);
    const inline=lastFields.some(f=>f.groupHint===group&&f.recordIndex===index);
    if(inline)continue;
    // Existing closed records are edited, never duplicated.
    if(exists){
     machine.move('OPENING_ADD');machine.move('WAITING_FORM');
     const opened=await openExisting(profile,group,index);
     if(!opened.opened){machine.move('ERROR');throw new Error(`${group}[${index}] 已有记录无法安全编辑，请手动核对`);}
     machine.move('SCANNING');
    }else{
     // If unknown records exist, adding could duplicate them. Stop this record conservatively.
     if(containers.some(el=>recordIdentity(el,group,rows)<0)){
      reports.set(group+'.'+index,{label:group+'['+index+']',result:'skipped',message:'存在无法确认身份的旧记录，未新增'});continue;
     }
     const button=addButtonFor(group);if(!button){reports.set(group+'.'+index,{label:group+'['+index+']',canonical:(group+'['+index+']'),result:'skipped',message:'本页没有可匹配记录或安全的新增入口'});continue;}
     machine.move('OPENING_ADD');const oldDialogs=new Set(visibleDialogs()),oldFields=new Set(roots().flatMap(r=>Array.from(r.querySelectorAll('input,textarea,select,[contenteditable=true]'))));
     smartClick(button);machine.move('WAITING_FORM');
     const appeared=await waitUntil(()=>visibleDialogs().some(d=>!oldDialogs.has(d))||roots().some(r=>Array.from(r.querySelectorAll('input,textarea,select,[contenteditable=true]')).some(el=>!oldFields.has(el)&&visible(el,{allowReadonly:true}))));
     if(!appeared){machine.move('ERROR');throw new Error('点击新增后没有检测到表单');}
     const dialog=visibleDialogs().find(d=>!oldDialogs.has(d));if(dialog)activeAddTarget={group,index,dialog};
     machine.move('SCANNING');
    }
    const before=new Map(reports);await fillPass(profile,machine,reports);
    const changed=[...reports].filter(([k,v])=>before.get(k)!==v).map(([,v])=>v);
    const required=lastFields.filter(f=>f.required&&(!activeAddTarget||elementInActiveAddDialog(registry.get(f.id)?.el)));
    if(!changed.some(r=>r.target!==undefined&&r.result!=='failed')||changed.some(r=>r.result==='failed')||required.some(f=>!String(read(registry.get(f.id))||'').trim())){
     machine.move('ERROR');throw new Error('记录未通过校验，已保留表单供人工处理');
    }
    if(activeAddTarget){
     machine.move('SAVING');const saved=await commitPendingAdd();machine.move('WAITING_CLOSE');
     if(!saved.ok){machine.move('ERROR');throw new Error(saved.message);}
     machine.move('RESCANNING');
    }else machine.move('RESCANNING');
    scan();machine.move('NEXT_RECORD');machine.move('SCANNING');
   }
  }
  await conditionalRounds(profile,machine,reports);machine.move('DONE');
  }
 }catch(e){error=e.message;if(machine.state!=='ERROR'&&TRANSITIONS[machine.state].includes('ERROR'))machine.move('ERROR');}
 finally{running=false;runProfile=null;runSelection=null;}
 // Uploads are explicitly detection-only, including inputs hidden behind styled buttons.
 for(const root of roots())for(const el of root.querySelectorAll('input[type=file]'))reports.set('upload:'+el.name+el.id,{label:el.getAttribute('aria-label')||el.name||'附件上传',adapter:'UploadAdapter',result:'skipped',message:'检测到文件上传，请手动选择文件'});
 for(const root of roots())for(const frame of root.querySelectorAll('iframe')){let accessible=false;try{accessible=!!frame.contentDocument;}catch{}if(!accessible)reports.set('frame:'+frame.id+frame.src,{label:'嵌入框架',adapter:'IframeAdapter',result:'skipped',message:'跨域或不可访问框架，需要单独打开并填写'});}
 const list=[...reports.values()];
 lastRun={completionMessage,state:machine.state,site:siteAdapter.name,frameworks:Object.entries(FRAMEWORKS).filter(([,s])=>roots().some(r=>r.querySelector(s))).map(([n])=>n),history:machine.history,reports:list,error,counts:{success:list.filter(r=>r.result==='verified').length,skipped:list.filter(r=>r.result==='skipped').length,failed:list.filter(r=>r.result==='failed').length}};
 presentResults(request,list.map(({element,...r})=>({...r,element,ok:r.result==='verified',skipped:r.result==='skipped'})),error);
 // DOM references are private to the page panel, never sent through extension messaging.
 for(const report of list)delete report.element;
 return lastRun;
}
