async function chooseCustom(el,value,meta={}){
  const segments=locationSegments(value);
  const locationField=['birthplace','hukou','admissionHukou','city','cityPreference'].includes(meta?.basicKey)||/籍贯|户口|户籍|现居住|现居城市|行政区|地区|意向城市|意向工作城市|期望城市|期望工作城市/.test(String(meta?.label||meta?.context||''));
  // “成都优先”这类写法是偏好而不是行政区名称，解析不出省/市/区，继续往下走只会在候选里找不到然后报一句
  // “没有找到与资料一致的选项”，看不出该改哪里。宁可在这里说清楚，也不要猜一个省或市填进去。
  if(locationField&&!segments.length&&/优先|首选|第一/.test(String(value??'')))throw new Error(`资料里的${meta?.label||'地区'}是「${value}」，属于偏好表述而不是行政区名称，无法安全匹配候选；请在资料里写成具体城市（如「成都市」），或手动选择`);
  if(segments.length&&locationField)return await chooseRegionCascade(el,value,meta);
  if(locationField&&!segments.length&&el.closest?.('.phoenix-select')&&/市$/.test(String(value).trim()))return await choosePhoenixCity(el,value);
  const prior=new Set(popupRootsFor(el));
  const opener=await openCustom(el);
  const mokaRow=el.closest?.('[class*="apply-field-"]');
  const textBox=!!mokaRow&&(/string_info/.test(String(mokaRow.className))||/请输入/.test(String(el.getAttribute?.('placeholder')||'')));
  let opened=popupRootsFor(el).filter(n=>!prior.has(n));
  // 鼠标点容器没反应时补一次键盘展开：不少下拉只在 input 已聚焦时才弹菜单，那一下点击反被外层容器吃掉。
  if(!opened.length)opened=await openByKeyboard(el,prior);
  // 文本框永远只看本次点击弹出的东西：空数组意味着“这个控件根本没有菜单”，
  // 不能回落到全文档查找，否则会把别的字段的菜单当成自己的选项。
  const scope=textBox?opened:(opened.length?opened:undefined);
  // 浮层刚弹出的那一瞬间就把证据抓下来：一旦失焦或再次点击，浮层就被关掉，事后再看只剩空数组。
  const seen=popupEvidence(opened);
  // 优先用“本次点击新弹出的菜单”：页面上有多个同类控件（学历、起止年月各一份）时，全文档查找会拿到
  // 别的控件的菜单，点下去就会写错字段。没有新菜单时保持原行为。
  let opts=optionNodes(el,scope),hit=bestOption(opts,value,meta);
  // typed/searchBox 声明在函数级：搜索分支里的赋值要带到后面“if(typed)return typed”用，写在块里会出作用域错误。
  let typed=null,searchBox=null;
  // listed 记住“确实找到过候选”的那一次结果：搜索过程中菜单会先开后关，事后再扫常常是空数组，
  // 直接拿它报错就会写成“没有找到任何选项”，把真实原因（选项在、但没匹配上）盖掉。
  let listed=opts;
  // 浮层里明明有文字、却一个候选行都识别不出来时：多半是这个站点的选项行用了我们没收录的类名
  // （类名按部署哈希，静态存档里也未必出现）。按文字取最深的那个节点直接点，点完照样过读回校验，
  // 点错只是白点一次，不会写坏字段，更不会谎报成功。
  if(!hit&&scope&&scope.length){
   const loose=deepTextMatches(scope,value,meta);
   if(loose.length){const node=loose[0];hit={text:(node.textContent||'').trim(),el:node,value:node.getAttribute?.('data-value')||''};}
  }
  // Moka 的“意向工作城市”顶层只列省份，点开某个省才展开它的城市；资料里是不带省的单段地名（「成都市」），
  // 既解析不出省市区、也匹配不到省份候选。这类控件只能逐个展开分组，找到目标为止。
  if(!hit&&locationField&&!segments.length)hit=await findByExpandingGroups(el,value,meta);
  // 只有控件完全没弹出菜单时才当作文本框。真的下拉即使没匹配项也不该键入：输入会停在 input 里，
  // 而 el.value 正好等于我们键入的内容，回读会自己印证自己，变成谎报成功。
  const behavedAsSelect=!textBox&&(listed.length>0||opened.length>0);
  if(!hit){
    const input=likelySearchInput(el,opener);
    if(input){
      searchBox=input;
      const before=input.value;
      const searches=[String(value)];
      if(meta?.fieldKey==='useTime'){const r=durationRangeYears(value,{fieldKey:'useTime'});if(r){const y=(r[0]+(Number.isFinite(r[1])?r[1]:r[0]))/2;searches.push(String(Number.isInteger(y)?y:y.toFixed(1)));}}
      for(const q of [...new Set(searches)]){
       // 键入时不能先失焦：可搜索下拉靠“边输入边过滤候选”工作，一 blur 菜单就关掉，后面永远读不到选项。
       await forceTextValue(input,q,{keepFocus:true});await delay(240);
       opts=optionNodes(el,scope);if(opts.length)listed=opts;
       hit=bestOption(opts,value,meta);if(hit)break;
       // Semi 的可搜索下拉只认 Enter 提交，没有这一步就永远选中不了任何一项。
       commitByKey(input);await delay(320);
       opts=optionNodes(el,scope);if(opts.length)listed=opts;
       hit=bestOption(opts,value,meta);if(hit)break;
       // 浮层里一个可点的候选都没有时，网页可能接受键入并自行提交（Moka 的年份/月份下拉就是这种）。
       // 成败只认网页自己的回读：输入框里若还留着自己键入的原文，就说明网页压根没接受，照旧报失败。
       if(typedCommitAccepted(el,opener,input,q,value,meta)){typed=q;break;}
      }
      try{if(!hit&&input.ownerDocument.activeElement===input)input.blur();}catch{}
      // 没搜到就把搜索文字撤掉：否则输入框里会留着用户没选中的半截内容，页面看上去像是填了又没填。
      if(!hit&&!typed)try{await forceTextValue(input,before);}catch{}
    }
  }
  if(typed)return typed;
  if(!hit&&!behavedAsSelect&&await typeIntoCustom(el,value,meta))return String(value);
  if(!hit){
   // 报错里带上实际找到的候选：页面上常有多个同类控件，不说清楚就无法判断是菜单没展开、扫到了别人的菜单，
   // 还是这个控件真的没有该选项。下一次反馈就能直接定位，不必再来回试。
   // 控件当时的真实 HTML 说明“它是什么”，浮层里出现的文字与浮层 HTML 说明“菜单里到底有什么”，两者缺一不可。
   const shape=String(el.outerHTML||'').replace(/\s+/g,' ').slice(0,300);
   const found=listed.length?`菜单里找到的候选：${[...new Set(listed.map(o=>o.text))].slice(0,12).join('、')}`:`没有找到任何菜单或选项；控件当前 HTML=${shape}`;
   throw new Error(`${behavedAsSelect?'自定义下拉已打开，但没有找到与资料一致的选项':'该控件既没有可选项，也接受不了直接输入，请手动填写'}；${found}；${seen}`);
  }
 // 只认本次点击真正弹出的浮层。上一个字段失败后，它的民族弹层会一直挂在页面上；
 // 按全文档找就会把那个残留浮层当成当前字段的，于是学习形式、学历、学位这些普通下拉
 // 也被套上“点左侧圆形图标 + 等已选 N”的民族规则，然后必然报“民族选择器没有确认选中”。
 const own=opened.length?opened:(prior.size===1?[...prior]:[]);
 const phoenix=own.find(n=>n.matches?.('.constant-main-selector-container,.area-selector-container'));
 // 民族弹层带“已选 x/y”计数器；同族但没有计数器的就是普通下拉，按普通候选点击。
 const ethnicityPopup=phoenix?.matches('.constant-main-selector-container')&&/已选\s*\d/.test(phoenix.textContent||'');
 if(ethnicityPopup){
   // 民族弹层的文字只是展示，真正的选择事件在左侧圆形图标。
   const row=hit.el.closest('.list-item-container')||hit.el.querySelector?.('.list-item-container')||hit.el;
   smartClick(row.querySelector?.('.icon-container')||row);await delay(120);
   if(!/已选\s*[1-9]/.test(phoenix.textContent||''))throw new Error('已找到候选项，但民族选择器没有确认选中');
 }else smartClick(hit.el);
 await delay(120);
 if(phoenix){
  confirmPhoenixSelector(el,phoenix.matches('.area-selector-container')?'area':'constant',phoenix);await delay(160);
  }
  let ok=await verifyCustomSelection(el,opener,value,meta,hit);
  // Semi 的候选行常是多层嵌套（选项文本层套在行容器里），点到外层容器不会选中，只是点了个空白。
  // 逐个尝试同文本的更深节点与最近的候选祖先，每一步都用回读校验，点错不会留下结果、更不会谎报成功。
  for(const alt of ok?[]:sameTextNodes(hit.el,hit.text)){smartClick(alt);await delay(200);ok=await verifyCustomSelection(el,opener,value,meta,hit);if(ok)break;}
  if(!ok){
   hit.el.focus?.();for(const type of ['keydown','keyup'])hit.el.dispatchEvent(new KeyboardEvent(type,{key:' ',code:'Space',bubbles:true,cancelable:true}));await delay(220);
   ok=await verifyCustomSelection(el,opener,value,meta,hit);
  }
  if(!ok){
   // 读回到什么值决定了原因：读回为空 = 网页没接受（点在容器上或候选不可点）；读回成别的值 = 点到了同名的其他项。
   const seen=selectedCustomText(el,opener);
   throw new Error(`已点击候选项「${hit.text}」，但网页没有确认最终选择（读回：${seen.length?seen.join('、'):'空'}；候选节点仍连接=${!!hit.el?.isConnected}；当前可见浮层=${popupRootsFor(el).length}）`);
  }
  return hit.text;
}
async function chooseClickGroup(entry,value){
  const opts=entry.peers.map(n=>({text:(n.textContent||n.getAttribute('aria-label')||n.getAttribute('data-label')||n.getAttribute('data-value')||'').trim(),value:n.getAttribute('data-value')||n.getAttribute('value')||'',el:n})).filter(x=>x.text);
  const hit=bestOption(opts,value,entry);if(!hit)throw new Error('点选项无可靠匹配，请手动选择');smartClick(hit.el);await delay(180);
  const selected=hit.el.getAttribute('aria-checked')==='true'||hit.el.getAttribute('aria-pressed')==='true'||hit.el.getAttribute('data-state')==='checked'||/checked|selected|active/.test(String(hit.el.className))||hit.el.querySelector?.('input[type="radio"]:checked,input[type="checkbox"]:checked');
  const actual=read(entry);
  if(!selected&&!semanticEquivalent(actual,hit.text,entry))throw new Error('已点击点选项，但网页没有确认最终选择');
  return actual||hit.text;
}
// Semi/Moka wraps plain text inputs in the same "select" container it uses for real dropdowns, and the two
// are indistinguishable from the saved markup (手机号码 carries a +86 prefix select and a caret, exactly like
// 性别 does). So when no option matches, fall back to typing the value and confirm the page kept it. A real
// dropdown will not accept the keystrokes, read-back fails, and the field is still reported as needing manual
// work rather than reported as filled.
async function typeIntoCustom(el,value,meta){
  const text=String(value??'').trim();
  if(!text||text.length>240||el.readOnly||el.disabled||el.type==='date'||el.type==='month')return false;
  const max=Number(el.getAttribute?.('maxlength'))||0;
  if(max>0&&text.length>max)return false;
  try{await forceTextValue(el,text);}catch{return false;}
  for(let i=0;i<8;i++){
    await delay(90);
    if(selectedCustomText(el,el.closest?.('label')||el).some(t=>semanticEquivalent(t,text,meta)))return true;
  }
  return false;
}
