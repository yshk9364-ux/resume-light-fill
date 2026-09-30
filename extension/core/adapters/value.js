function valueForEntry(entry,value,options={}){
  if(isSalaryEntry(entry)&&entry?.kind==='native'&&entry.el?.tagName!=='SELECT')return salaryValueForControl(entry,value,options.salaryRangePolicy||'lower');
  if(entry?.fieldKey==='useTime'&&entry?.kind==='native'&&entry.el?.tagName!=='SELECT'){const c=durationConversion(entry,value,options.salaryRangePolicy||'lower');if(c?.error)throw new Error(c.error);if(c){const error=scalarControlError(entry.el,c.value);if(error)throw new Error(error);return c.value;}}
  // 支持招聘网站把一个日期拆成“年份 / 月份 / 日期”三个字段。
  const label=norm([entry?.label,...(entry?.semanticLabels||[])].filter(Boolean).join(' '));
  if(isDateEntry(entry)||entry?.kind==='dateWidget'){
    const p=parseDateValue(value),part=datePartForEntry(entry);
    if(p){
      if(part==='year')return String(p.year);
      if(part==='month')return String(p.month);
      if(part==='day')return String(p.day==null?1:p.day);
      if(monthControl(entry.el))return `${p.year}-${String(p.month).padStart(2,'0')}`;
      if(p.day==null)return entry.el?.closest?.('.phoenix-select')?`${p.year}-${String(p.month).padStart(2,'0')}`:`${p.year}-${String(p.month).padStart(2,'0')}-01`;
    }
  }
  if(['birthplace','hukou','admissionHukou','city'].includes(entry?.basicKey)){
    const parts=locationSegments(value);
    if(/省份|province/.test(label))return parts[0]||value;
    if(/城市|city/.test(label)&&parts.length>1)return parts[1];
    if(/区县|district|county/.test(label)&&parts.length>2)return parts[2];
  }
  return value;
}

function previewValue(request){
 if(request.scanId!==scanId)throw new Error('页面扫描已过期，请重新识别');
 const entry=registry.get(String(request.id));if(!entry)throw new Error('字段已失效，请重新选择');
 if(entry.fieldKey==='useTime'&&entry.kind==='native'&&entry.el.tagName!=='SELECT'){const c=durationConversion(entry,request.value,request.salaryRangePolicy||'lower');if(c){const error=c.error||scalarControlError(entry.el,c.value);return error?{duration:true,error}:c;}}
 if(isSalaryEntry(entry)){
  const c=salaryConversion(entry,request.value,request.salaryRangePolicy||'lower');
  if(c.error){if(entry.kind==='native'&&entry.el.tagName!=='SELECT'&&!salaryTarget(entry).numeric)return {salary:true,value:request.value,text:true};return {error:c.error,salary:true};}
  const scalar=entry.kind==='native'&&entry.el.tagName!=='SELECT'&&c.target.numeric;
  if(scalar){const error=scalarControlError(entry.el,c.value);if(error)return {salary:true,error};}
  return {salary:true,value:entry.kind==='native'&&entry.el.tagName!=='SELECT'?salaryValueForControl(entry,request.value,request.salaryRangePolicy||'lower'):request.value,range:c.range,unitText:c.unitText,isRange:c.isRange,scalar,policy:c.policy};
 }
 return {value:valueForEntry(entry,request.value,request)};
}
