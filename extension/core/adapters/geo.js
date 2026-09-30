function locationSegments(value){const text=String(value||'').replace(/\s/g,'');const hits=text.match(/[^省市区县]+(?:省|市|区|县)/g)||[];return hits.length>=2?hits:[];}
function regionTextEqual(a,b){const ca=String(a||'').trim().replace(/\s+/g,''),cb=String(b||'').trim().replace(/\s+/g,'');if(!ca||!cb)return false;if(ca===cb)return true;return stripLocationSuffix(ca)===stripLocationSuffix(cb)&&stripLocationSuffix(cb).length>=2;}
function regionOptionNodes(el,segment){
  const out=[],seen=new Set();const scopes=popupRootsFor(el);
  const preferred='[role=\"option\"],[role=\"menuitem\"],li,button,a,[class*=\"option\" i],[class*=\"item\" i],[class*=\"region\" i],[class*=\"province\" i],[class*=\"city\" i],[class*=\"district\" i],[class*=\"area\" i],[class*=\"cascade\" i],div,span';
  for(const scope of scopes){for(const n of scope.querySelectorAll?.(preferred)||[]){if(!visible(n,{allowReadonly:true}))continue;const t=(n.textContent||n.getAttribute?.('aria-label')||'').trim().replace(/\s+/g,' ');if(!regionTextEqual(t,segment))continue;
      // Prefer the smallest clickable node whose text is exactly the requested administrative division.
      const childSame=Array.from(n.children||[]).some(c=>regionTextEqual((c.textContent||'').trim(),segment));if(childSame)continue;
      const key=`${t}|${n.className||''}`;if(seen.has(key))continue;seen.add(key);let score=0;
      if(n.matches?.('[role=\"option\"],[role=\"menuitem\"],li,button,a'))score+=60;if(/option|item|region|province|city|district|area|cascade|cell/i.test(String(n.className)))score+=40;if(n.children?.length===0)score+=15;if(t===segment)score+=30;out.push({el:n,text:t,score});
    }}
  return out.sort((a,b)=>b.score-a.score);
}
async function chooseRegionCascade(el,value,meta={}){
  const segments=locationSegments(value);if(segments.length<1)throw new Error('地区资料不足，无法进行地区选择');
 const opener=await openCustom(el);let clicked=0;
 // 先锁定本次打开的那一个地区弹层。前面字段失败残留的弹层还在时，每一步重新 find 会选到别的那个，
 // 于是点着点着点进了别人的列表，最后报“网页未保留目标值”。
 const areaScope=popupRootsFor(el).find(n=>n.matches?.('.area-selector-container'));
 if(areaScope){
    for(const segment of segments){
      const scope=areaScope;
      // 弹层刚打开时地区行是异步渲染的，等一拍再找，否则会误报“未找到”。
      for(let i=0;i<10&&!scope.querySelector('.area-item-container');i++)await delay(120);
      const hits=Array.from(scope?.querySelectorAll('.area-item-container')||[]).filter(n=>regionTextEqual(n.querySelector('.area-text-label')?.textContent,segment));
      if(hits.length!==1)throw new Error(`地区选择器中未找到唯一的“${segment}”；${popupEvidence(scope?[scope]:[])}`);
      // 凤凰地区行的事件绑在文字节点上；点整行容器会留在省份列表。
      smartClick(hits[0].querySelector('.area-text-label')||hits[0]);await delay(180);
    }
    confirmPhoenixSelector(el,'area',areaScope);await delay(180);
    const raw=('value' in el?el.value:'')||selectedCustomText(el,opener).join(' ');
    if(raw&&(raw.includes(stripLocationSuffix(segments.at(-1)))||regionTextEqual(raw,segments.at(-1))))return raw;
    throw new Error('地区已选择并确定，但网页未保留目标值');
  }
  // Some fields named “现居住城市” are a single-level city selector even though the
  // profile stores province + city. If the deepest segment is already visible, select it
  // directly instead of incorrectly insisting on a province first.
  for(const segment of segments.slice(1).reverse()){
    const direct=regionOptionNodes(el,segment);
    if(direct.length===1){
      smartClick(direct[0].el);await delay(260);
      const texts=selectedCustomText(el,opener),raw=('value' in el?el.value:'')||texts.join(' ');
      if(raw&&(regionTextEqual(raw,segment)||norm(raw).includes(norm(stripLocationSuffix(segment)))))return raw;
      // If the click opened a deeper level rather than committing, continue with cascade.
      break;
    }
  }
  for(const segment of segments){let hits=regionOptionNodes(el,segment);
    if(!hits.length){const input=likelySearchInput(el,opener);if(input){const before=input.value;await forceTextValue(input,stripLocationSuffix(segment),{keepFocus:true});await delay(260);hits=regionOptionNodes(el,segment);if(!hits.length)await forceTextValue(input,before,{keepFocus:true});}}
    if(!hits.length)throw new Error(`地区选择器中未找到“${segment}”；${popupEvidence(popupRootsFor(el))}`);if(hits[1]&&hits[0].score===hits[1].score)throw new Error('地区候选项有歧义');smartClick(hits[0].el);clicked++;await delay(260);
  }
  await delay(260);const texts=selectedCustomText(el,opener);const raw=('value' in el?el.value:'')||texts.join(' ');const last=segments.at(-1),city=segments.at(-2);
  if(raw&&(regionTextEqual(raw,last)||raw.includes(stripLocationSuffix(last))||(raw.includes(stripLocationSuffix(city))&&raw.includes(stripLocationSuffix(last)))))return raw;
  throw new Error('已完成省市区点击，但网页未确认最终地区值');
}
async function choosePhoenixCity(el,value){
  const opener=await openCustom(el);
  const scope=popupRootsFor(el).find(n=>n.matches?.('.area-selector-container'));
  if(!scope)throw new Error('城市选择器没有展开');
  const search=scope.querySelector('.area-search-input input');
  if(search){await forceTextValue(search,String(value).trim(),{keepFocus:true});await delay(260);}
  const hits=Array.from(scope.querySelectorAll('.area-item-container')).filter(n=>regionTextEqual(n.querySelector('.area-text-label')?.textContent,value));
  if(hits.length!==1)throw new Error(`地区选择器中未找到唯一的“${value}”；${popupEvidence([scope])}`);
  smartClick(hits[0].querySelector('.area-text-label')||hits[0]);await delay(180);
  confirmPhoenixSelector(el,'area');await delay(180);
  const raw=('value' in el?el.value:'')||selectedCustomText(el,opener).join(' ');
  if(raw&&(regionTextEqual(raw,value)||norm(raw).includes(norm(stripLocationSuffix(value)))))return raw;
  throw new Error('城市已选择并确定，但网页未保留目标值');
}
