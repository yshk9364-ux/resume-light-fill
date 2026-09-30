function allKnownAliases(){
  if(allKnownAliases.cache)return allKnownAliases.cache;
  const out=[];
  for(const [key,,aliases] of ResumeCore.basics)for(const a of aliases||[])out.push({scope:'basics',key,alias:norm(a)});
  for(const [group,def] of Object.entries(ResumeCore.groups))for(const [key,,aliases] of def.fields)for(const a of aliases||[])out.push({scope:group,key,alias:norm(a)});
  allKnownAliases.cache=out.filter(x=>x.alias);
  return allKnownAliases.cache;
}
// A label may repeat a known alias and then add a qualifier: “政治面貌参加年月” repeats the alias
// “政治面貌” but asks for a date, not for the status. Plain prefix scoring would bind it to
// basics.political and then push “中共党员” into a date picker. When the leftover text carries a time
// qualifier the prefix no longer names the same field, so the alias scores nothing.
const TIME_QUALIFIER=/年月|日期|时间|何时|年份|几号|多久/;
function prefixAliasScore(alias,label){
  if(!alias||!label)return 0;
  if(TIME_QUALIFIER.test(label.slice(alias.length)))return 0;
  return label.startsWith(alias)||alias.startsWith(label)?7:0;
}
function exactKnownAlias(text){
  const n=norm(String(text||'').replace(/[＊*：:]/g,'').trim());if(!n)return [];
  return allKnownAliases().filter(x=>x.alias===n);
}
function geometricFieldLabel(el){
  if(!el?.getBoundingClientRect)return'';
  const er=el.getBoundingClientRect();
  let scope=fieldContainer(el)||el.parentElement||document.body;
  // Walk up only a little; enough for two-column form items without swallowing the entire form.
  for(let i=0;i<3&&scope?.parentElement;i++){
    const candidates=[];
    for(const n of scope.querySelectorAll?.('label,.label,.form-label,.control-label,.ant-form-item-label,.el-form-item__label,.arco-form-label-item,.semi-form-field-label,.t-form__label,.ivu-form-item-label,.n-form-item-label,dt,th,span,p,div')||[]){
      if(n===el||n.contains(el)||n.querySelector?.('input,textarea,select,[role="combobox"]'))continue;
      const t=shortText(n).replace(/[＊*：:]/g,'').trim();if(!t||!exactKnownAlias(t).length)continue;
      const r=n.getBoundingClientRect();if(!r.width||!r.height)continue;
      const above=r.bottom<=er.top+10; const vgap=er.top-r.bottom;
      const xOverlap=Math.min(r.right,er.right)-Math.max(r.left,er.left);
      const sameCol=xOverlap>Math.min(er.width,r.width)*0.18 || Math.abs((r.left+r.right)/2-(er.left+er.right)/2)<Math.max(90,er.width*.45);
      const left=r.right<=er.left+18; const hgap=er.left-r.right; const ydiff=Math.abs((r.top+r.bottom)/2-(er.top+er.bottom)/2);
      let score=-1;
      if(above&&vgap>=-10&&vgap<=90&&sameCol)score=300-vgap-Math.abs(r.left-er.left)*.08;
      else if(left&&hgap>=-10&&hgap<=280&&ydiff<=45)score=220-hgap-ydiff*2;
      if(score>=0)candidates.push({t,score});
    }
    if(candidates.length){candidates.sort((a,b)=>b.score-a.score);return candidates[0].t;}
    scope=scope.parentElement;
  }
  return'';
}
function strongSemanticIdentity(field){
  const labels=semanticLabelsForField(field);const hits=[];
  for(const l of labels){for(const x of allKnownAliases())if(x.alias===l)hits.push(x);}
  if(!hits.length)return null;
  const uniq=[];const seen=new Set();for(const h of hits){const k=`${h.scope}:${h.key}`;if(!seen.has(k)){seen.add(k);uniq.push(h);}}
  // A summary field in the personal section (for example “最高学历”)
  // must not consume an education-record slot before the real education form.
  if(/个人信息|个人基本信息|基本信息/.test(field.context||'')){const basicHits=uniq.filter(h=>h.scope==='basics');return basicHits.length===1?basicHits[0]:null;}
  if(uniq.length===1)return uniq[0];
  const contextual=uniq.filter(h=>h.scope!=='basics'&&ResumeCore.groups[h.scope]?.context?.test(field.context||''));
  if(contextual.length===1)return contextual[0];
  return null;
}
function fieldContainer(el){
  const nearest=el?.closest?.(FIELD_CONTAINER_SELECTOR);
  // Several recruitment systems put the input in an internal <li> inside a
  // select/date widget. That <li> is not the form row and has no field label.
  if(nearest?.tagName==='LI'&&/input.?wrapper|select__|picker__/.test(String(nearest.className))){
    return nearest.parentElement?.closest?.(FIELD_CONTAINER_SELECTOR)||nearest;
  }
  return nearest||el?.parentElement||null;
}
