// A selected profile record targets one currently open form, never a sliced/reindexed profile.
let runSelection=null;
function validateSelection(profile,selection){
 if(!selection||selection.group==='all')return null;
 const group=selection.group;
 if(group==='basics')return {group};
 if(!ResumeCore.groups[group]||!Number.isInteger(selection.index)||!profile[group]?.[selection.index])throw new Error('请选择有效的资料条目');
 return {group,index:selection.index};
}
function selectedEntries(profile,selection){
 return ResumeCore.entries(profile).filter(v=>!selection||(v.group===selection.group&&(selection.group==='basics'||v.index===selection.index)));
}
function domSortFields(fields){
 return fields.slice().sort((a,b)=>{
  const ae=registry.get(a.id)?.el,be=registry.get(b.id)?.el;if(!ae||!be||ae===be)return 0;
  const p=ae.compareDocumentPosition(be);return p&Node.DOCUMENT_POSITION_FOLLOWING?-1:p&Node.DOCUMENT_POSITION_PRECEDING?1:0;
 });
}
function positionalSelectedFields(fields,profile,selection,scope){
 if(scope||selection.group==='basics')return fields;
 const rows=profile[selection.group]||[];if(rows.length<=1)return fields;
 const buckets=new Map();for(const field of fields){const key=[field.fieldKey||field.basicKey,field.label,field.type].join('|');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(field);}
 const keep=new Set();
 for(const list of buckets.values()){
  if(list.length===1){keep.add(list[0].id);continue;}
  const ordered=domSortFields(list);
  // Repeated controls with the same semantic identity are treated as parallel record slots.
  // Select the slot matching the requested profile record instead of aborting the whole form.
  if(selection.index<ordered.length)keep.add(ordered[selection.index].id);
 }
 return fields.filter(f=>keep.has(f.id));
}
function applySelection(snapshot,profile,selection){
 if(!selection)return snapshot;
 const dialogs=visibleDialogs();
 const group=selection.group;
 let scope=null;
 if(dialogs.length===1)scope=dialogs[0];
 else if(dialogs.length>1){
  // Prefer the one dialog whose visible semantic fields belong to the selected group.
  const candidates=dialogs.filter(d=>snapshot.fields.some(f=>f.groupHint===group&&d.contains(registry.get(f.id)?.el)));
  if(candidates.length===1)scope=candidates[0];
 }
 if(!scope&&group!=='basics'){
  const all=recordContainers(group),row=profile[group]?.[selection.index];
  const raw=group==='work'?all.filter(el=>recordFitsProfileRow(el,group,row)):all;
  if(group==='work'&&all.length&&!raw.length){snapshot.fields=[];return snapshot;}
  const matches=raw.filter(el=>recordIdentity(el,group,profile[group])===selection.index);
  if(matches.length===1)scope=matches[0];
  else if(raw.length===1)scope=raw[0];
  else if(raw.length>1){const ordered=raw.slice().sort((a,b)=>{const p=a.compareDocumentPosition(b);return p&Node.DOCUMENT_POSITION_FOLLOWING?-1:p&Node.DOCUMENT_POSITION_PRECEDING?1:0;});const slot=group==='work'&&row?.workType?profile[group].slice(0,selection.index).filter(other=>recordFitsProfileRow(ordered[0],group,other)).length:selection.index;if(slot<ordered.length)scope=ordered[slot];}
 }
 const hasContext=snapshot.fields.some(f=>f.groupHint===group&&(!scope||scope.contains(registry.get(f.id)?.el)));
 snapshot.fields=snapshot.fields.filter(field=>{
  const entry=registry.get(field.id);if(!entry||scope&&!scope.contains(entry.el))return false;
  if(group==='basics')return !field.groupHint;
  if(field.groupHint&&field.groupHint!==group)return false;
  if(!scope&&hasContext&&field.groupHint!==group)return false;
  const key=bestFieldKeyForGroup(field,group);if(!key)return false;
  field.groupHint=group;field.fieldKey=key;field.recordIndex=selection.index;delete field.basicKey;
  Object.assign(entry,{groupHint:group,fieldKey:key,recordIndex:selection.index,basicKey:undefined});return true;
 });
 snapshot.fields=positionalSelectedFields(snapshot.fields,profile,selection,scope);
 return snapshot;
}
function scanSelected(request){
 if(running)throw new Error('填写任务正在运行，请稍候');
 const selection=validateSelection(request.profile,request.selection);
 if(selection)activeAddTarget=null;
 return applySelection(mappedScan(request.profile),request.profile,selection);
}
async function finishSelected(request){
 if(panelBusy)throw new Error('浮窗正在补填，请完成后再保存');
 const selection=validateSelection(request.profile,request.selection);if(!selection)return {ok:true,message:'全页模式不执行单条关闭'};
 const snapshot=applySelection(mappedScan(request.profile),request.profile,selection),values=selectedEntries(request.profile,selection);
 if(!snapshot.fields.length)return {ok:false,message:'未找到本条表单，请先打开新增／编辑弹窗'};
 let verified=0;
 for(const field of snapshot.fields){
  const entry=registry.get(field.id),match=ResumeSchema.rank(field,values),value=values.find(v=>v.key===match.key);
  if(!value){if(field.required)return {ok:false,message:'本条仍有未匹配的必填项，未保存关闭'};continue;}
  if(request.reviewedKeys&&!request.reviewedKeys.includes(value.key))continue;
  const expected=valueForEntry(entry,value.value),actual=entry.el.tagName==='SELECT'?entry.el.selectedOptions[0]?.text||'':read(entry);
  if(!semanticEquivalent(actual,expected,entry))return {ok:false,message:'本条资料未全部通过读回校验，未保存关闭'};
  if(entry.el.validity&&!entry.el.validity.valid)return {ok:false,message:'本条未通过网页格式校验，未保存关闭'};
  verified++;
 }
 if(!verified)return {ok:false,message:'没有已验证字段，未保存关闭'};
 const dialogs=visibleDialogs().filter(d=>snapshot.fields.every(f=>d.contains(registry.get(f.id)?.el)));
 if(!dialogs.length)return {ok:true,closed:false,message:'本条已填写；当前不是弹窗，请核对后在网页保存'};
 if(dialogs.length!==1)return {ok:false,message:'无法确定要关闭的弹窗'};
 const dialog=dialogs[0];
 // Include required controls excluded by semantic scanning (unknown fields and checkboxes).
 for(const el of dialog.querySelectorAll('[required],[aria-required="true"]'))if(visible(el,{allowReadonly:true})&&(el.type==='radio'?!Array.from(dialog.querySelectorAll('input[type=radio]')).some(r=>r.name===el.name&&r.checked):el.type==='checkbox'?!el.checked:!String(el.value??el.textContent??'').trim()))return {ok:false,message:'弹窗仍有未完成的必填项，未保存关闭'};
 activeAddTarget={group:selection.group,index:selection.index||0,dialog};
 const saved=await commitPendingAdd();return saved.ok?{...saved,closed:true,message:'本条资料已保存，网站弹窗已关闭'}:saved;
}
