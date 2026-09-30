function looksSalary(text){return /薪|工资|收入|报酬|待遇|salary|compensation|\d\s*(?:元|万|千|k\b|w\b)|\/月|\/年|monthly|annual/i.test(String(text||''));}
function salaryPeriod(text){const s=String(text||'').toLowerCase();return /月|monthly|per\s*month|\/m(?:onth)?\b/.test(s)?'month':/年|annual|yearly|per\s*year|\/y(?:ear)?\b/.test(s)?'year':'';}
function salaryUnit(text){const s=String(text||'').toLowerCase();return /万|\d\s*w\b|\bw\b/.test(s)?'wan':/千|\d\s*k\b|\bk\b/.test(s)?'k':/元|人民币|rmb|cny/.test(s)?'yuan':'';}
function salaryFactor(unit){return unit==='wan'?10000:unit==='k'?1000:1;}
function salaryRangeAnnualYuan(text,fallback={}){
 const raw=String(text??'').trim().replace(/[,，]/g,'').toLowerCase();
 if(/(?:^|[\s（(])-\s*\d/.test(raw))return null;
 if(!raw||/面议|negotiable|非全职|保密/.test(raw))return null;
 // 去掉薪数后再取金额，不能把“13薪”当作第二个金额端点。
 const payMonths=Number(raw.match(/(\d+(?:\.\d+)?)\s*薪/)?.[1]||12);
 if(payMonths<1||payMonths>24)return null;
 const s=raw.replace(/\d+(?:\.\d+)?\s*薪/g,'');
 const matches=[...s.matchAll(/\d+(?:\.\d+)?\s*(?:万元?|千元?|元|k\b|w\b)?/g)];
 if(!matches.length||matches.length>2||matches.length===2&&!/[-~～至到—–]/.test(s))return null;
 const period=salaryPeriod(s)||fallback.period||'';
 const commonUnit=salaryUnit(s)||fallback.unit||'';
 const nums=matches.map(m=>Number(m[0].match(/\d+(?:\.\d+)?/)[0]));
 const amounts=matches.map((m,i)=>{
  // 大金额未注明单位时优先元，不把“6000”继承成 6000 千元。
  const explicit=salaryUnit(m[0]);let unit=explicit||commonUnit;
  if(!explicit&&nums[i]>=1000&&fallback.inferUnit)unit='yuan';
  if(!unit&&fallback.inferUnit&&nums[i]<100){unit=period==='month'&&fallback.median>=3000?'k':period==='year'&&fallback.median>=50000?'wan':'yuan';}
  return nums[i]*salaryFactor(unit);
 });
 if(amounts.some(n=>!Number.isFinite(n)||n<0)||amounts.length===2&&amounts[0]>amounts[1])return null;
 let lo=amounts[0],hi=amounts.at(-1);
 if(amounts.length===1&&/以上|及以上|不低于|至少|起|>=|≥/.test(s))hi=Infinity;
 if(amounts.length===1&&/以下|及以下|不超过|至多|<=|≤/.test(s))lo=0;
 const multiplier=period==='month'?payMonths:1;
 return {values:[lo*multiplier,hi*multiplier],period,unit:commonUnit,payMonths,median:amounts.reduce((a,b)=>a+b,0)/amounts.length};
}
function isSalaryEntry(entry){return ['salary','expectedAnnualSalary','currentSalary'].includes(entry?.basicKey)||['annualSalary','monthlySalary'].includes(entry?.fieldKey)||/薪酬|薪资|工资|年薪|月薪|期望待遇|期望收入/.test(String(entry?.label||''));}
function salaryTarget(entry){
 const el=entry?.el,labels=[entry?.label,...(entry?.semanticLabels||[])].filter(Boolean).join(' ');
 const row=el?fieldContainer(el):null;
 const suffix=Array.from(row?.querySelectorAll?.('.el-input-group__append,.ant-input-suffix,.ant-input-group-addon,.unit,[data-unit]')||[]).map(n=>n.textContent).join(' ');
 const hint=[el?.getAttribute?.('data-unit'),el?.getAttribute?.('placeholder'),suffix].filter(Boolean).join(' ');
 const period=salaryPeriod(hint)||salaryPeriod(labels)||(['expectedAnnualSalary'].includes(entry?.basicKey)||entry?.fieldKey==='annualSalary'?'year':'month');
 const unit=salaryUnit(hint)||salaryUnit(labels)||'yuan';
 const explicitUnit=!!(salaryUnit(hint)||salaryUnit(labels));
 const numeric=el?.type==='number'||/numeric|decimal/.test(el?.getAttribute?.('inputmode')||'')||explicitUnit;
 return {period,unit,numeric,explicitUnit,explicitPeriod:!!(salaryPeriod(hint)||salaryPeriod(labels))};
}
function salaryConversion(entry,value,policy='lower'){
 const target=salaryTarget(entry);
 const parsed=salaryRangeAnnualYuan(value,{period:target.period,unit:target.unit});
 if(!parsed)return {error:'薪资金额无法可靠换算，请输入金额并注明元/月、万元/年等单位'};
 if(!Number.isFinite(parsed.values[1]))return {error:'薪资只有上限或下限，请先填写明确金额'};
 const divisor=(target.period==='month'?parsed.payMonths:1)*salaryFactor(target.unit);
 const values=parsed.values.map(n=>n/divisor);
 const scalar=policy==='upper'?values[1]:policy==='midpoint'?(values[0]+values[1])/2:values[0];
 const precision=target.unit==='yuan'?2:4;
 const format=n=>String(Number(n.toFixed(precision)));
 const amount=format(scalar),range=values[0]===values[1]?amount:values.map(format).join('～');
 const unitText=(target.unit==='wan'?'万元':target.unit==='k'?'千元':'元')+'/'+(target.period==='year'?'年':'月');
 return {value:amount,range,unitText,isRange:values[0]!==values[1],policy,target,parsed};
}
function salaryOptionScore(text,value,meta={}){
 if(!isSalaryEntry(meta)&&!looksSalary(value)&&!looksSalary(text))return 0;
 const t=salaryTarget(meta);
 const target=salaryRangeAnnualYuan(value,{period:t.period,unit:t.unit});if(!target)return 0;
 const opt=salaryRangeAnnualYuan(text,{period:t.period,unit:salaryUnit(text)||'',median:target.median,inferUnit:true});if(!opt)return 0;
 const [lo,hi]=target.values,[ol,oh]=opt.values;
 const same=(a,b)=>a===b||Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(1,Math.abs(a)*.001);
 if(same(lo,ol)&&same(hi,oh))return 150;
 if(lo===hi&&lo>=ol&&lo<=oh)return 138;
 if(Number.isFinite(hi)&&Number.isFinite(oh)){
  const overlap=Math.max(0,Math.min(hi,oh)-Math.max(lo,ol));
  const span=Math.max(1,hi-lo,oh-ol);if(overlap/span>=.65)return 124;
 }
 return 0;
}
function numericOptionScore(text,value,meta={}){return salaryOptionScore(text,value,meta);}
function salaryNumberForInput(value,basicKey){const result=salaryConversion({basicKey},value);return result.error?null:result.value;}

function scalarControlError(el,value){
 if(el?.type!=='number')return '';
 const n=Number(value),min=el.getAttribute('min'),max=el.getAttribute('max'),step=el.getAttribute('step');
 if(min!==null&&n<Number(min)||max!==null&&n>Number(max))return '换算后的金额或时长超出网页允许范围，请调整内容';
 if(step!=='any'){
  const unit=Number(step||1),base=Number(min??el.getAttribute('value')??0);
  if(unit>0&&Math.abs((n-base)/unit-Math.round((n-base)/unit))>1e-7)return '换算后数值不符合网页步长 '+unit+'，请调整金额或时长；不会自动取整';
 }
 return '';
}

function salaryValueForControl(entry,value,policy='lower'){
 const target=salaryTarget(entry);const c=salaryConversion(entry,value,policy);
 if(target.numeric){if(c.error)throw new Error(c.error);const error=scalarControlError(entry.el,c.value);if(error)throw new Error(error);return c.value;}
 if(!c.error&&target.explicitPeriod&&c.parsed.period&&c.parsed.period!==target.period)return c.range.replace('～','-')+c.unitText;
 return value;
}
