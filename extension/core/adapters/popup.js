function popupRootsFor(el){
  const out=[];const seen=new Set();const add=n=>{if(n&&n.isConnected&&!seen.has(n)){seen.add(n);out.push(n);}};
  const root=el.getRootNode?.()||document;
  for(const attr of ['aria-controls','aria-owns'])for(const id of String(el.getAttribute?.(attr)||'').split(/\s+/).filter(Boolean))add(root.getElementById?.(id)||document.getElementById(id));
  const opener=el.closest?.('[role="combobox"],.phoenix-select,.ant-select,.ant-cascader,.el-select,.el-cascader,.ivu-select,.arco-select,.semi-select,.t-select,.n-select,.n-cascader,.select2-container,.layui-form-select,.MuiAutocomplete-root,[data-radix-select-trigger]');
  if(opener){for(const attr of ['aria-controls','aria-owns'])for(const id of String(opener.getAttribute?.(attr)||'').split(/\s+/).filter(Boolean))add(root.getElementById?.(id)||document.getElementById(id));}
  if(out.some(n=>visible(n,{allowReadonly:true})))return out.filter(n=>visible(n,{allowReadonly:true}));
  // Moka (app.mokahr.com) runs Semi UI with an "sd-" prefix and per-deploy hashed class names, so match on
  // the stable prefix. "menu-item" sits inside "menu", hence the :not() — otherwise the innermost-element
  // filter below would keep the option row as the scope and then find nothing inside it.
  const popupSel='[role="listbox"],[role="tree"],[role="menu"],.phoenix-selectList__contentWraper,.constant-main-selector-container,.area-selector-container,.ant-select-dropdown,.ant-cascader-menus,.el-select-dropdown,.el-cascader__dropdown,.ivu-select-dropdown,.arco-select-popup,.arco-cascader-popup,.semi-select-option-list,.semi-portal,.t-popup__content,.n-base-select-menu,.n-cascader-menu,.select2-container--open,.select2-dropdown,.layui-anim-upbit,.dropdown-menu,.van-picker,.van-popup,.MuiPopover-root,.MuiAutocomplete-popper,[data-radix-popper-content-wrapper],[data-state="open"],[class*="sd-Select-menu"]:not([class*="sd-Select-menu-item"]),[class*="sd-Cascader-menu"],[class*="month-range-select-tooltip"],[class*="sd-Select-selectPicker"]';
  // 就读时间这类月份范围控件是 Moka 自己的组件（类名无 sd- 前缀），浮层为 month-range-select-tooltip；
  // 它的选项行类名无法离线得知，因此由“找不到选项”的报错带回控件当前 HTML 再定。
  for(const r of roots())for(const n of r.querySelectorAll(popupSel))if(visible(n,{allowReadonly:true}))add(n);
  return out.filter(n=>!out.some(other=>other!==n&&other.contains(n)));
}
function optionNodes(el,scopesIn){
  const arr=[],seen=new Set();
  const sel='[role="option"],[role="treeitem"],[role="radio"],[role="menuitemradio"],.phoenix-selectList__listItem,.list-item-container,.area-item-container,.ant-select-item-option,.ant-cascader-menu-item,.el-select-dropdown__item,.el-cascader-node,.ivu-select-item,.arco-select-option,.arco-cascader-option,.semi-select-option,.semi-cascader-option,.t-select-option,.t-cascader__item,.n-base-select-option,.n-cascader-option,.select2-results__option,.layui-anim-upbit dd,.layui-form-select dd,.MuiMenuItem-root,.MuiAutocomplete-option,[data-radix-collection-item],li[data-value],li.option,.van-picker-column__item,.el-tree-node__content,.ant-select-tree-node-content-wrapper,.select-option,.option-item,.dropdown-item,dd[data-value],[class*="sd-Select-common-item"],[class*="sd-Select-menu-item"],[class*="sd-Cascader-option"]';
  const scopes=scopesIn||popupRootsFor(el);if(scopes.length>1)throw new Error('多个候选浮层，无法确定控件归属');
  const scanScope=scope=>{for(const o of scope.querySelectorAll?.(sel)||[]){if(!visible(o,{allowReadonly:true})||/disabled/.test(String(o.className))||o.getAttribute('aria-disabled')==='true')continue;const txt=(o.textContent||o.getAttribute('aria-label')||o.getAttribute('data-label')||o.getAttribute('data-value')||'').trim().replace(/\s+/g,' ');if(!txt||txt.length>120)continue;const key=`${txt}|${o.getAttribute('data-value')||''}`;if(seen.has(key))continue;seen.add(key);arr.push({text:txt,value:o.getAttribute('data-value')||o.getAttribute('value')||'',el:o});}};
  for(const scope of scopes)scanScope(scope);

  return arr;
}
async function openCustom(el){
  // A Semi/Moka select only opens when its container is clicked, not when the inner input is, so the
  // container is part of the opener chain. sd-Select-container also wraps plain text inputs there, which
  // is why chooseCustom falls back to typing when no option exists.
  const opener=el.closest?.('[role="combobox"],.phoenix-select,.ant-select,.ant-cascader,.ant-cascader-picker,.el-select,.el-cascader,.ivu-select,.arco-select,.arco-cascader,.semi-select,.semi-cascader,.t-select,.t-cascader,.n-select,.n-cascader,.select2-container,.layui-form-select,.MuiSelect-root,.MuiAutocomplete-root,[data-radix-select-trigger],[class*="select-wrap"],[class*="cascader"],[class*="sd-Select-container"]')||el;
  // 依次尝试：容器 → 内部 input → 箭头图标。Semi 在 focus 时就展开菜单，随后那次点击反而会把它关掉，
  // 只点一次会停在“已关闭”状态；逐个目标试到真有新浮层出现为止，每一步都以浮层为准而不是以点击次数为准。
  const caret=opener?.querySelector?.('[class*="sd-Select-addon"],[class*="sd-Icon-iconcaret"],[class*="arrow"],[class*="caret"],[aria-label*="展开"]');
  const before=new Set(popupRootsFor(el));
  for(const target of [opener,el,caret]){
   if(!target)continue;
   if(target===opener){try{el.focus?.();}catch{}await delay(80);if(popupRootsFor(el).some(n=>!before.has(n)))return el;}
   smartClick(target);await delay(280);
   if(popupRootsFor(el).some(n=>!before.has(n)))return target;
  }
  return opener;
}
function likelySearchInput(el,opener){
  const pops=popupRootsFor(el),candidates=[],phoenix=pops.some(p=>p.matches?.('.constant-main-selector-container,.area-selector-container'));
  if(!phoenix)candidates.push(el,...Array.from(opener?.querySelectorAll?.('input')||[]));
  for(const p of pops)candidates.push(...Array.from(p.querySelectorAll?.('input')||[]));
  if(phoenix)candidates.push(el,...Array.from(opener?.querySelectorAll?.('input')||[]));
  return candidates.find(x=>x?.tagName==='INPUT'&&visible(x,{allowReadonly:true})&&!x.disabled&&!x.readOnly&&x.type!=='hidden');
}
function confirmPhoenixSelector(el,kind,scopeHint){
 // scopeHint 是本次点击弹出的那个浮层。页面上还挂着别的同类浮层时，不能凭 className 认错对象。
 if(scopeHint&&!scopeHint.matches?.(kind==='area'?'.area-selector-container':'.constant-main-selector-container'))return false;
 const scope=scopeHint||popupRootsFor(el).find(n=>n.matches?.(kind==='area'?'.area-selector-container':'.constant-main-selector-container'));
 if(!scope)return false;
 const buttons=Array.from(scope.querySelectorAll('.phoenix-button__content'));
 const confirm=buttons.find(n=>n.textContent.trim()==='确定');
 if(!confirm)throw new Error('选择器已选中候选项，但找不到“确定”按钮');
 smartClick(confirm.closest('.phoenix-button__wraper')||confirm);
 return true;
}
// Semi 的可搜索下拉只认 Enter 提交：forceTextValue 只发了 input/change 并 blur，页面不会选中任何项，
// 于是“键入了正确年份”永远停在输入框里。补一次键盘提交，再交给读回校验判断成败。
function commitByKey(el){
 const win=el.ownerDocument.defaultView||window;
 for(const type of ["keydown","keypress","keyup"]){
  try{el.dispatchEvent(new win.KeyboardEvent(type,{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true,cancelable:true}));}catch{}
 }
 try{el.dispatchEvent(new win.KeyboardEvent("keydown",{key:"Tab",code:"Tab",keyCode:9,which:9,bubbles:true,cancelable:true}));}catch{}
}
// Semi 的候选行可能有多层：匹配到的文本节点未必就是可点的行（也可能在行的里面）。
// 收集它周围同文本的节点，交给调用方逐级尝试点击；每次尝试后都必须回读校验，点错不会留下结果。
function sameTextNodes(el,text){
  const out=[],seen=new Set(),want=String(text||'').trim().replace(/\s+/g,' ');
  if(!el||!want)return out;
  const match=n=>String(n.textContent||'').trim().replace(/\s+/g,' ')===want;
  for(const n of el.querySelectorAll?.('*')||[])if(n!==el&&match(n)&&!seen.has(n)){seen.add(n);out.push(n);}
  for(const n of [el.closest?.('[role="option"],[role="menuitem"],[class*="option"],[class*="item"]'),el.parentElement])if(n&&match(n)&&!seen.has(n)){seen.add(n);out.push(n);}
  return out;
}
// 浮层里的候选行可能用的是我们没收录的类名：Moka 每个部署都重新哈希类名，静态存档里也未必出现。

// 浮层里明明有文字、却一个候选行都识别不出来时，退回到“按文字取最深的那个节点”。点击照样要过读回校验，
// 点错只会白点一次，不会写坏字段，更不会谎报成功——这是准确率优先时唯一安全的兼底。
function deepTextMatches(scope,value,meta={}){
  const out=[],seen=new Set();
  for(const root of [].concat(scope||[]))for(const n of root.querySelectorAll?.('*')||[]){
   if(n.children.length)continue;
   const txt=(n.textContent||'').trim().replace(/\s+/g,' ');
   if(!txt||txt.length>60||seen.has(n))continue;
   if(!semanticEquivalent(txt,value,meta)&&norm(txt)!==norm(value))continue;
   if(!visible(n,{allowReadonly:true}))continue;
   seen.add(n);out.push(n);
  }
  return out.slice(0,12);
}
// 报错要能定位，靠的就是这两样：控件 HTML 说明“它是什么”，浮层里出现的文字与浮层 HTML 说明“菜单里到底有什么”。
// 两者都必须在浮层刚弹出的那一刻抓：一旦失焦或再次点击，浮层就被关掉，事后再看只剩空数组。
function popupEvidence(pops){
  const list=[...pops];
  if(!list.length)return'没有找到任何浮层';
  return`可见浮层=${list.length}；${list.slice(0,2).map(p=>{
   const texts=[...new Set([...p.querySelectorAll('*')].filter(n=>!n.children.length).map(n=>(n.textContent||'').trim().replace(/\s+/g,' ')).filter(t=>t&&t.length<=24))].slice(0,12);
   return`浮层类名=${String(p.className||'').replace(/\s+/g,' ').slice(0,90)}；浮层里看到的文字=${texts.join('、')||'（空）'}；浮层 HTML=${String(p.outerHTML||'').replace(/\s+/g,' ').slice(0,400)}`;
  }).join(' || ')}`;
}
// 鼠标点容器没反应时补一次键盘展开：不少下拉只在 input 已聚焦、且焦点事件带“展开”意图时才弹菜单，
// 那一下点击反而被外层容器吃掉。判据始终是“有没有新浮层”，不是“点了几次”。
async function openByKeyboard(el,prior){
  const win=el.ownerDocument.defaultView||window;
  try{el.focus?.();}catch{}
  for(const key of ['ArrowDown','Enter',' ']){
   for(const type of ['keydown','keyup'])try{el.dispatchEvent(new win.KeyboardEvent(type,{key,code:key,keyCode:key==='ArrowDown'?40:13,which:key==='ArrowDown'?40:13,bubbles:true,cancelable:true}));}catch{}
   await delay(260);
   const found=popupRootsFor(el).filter(n=>!prior.has(n));
   if(found.length)return found;
  }
  return[];
}
// Moka 的“意向工作城市”顶层只有省，点开某个省才展开它的城市（Semi 的可折叠 Menu，不是级联件）。
// 资料里写的是「成都市」这种不带省的单段地名，解析不出省市区，只能逐个展开找到它为止。
function expandableRows(scope){
  const out=[],seen=new Set();
  for(const root of [].concat(scope||[]))for(const n of root.querySelectorAll?.('*')||[]){
   if(seen.has(n))continue;
   if(!n.querySelector?.('[class*="arrow" i],[class*="caret" i],[class*="expand" i],[class*="spread" i],[aria-expanded]'))continue;
   if(!visible(n,{allowReadonly:true}))continue;
   // 折叠行的名字是它自己的第一个文本节点（“<div>江苏<span class=arrow></span><div>城市…</div></div>”里的“江苏”），
   // 用整段 textContent 会把已展开的城市也包进去，展开前后名字就变了，循环会把同一行反复点。
   const own=n.firstChild&&n.firstChild.nodeType===3?(n.firstChild.textContent||''):(n.textContent||'');
   const text=own.trim().replace(/\s+/g,' ');
   if(!text||text.length>12)continue;
   seen.add(n);out.push({el:n,text});
  }
  return out;
}
// 逐个展开可折叠分组，直到目标文字直接可见为止。每展开一个就重新找一次，找不到就换下一个；
// 全都试过还找不到就返回 null，照旧报失败——绝不因为“点过很多下”就声称成功。
async function findByExpandingGroups(el,target,meta,maxSteps=30){
  const opened=new Set();
  for(let step=0;step<maxSteps;step++){
   const pops=popupRootsFor(el);if(!pops.length)return null;
   const direct=deepTextMatches(pops,target,meta);
   if(direct.length)return{text:(direct[0].textContent||'').trim(),el:direct[0],value:''};
   const row=expandableRows(pops).find(r=>!opened.has(r.text));
   if(!row)return null;
   opened.add(row.text);smartClick(row.el);await delay(240);
  }
  return null;
}
