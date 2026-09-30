function chineseDurationNumber(text){
  const map={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
  const m=String(text||'').match(/(十|[一二两三四五六七八九](?:十[一二三四五六七八九]?)?)/);if(!m)return null;const x=m[1];
  if(x==='十')return 10;if(x.includes('十')){const [a,b]=x.split('十');return (map[a]||1)*10+(map[b]||0);}return map[x]??null;
}
function durationRangeYears(text,meta={}){
  let s=String(text||'').trim().toLowerCase();const allowBare=meta?.fieldKey==='useTime'||/使用时间|使用年限|使用时长|经验年限|熟练时间/.test(String(meta?.label||meta?.context||''));
  const hasUnit=/年|月|year|month/.test(s);if(!hasUnit&&!allowBare)return null;
  let nums=[...s.matchAll(/\d+(?:\.\d+)?/g)].map(m=>Number(m[0])).filter(Number.isFinite);
  if(!nums.length){const cn=chineseDurationNumber(s);if(cn!=null)nums=[cn];}
  if(!nums.length)return null;if(!hasUnit&&nums.some(n=>n<0||n>50))return null;
  const factor=/月|month/.test(s)?1/12:1;let lo=nums[0]*factor,hi=(nums[1]??nums[0])*factor;
  if(/以上|及以上|不少于|不低于|>=|≥|more than|over|at least/.test(s))hi=Infinity;
  if(/以下|以内|不超过|不满|不足|少于|<=|≤|<|less than|under/.test(s)){hi=lo;lo=0;}
  return [Math.min(lo,hi),Math.max(lo,hi)];
}
function durationOptionScore(text,value,meta={}){
  const t=durationRangeYears(value,{...meta,fieldKey:'useTime'}),o=durationRangeYears(text,meta);if(!t||!o)return 0;
  const target=(t[0]+(Number.isFinite(t[1])?t[1]:t[0]))/2;
  // 区间边界不能打平：例如资料=3年，网页同时有“1-3年”和“3-5年”。
  // 优先把精确边界当作新区间起点，其次才是旧区间终点，避免两个选项同分后被放弃。
  const eps=1e-9;
  if(Math.abs(target-o[0])<eps)return 166;
  if(Number.isFinite(o[1])&&Math.abs(target-o[1])<eps&&o[0]<target)return 158;
  if(target>o[0]&&target<o[1])return 162;
  if(target>=o[0]&&target<=o[1])return 154;
  const om=(o[0]+(Number.isFinite(o[1])?o[1]:o[0]))/2,d=Math.abs(target-om);
  // 档位没有精确值时保守选择较低档，避免把 4 年填成 5 年。
  if(Number.isFinite(o[1])&&o[1]<target){if(d<=1.25)return 116;if(d<=2)return 98;}
  if(o[0]>target){if(d<=0.5)return 104;if(d<=1)return 92;}
  return 0;
}

function durationConversion(entry,value,policy='lower'){
 const el=entry?.el;
 const label=[entry?.label,...(entry?.semanticLabels||[])].filter(Boolean).join(' ');
 const row=el?fieldContainer(el):null;
 const suffix=Array.from(row?.querySelectorAll?.('.el-input-group__append,.ant-input-suffix,.unit,[data-unit]')||[]).map(n=>n.textContent).join(' ');
 const hint=[el?.getAttribute?.('data-unit'),el?.getAttribute?.('placeholder'),suffix].filter(Boolean).join(' ');
 const monthly=/月|month/i.test(hint)||!(/年|year/i.test(hint))&&/月|month/i.test(label);
 const numeric=el?.type==='number'||/numeric|decimal/.test(el?.getAttribute?.('inputmode')||'')||/年|月|year|month/i.test(hint);
 if(!numeric)return null;
 const raw=String(value||'').trim();
 const mixed=raw.match(/^(\d+(?:\.\d+)?)\s*年\s*(\d+(?:\.\d+)?)\s*(?:个)?月$/);
 const source=/年|月|year|month/i.test(raw)?raw:raw+(monthly?'个月':'年');
 const range=mixed?[Number(mixed[1])+Number(mixed[2])/12,Number(mixed[1])+Number(mixed[2])/12]:durationRangeYears(source,{...entry,fieldKey:'useTime'});
 if(!range||!Number.isFinite(range[1]))return {error:'使用时长需要明确数值，不能从“以上”等范围猜测'};
 const vals=range.map(n=>n*(monthly?12:1));const n=policy==='upper'?vals[1]:policy==='midpoint'?(vals[0]+vals[1])/2:vals[0];
 return {value:String(Number(n.toFixed(4))),range:vals.map(n=>String(Number(n.toFixed(4)))).join('～'),unitText:monthly?'个月':'年',isRange:vals[0]!==vals[1],scalar:true,policy,duration:true};
}
