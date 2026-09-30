function parseComparableDate(text){const p=parseDateValue(text);return p?`${p.year}-${String(p.month).padStart(2,'0')}${p.day!=null?'-'+String(p.day).padStart(2,'0'):''}`:'';}
function semanticEquivalent(actual,expected,meta={}){
  const a=String(actual??'').trim(),e=String(expected??'').trim();if(!a||!e)return false;
  if(isDateEntry(meta)&&datePartForEntry(meta)&&/^\d+\s*[年月日]?$/.test(a)&&/^\d+$/.test(e))return Number(a.replace(/\D/g,''))===Number(e);
  if(norm(a)===norm(e))return true;
  if(choiceNorm(a)===choiceNorm(e)&&choiceNorm(e)!==norm(e))return true;
  if(meta?.fieldKey==='level'&&LEVEL_MAP[e]===a)return true;
  if(meta?.fieldKey==='useTime'&&(meta?.kind==='native'||!meta?.kind&&!meta?.custom)&&meta?.el?.tagName!=='SELECT'){const c=durationConversion(meta,e);if(c&&!c.error){const r=c.range.split('～').map(Number),n=Number(a);return a.trim()!==''&&Number.isFinite(n)&&n>=r[0]-0.0001&&n<=r.at(-1)+0.0001;}}
  if(meta?.fieldKey==='useTime'){const ar=durationRangeYears(a,{...meta,fieldKey:'useTime'}),er=durationRangeYears(e,{...meta,fieldKey:'useTime'});if(ar&&er){const t=(er[0]+(Number.isFinite(er[1])?er[1]:er[0]))/2;return t>=ar[0]&&t<=ar[1];}}
  if(['salary','expectedAnnualSalary','currentSalary'].includes(meta?.basicKey)||meta?.fieldKey==='annualSalary'){if((meta?.kind==='native'||!meta?.kind&&!meta?.custom)&&meta?.el?.tagName!=='SELECT'&&salaryTarget(meta).numeric){const c=salaryConversion(meta,e);const n=Number(a);return !c.error&&a.trim()!==''&&Number.isFinite(n)&&n>=Math.min(...c.parsed.values)/((c.target.period==='month'?c.parsed.payMonths:1)*salaryFactor(c.target.unit))-0.0001&&n<=Math.max(...c.parsed.values)/((c.target.period==='month'?c.parsed.payMonths:1)*salaryFactor(c.target.unit))+0.0001;}return salaryOptionScore(a,e,meta)>=100;}
  if(['birthplace','hukou','admissionHukou','city'].includes(meta?.basicKey)){const segs=locationSegments(e);if(segs.length){const last=stripLocationSuffix(segs.at(-1)),prev=stripLocationSuffix(segs.at(-2));const na=norm(a);if(na.includes(norm(last))&&(segs.length<3||na.includes(norm(prev))))return true;}}
  // 单段地名（「成都市」）：网页回读常是「四川省, 成都市」「四川 成都」这种组合值。目标地名整体出现在回读里、
  // 且去掉“省/市/区/县”后仍不少于两个字，就认它。这仍然是网页自己的回读，不是我们自己键进去的字。
  if(['birthplace','hukou','admissionHukou','city','cityPreference'].includes(meta?.basicKey)&&!locationSegments(e).length){
   const bare=stripLocationSuffix(e);
   if(bare.length>=2&&norm(a).includes(norm(bare)))return true;
  }
  const ad=parseComparableDate(a),ed=parseComparableDate(e);if(ad&&ed){
   // 期望值只有年月时按年月比。反过来：网页控件只能表达年月、而资料是具体某一天时（Moka 的出生日期存
   // “2004-02 (22岁)”），年月一致就接受——那个控件存不下这一日，报失败只会让人反复手动填同一个月。
   if(ed.length===7)return ad.slice(0,7)===ed;
   if(ad.length===7&&ed.length===10)return !meta?.el?.closest?.('.phoenix-select')&&ad===ed.slice(0,7);
   return ad===ed;
  }
  return false;
}
// ignoreInputValue：判断“键入 + 回车”有没有被网页接受时必须带上这个开关。输入框里那半截文字是我们自己
// 键进去的，拿它当回读等于自己印证自己——网页可能压根没接受。选中时 Semi 会把标签写进 display-value
// 并清空搜索框，所以“网页自己的回读”只认 display-value、aria-valuetext、data-value 和被选中的候选行。
function selectedCustomText(el,opener,{ignoreInputValue=false}={}){
  const texts=[];const add=v=>{v=String(v||'').trim().replace(/\s+/g,' ');if(v&&v.length<160)texts.push(v);};
  if(el.readOnly)add(el.value);add(el.getAttribute?.('data-value'));add(el.getAttribute?.('aria-valuetext'));
  // Semi/Moka keeps the chosen label in a sibling display span; the input's own value stays empty, so
  // reading it back is the only way to confirm the page accepted the choice.
  if(!el.readOnly&&!ignoreInputValue)add(el.value);
  if(!el.readOnly&&!ignoreInputValue)add(el.value);
  for(const n of (el.closest?.('label')||opener||el).querySelectorAll?.('[class*="sd-Input-display-value"]')||[])add(n.textContent);
  add(opener?.getAttribute?.('data-value'));add(opener?.getAttribute?.('aria-valuetext'));
 add(el.closest?.('.phoenix-select')?.querySelector('.phoenix-select__tipEle')?.textContent);
 // calcEle 与 input 一样始终存在；tipEle 要等提示层渲染完才有。两者都读，才不会在值已生效时读回空串。
 add(el.closest?.('.phoenix-select')?.querySelector('.phoenix-select__calcEle')?.textContent);
  for(const n of opener?.querySelectorAll?.('[aria-selected="true"],[aria-checked="true"],.selected,.active,.is-selected,.ant-select-selection-item,.el-select__selected-item,.arco-select-view-value,.semi-select-selection-text,.MuiSelect-select')||[]){add(n.value);add(n.textContent);add(n.getAttribute?.('data-value'));}
  return [...new Set(texts)];
}
// “键入 + 回车”到底有没有被网页接受：只看网页自己的回读，不看输入框里那个值。
// 那半截文字是我们自己键进去的，它还留着就说明网页没提交；它被清空、同时 display-value 出现目标值，
// 才是网页真的收下了。页面自己把值改写成别的样子（如补上“年”字）也算网页接手。
function typedCommitAccepted(el,opener,input,typed,value,meta){
  const strong=selectedCustomText(el,opener,{ignoreInputValue:true});
  if(strong.some(t=>semanticEquivalent(t,typed,meta)||semanticEquivalent(t,value,meta)))return true;
  const left=String(input?.value??'').trim();
  if(!left||left===String(typed??'').trim())return false;
  return semanticEquivalent(left,typed,meta)||semanticEquivalent(left,value,meta);
}
async function verifyCustomSelection(el,opener,expected,meta,hit){
  await delay(180);
  const hitSelected=hit?.el?.isConnected&&(hit.el.getAttribute('aria-selected')==='true'||hit.el.getAttribute('aria-checked')==='true'||hit.el.getAttribute('data-state')==='checked'||/selected|active|checked|is-selected/.test(String(hit.el.className)));
  const texts=selectedCustomText(el,opener);
  if(hitSelected||texts.some(t=>semanticEquivalent(t,hit.text||expected,meta)||semanticEquivalent(t,expected,meta)))return true;
  return false;
}
