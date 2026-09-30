function bestOption(options,value,meta={}){
  const nv=norm(value),cv=choiceNorm(value),lv=stripLocationSuffix(value);
  let scored=options.map((o,i)=>{
    const text=String(o.text??o.value??'').trim(),nt=norm(text),ct=choiceNorm(text),lt=stripLocationSuffix(text);
    let s=0;
    if(nt&&nt===nv)s=180;
    else if(lv&&lt===lv&&lv.length>=2)s=165;
    else if(ct&&ct===cv)s=150;
    else if(nt&&nv&&(nt.includes(nv)||nv.includes(nt)))s=115-Math.min(20,Math.abs(nt.length-nv.length));
    // 数字类匹配必须受字段语义约束，避免“3年/5年/10万”等数字选项互相抢匹配。
    if(['salary','expectedAnnualSalary','currentSalary'].includes(meta?.basicKey)||meta?.fieldKey==='annualSalary'||/薪酬|薪资|工资|年薪|月薪/.test(String(meta?.label||meta?.context||''))) s=Math.max(s,numericOptionScore(text,value,meta));
    if(meta?.fieldKey==='useTime'||/使用时间|使用年限|使用时长|经验年限|熟练时间/.test(String(meta?.label||meta?.context||''))) s=Math.max(s,durationOptionScore(text,value,meta));
    if(meta?.fieldKey==='level'&&['computerSkills','professionalSkills','languages'].includes(meta?.groupHint)||/掌握程度|熟练程度|技能水平/.test(String(meta?.label||meta?.context||''))) s=Math.max(s,skillLevelOptionScore(text,value));
    return {...o,s,_i:i,_len:nt.length};
  }).sort((a,b)=>b.s-a.s||Math.abs(a._len-nv.length)-Math.abs(b._len-nv.length)||a._i-b._i);
  if(!scored[0]||scored[0].s<90)return null;
  if(scored[1]&&scored[0].s===scored[1].s&&scored[0].s<170)return null;
  return scored[0];
}
function convertNative(el,value,entry){
  if(el.tagName==='SELECT'&&isDateEntry(entry)&&datePartForEntry(entry)){
    const options=Array.from(el.options).filter(o=>!o.disabled&&!o.parentElement?.disabled),number=text=>String(text).trim().match(/^0*(\d{1,4})\s*[年月日]?$/)?.[1];
    const numericText=options.filter(o=>number(o.text)!==undefined);
    const hit=(numericText.length?numericText:options).filter(o=>Number(number(numericText.length?o.text:o.value))===Number(value));
    if(hit.length!==1)throw new Error('年月日选项无唯一匹配');return hit[0].value;
  }
  if(el.tagName==='SELECT'){const opts=Array.from(el.options).filter(o=>!o.disabled&&!o.parentElement?.disabled);const hit=bestOption(opts.map(o=>({text:o.text,value:o.value,el:o})),value,entry);if(!hit)throw new Error('下拉选项无可靠匹配，请手动选择');return hit.value;}
  if(el.type==='number'&&entry?.groupHint==='languages'&&entry?.fieldKey==='score'&&!/^\d+(?:\.\d+)?$/.test(String(value).trim()))throw new Error('未提供英语考试具体数字成绩，不自动编造分数');
  if(el.type==='date'){const m=String(value).match(/(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/);if(m)value=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('日期需要 YYYY-MM-DD 格式');}
  if(el.type==='month'){const m=String(value).match(/(\d{4})[.\-/年](\d{1,2})/);if(m)value=`${m[1]}-${m[2].padStart(2,'0')}`;else value=value.slice(0,7);if(!/^\d{4}-\d{2}$/.test(value))throw new Error('月份需要 YYYY-MM 格式');}
  if(el.maxLength>0&&value.length>el.maxLength)throw new Error(`文本超过 ${el.maxLength} 字限制`);return value;
}
