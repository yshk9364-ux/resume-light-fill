(()=>{
 const core=globalThis.ResumeCore;const {fields:schema,normalize,canonical}=globalThis.ResumeSchema;
 const FREE_TEXT_BASICS=new Set(['name','englishName','phone','backupPhone','email','wechat','idNumber','birthplace','hukou','admissionHukou','city','address','postcode','website','github','linkedin','summary','skills']);
 const CHOICE_LIKE=/radio|checkbox|click-choice|switch|select|combobox|custom/i;
 function boundValue(field,values){
  if(field.basicKey){
   const key=`basics.${field.basicKey}`;return values.find(v=>v.key===key&&String(v.value??'').trim())||null;
  }
  if(field.groupHint&&field.fieldKey){
   let index=Number.isInteger(field.recordIndex)?field.recordIndex:null;
   if(index===null){const idx=[...new Set(values.filter(v=>v.group===field.groupHint&&Number.isInteger(v.index)).map(v=>v.index))];if(idx.length===1)index=idx[0];}
   if(index!==null){const key=`${field.groupHint}.${index}.${field.fieldKey}`;return values.find(v=>v.key===key&&String(v.value??'').trim())||null;}
  }
  return null;
 }
 function incompatibleControl(field,v,def){
  const type=String(field.type||'').toLowerCase();const key=v.key.split('.').at(-1);
  if(type==='email'&&key!=='email')return true;
  if(type==='tel'&&!['phone','backupPhone'].includes(key)&&!(v.group==='family'&&key==='phone'))return true;
  if(type==='url'&&!['website','github','linkedin'].includes(key))return true;
  // Location fields are often rendered as cascaders or searchable comboboxes.
  // A widget library wraps plain text inputs in the same markup it uses for real dropdowns, so both report the
  // native type "text" and field.type cannot tell them apart; field.custom can. Without this, a prefix
  // sub-control steals the binding from the input that actually holds the value: Moka renders 手机号码 as a
  // +86 area-code select plus a separate text box, and 证件号码 as a 证件类型 select plus a text box.
  // A widget library wraps plain text inputs in the same markup it uses for real dropdowns, so both report the
  // native type "text" and field.type cannot tell them apart; field.custom can.
  if((CHOICE_LIKE.test(type)||field.custom===true)&&v.group==='basics'&&FREE_TEXT_BASICS.has(key)&&!['birthplace','hukou','admissionHukou','city'].includes(key))return true;
  if(type==='number'&&!/^[-+]?\d+(\.\d+)?$/.test(String(v.value))&&!['salary','duration'].includes(def?.type)&&!(def?.type==='date'&&/年份|月份|日期中的日|year|month|day/i.test(field.label||'')))return true;
  return false;
 }
 function rank(field,values){
  // Scanner-level semantic identity is authoritative. Once a field is known to be
  // personal.gender or work[1].start, fuzzy labels must never redirect it to email,
  // arrival time, another record, etc.
  const bound=boundValue(field,values);
  if(bound){
   const def=schema.find(d=>d.storage===bound.group+'.'+bound.key.split('.').at(-1));
   if(incompatibleControl(field,bound,def))return {key:null,candidate:bound.key,canonical:canonical(bound.key),confidence:0,reason:'控件类型与已识别字段不兼容',candidates:[{key:bound.key,score:0}]};
   return {key:bound.key,candidate:bound.key,canonical:canonical(bound.key),confidence:100,reason:'扫描器已确定字段语义',candidates:[{key:bound.key,score:100}]};
  }
  // Forms routinely append an instruction to the question itself: “是否有亲属在本集团工作(请点击问号查看填
  // 写要求)”, “如有亲属在本集团工作，请在此补充…，如无请填写“无””. Also score the question head on its
  // own, so an exact alias match is not defeated by the trailing hint. Four characters minimum keeps
  // short fragments like “出生地” from matching on their own.
  const rawLabels=(field.semanticLabels?.length?field.semanticLabels:field.labels||[field.label]).filter(x=>String(x??'').trim());
  // The split has to run on the raw label: normalize() strips the punctuation that marks the hint.
  const labels=[...new Set(rawLabels.flatMap(raw=>{const parts=[normalize(raw)];const head=normalize(String(raw).split(/[,，;；(（]/)[0]);if(head.length>=4&&!parts.includes(head))parts.push(head);return parts;}).filter(Boolean))];
  const contexts=ResumeSchema.contextGroups(field.context).map(group=>[group,core.groups[group]]);
  const group=field.groupHint||(contexts.length===1?contexts[0][0]:null);
  const candidates=values.filter(x=>String(x.value??'').trim()).map(v=>{
   const def=schema.find(d=>d.storage===v.group+'.'+v.key.split('.').at(-1));let score=0;
   if(incompatibleControl(field,v,def))return {...v,score:0};
   for(const l of labels)for(const alias of def?.aliases||v.aliases||[]){const a=normalize(alias);if(a&&l===a)score=Math.max(score,90);else if(a&&l===normalize(def?.label))score=Math.max(score,100);else if(a.length>=3&&(l==='请输入'+a||l==='请选择'+a))score=Math.max(score,85);}
   if(!score)return {...v,score:0};
   if(group){if(v.group!==group)return {...v,score:0};score+=30;}
   if(v.group!=='basics'){
    if(Number.isInteger(field.recordIndex)){if(field.recordIndex!==v.index)return {...v,score:0};score+=40;}
    else if(new Set(values.filter(x=>x.group===v.group).map(x=>x.index)).size>1)return {...v,score:0};
   }
   return {...v,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  const top=candidates[0],second=candidates[1];const ambiguous=!!(top&&second&&top.score-second.score<15);
  const confidence=top?Math.max(0,Math.min(100,top.score)-(ambiguous?50:0)):0;
  return {key:confidence>=85?top.key:null,candidate:top?.key||null,canonical:top?canonical(top.key):null,confidence,reason:ambiguous?'候选字段有歧义':top?'语义和区块评分':'没有可靠匹配',candidates:candidates.slice(0,3).map(x=>({key:x.key,score:x.score}))};
 }
 function related(field,values){
  const key=field.fieldKey||field.basicKey;const group=field.groupHint||(field.basicKey?'basics':null);
  return values.filter(value=>{if(group&&value.group!==group)return false;if(group&&key)return value.key.split('.').at(-1)===key;return rank({...field,recordIndex:value.index},[value]).confidence>=60;});
 }
 ResumeSchema.related=related;ResumeSchema.rank=rank;core.match=(field,values)=>rank(field,values).key;
})();
