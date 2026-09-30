// Re-resolve reviewed mappings after every DOM mutation; retain explicit user skips.
function reviewIdentity(field){
  // 优先用扫描时就记在字段身上的部件：按 id 反查控件只在同一次扫描内成立，重扫会把 id 重新分配给别的字段，
  // 拿旧 id 反查会算出错的部件，年、月两个控件身份就撞成同一个，后面必然报“无法唯一定位”。
  const part=field.datePart||(()=>{try{return datePartForEntry({...field,el:registry.get(field.id)?.el})||'';}catch{return'';}})();
 return [fieldSemanticIdentity(field),part,field.semanticSlot??0].join('|');
}
function reviewedFieldMatch(fields,oldField){
 const exact=fields.filter(f=>reviewIdentity(f)===reviewIdentity(oldField));
 if(exact.length===1)return exact[0];
 // If a framework recreated controls and changed mirror count, fall back only when the
 // canonical semantic identity itself is unique. Never use the display label as identity.
  const semantic=fields.filter(f=>fieldSemanticIdentity(f)===fieldSemanticIdentity(oldField));
  if(semantic.length===1)return semantic[0];
  // 最后只认“同一个问题、同一个槽位、且全页只有一个”的字段：重绘时记录序号可能整体平移一位，语义身份就
  // 对不上了，但同一个问题在页面里仍然只有这一个控件。只在唯一时才用，不猜。
  const sameQuestion=fields.filter(f=>String(f.label||'')===String(oldField.label||'')&&String(f.context||'')===String(oldField.context||'')&&String(f.type||'')===String(oldField.type||'')&&(f.semanticSlot??0)===(oldField.semanticSlot??0));
  return sameQuestion.length===1?sameQuestion[0]:null;
}
// 资料里每个分组实际有几条“有内容”的记录。空行不占名额，免得为空白记录点一堆“添加”。
function desiredRecordCounts(profile,selection){
 const counts={};
 for(const [group,rows] of Object.entries(profile)){
  if(group==='basics'||!Array.isArray(rows)||!ResumeCore.groups[group])continue;
  if(selection&&selection.group&&selection.group!==group)continue;
  const n=rows.filter(r=>r&&Object.values(r).some(v=>String(v??'').trim())).length;
  if(n)counts[group]=Math.min(12,n);
 }
 return counts;
}
// prepare() 一直存在却没有任何地方调用，空经历区块因此永远不会被建出来。
// 这里在填写前按资料条数补齐记录行；页面长不出新行时 prepare 会自行放弃，不会乱点。
// prepare() 一直存在却没有任何地方调用，空经历区块因此永远建不出来。普通填写刻意不自动点“添加”——
// 那会改变表单结构，是用户点主按钮时没要求的副作用；改为由弹窗上的显式按钮调用。
function prepareRecords(request){
 const profile=request&&request.profile;if(!profile)throw new Error('请先选择简历资料');
 let selection=null;try{selection=validateSelection(profile,request.selection);}catch{}
 return prepare({desiredCounts:desiredRecordCounts(profile,selection),maxAdds:12});
}

// 资料里每个分组实际有几条“有内容”的记录。空行不占名额，免得为空白记录点一堆“添加”。
function desiredRecordCounts(profile,selection){
 const counts={};
 for(const [group,rows] of Object.entries(profile)){
  if(group=='basics'||!Array.isArray(rows)||!ResumeCore.groups[group])continue;
  if(selection&&selection.group&&selection.group!==group)continue;
  const n=rows.filter(r=>r&&Object.values(r).some(v=>String(v??'').trim())).length;
  if(n)counts[group]=Math.min(12,n);
 }
 return counts;
}
async function fillReviewed(request){
 if(panelBusy||reviewedBusy||running)throw new Error('填写任务正在运行，请稍候');
 reviewedBusy=true;try{return await fillReviewedInternal(request);}finally{reviewedBusy=false;}
}
async function fillReviewedInternal(request){
 if(running)throw new Error('填写任务正在运行');
 const selection=validateSelection(request.profile,request.selection),values=selectedEntries(request.profile,selection),reports=[];
 let fresh=scanSelected(request),dirty=false;
 const observer=typeof MutationObserver==='function'?new MutationObserver(()=>{dirty=true;}):null;
 const observeRoots=()=>{if(!observer)return;for(const root of roots()){const target=root.documentElement||root;try{observer.observe(target,{subtree:true,childList:true,attributes:true,characterData:true});}catch{}}};
 observeRoots();
 try{
 for(const item of request.items||[]){
   const base={id:item.field.id,label:item.field.label,key:item.key,canonical:ResumeSchema.canonical(item.key),type:item.field.type};
  try{
   const value=values.find(v=>v.key===item.key);if(!value)throw new Error('所选资料已变化，请重新识别');
   if(!observer||dirty||observer.takeRecords().length){fresh=scanSelected(request);dirty=false;observer?.takeRecords();observeRoots();}
   // 重扫一次再找：菜单关闭动画、懒加载、加载态都会让某一次重扫短暂看不到全部控件。
   let field=reviewedFieldMatch(fresh.fields,item.field);
   if(!field){await delay(280);fresh=scanSelected(request);field=reviewedFieldMatch(fresh.fields,item.field);}
   // 报错必须带出双方身份：下一次反馈才能直接看出是语义身份变了、还是那次重扫根本没看到这几个控件。
   if(!field)throw new Error(`字段在页面重绘后无法唯一定位（要找：${reviewIdentity(item.field)}｜标签=${item.field.label}；重扫共看到 ${fresh.fields.length} 个控件，同标签的 ${fresh.fields.filter(f=>String(f.label||'')===String(item.field.label||'')).length} 个），请重新识别后填写`);
   if(!ResumeSchema.related(field,[value]).length)throw new Error('所选资料与当前字段不相关');
   const result=await fill({scanId:fresh.scanId,items:[{id:field.id,value:value.value}],overwrite:request.overwrite!==false,deferDetachCheck:true});
   reports.push({...base,label:field.label||base.label,...result.reports[0],id:item.field.id});
  }catch(error){reports.push({...base,ok:false,message:error.message});}
 }
 }finally{observer?.disconnect();}
 // Catch later field writes that cause an earlier date to roll back (e.g. range pickers).
 const final=scanSelected(request);
 for(const report of reports.filter(r=>r.ok)){
  const item=request.items.find(i=>i.field.id===report.id),field=item?reviewedFieldMatch(final.fields,item.field):null;
  if(!field){
   // 最后这次重扫只为抳日期：后续字段的写入可能把之前的日期回滚。非日期字段在写入时已经回读校验过，
   // 重扫时控件换了节点（框架重绘）不等于没写进去，不能因此推翻已核实的结果。
   // 唯一例外：填写途中控件就已经脱页的，写入时的读回读的是旧节点、根本不算数，这种必须在重扫里找到活的控件。
   if(!item)continue;
   if(!isDateEntry(item.field)&&!report.detached)continue;
   report.ok=false;report.message='填写后字段被替换或移除，未通过最终校验';continue;
  }
  const entry=registry.get(field.id);
  // 控件在填写途中就被换掉时，写入时的读回不可信，只能靠这次重扫在活页面上再确认一次实际值。
  if(report.detached){
   const held=values.find(v=>v.key===item.key),want=valueForEntry(entry,held.value);
   const got=entry.el.tagName==='SELECT'?entry.el.selectedOptions[0]?.text||read(entry):read(entry);
   if(!semanticEquivalent(got,want,entry)){report.ok=false;report.message='填写后字段被重绘替换，未通过最终校验';}
   continue;
  }
  if(!isDateEntry(entry))continue;
  const value=values.find(v=>v.key===item.key),expected=valueForEntry(entry,value.value);
  if(!semanticEquivalent(entry.el.tagName==='SELECT'?entry.el.selectedOptions[0]?.text||'':read(entry),expected,entry)){report.ok=false;report.message='日期在后续操作后恢复，未保存关闭';}
 }
 reviewedResults(request,reports,final.fields);
 return {reports,undoCount:undoStack.length};
}
