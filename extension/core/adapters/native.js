function setNative(el,value){
  const win=el.ownerDocument.defaultView||window;const proto=el.tagName==='SELECT'?win.HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;
  const property=el.type==='checkbox'||el.type==='radio'?'checked':'value';const setter=Object.getOwnPropertyDescriptor(proto,property)?.set;if(!setter)throw new Error('无法写入该控件');setter.call(el,value);
  for(const name of ['input','change'])el.dispatchEvent(new Event(name,{bubbles:true,composed:true}));el.dispatchEvent(new FocusEvent('blur',{bubbles:true,composed:true}));
}
function activateNativeChoice(el,want=true){
  const old=!!el.checked;
  if(want){
    const label=Array.from(el.labels||[]).find(x=>visible(x,{allowReadonly:true}))||el.closest?.('label,.ant-radio-wrapper,.el-radio,.el-radio-button,.ivu-radio-wrapper,.arco-radio,.semi-radio,.t-radio,.n-radio,.layui-form-radio,.MuiFormControlLabel-root');
    smartClick(label||el);
    if(!el.checked)setNative(el,true);
  }else if(el.checked){smartClick(Array.from(el.labels||[]).find(x=>visible(x,{allowReadonly:true}))||el);if(el.checked)setNative(el,false);}
  else setNative(el,false);
  return old;
}
function read(entry){
  const el=entry.el;
  if(entry.kind==='radioGroup')return optionLabel(entry.peers.find(x=>x.checked)||{value:''});
  if(entry.kind==='clickGroup'){const hit=entry.peers.find(n=>n.getAttribute('aria-checked')==='true'||n.getAttribute('aria-pressed')==='true'||n.getAttribute('data-state')==='checked'||/checked|selected|active/.test(String(n.className)));return hit?(hit.textContent||hit.getAttribute('aria-label')||hit.getAttribute('data-value')||'').trim():'';}
  if(entry.kind==='checkbox')return el.checked?'是':'否';
  if(entry.kind==='switchWidget')return (el.getAttribute('aria-checked')==='true'||el.getAttribute('data-state')==='checked'||/checked|selected|active/.test(String(el.className)))?'是':'否';
  if(entry.kind==='contentEditable')return (el.innerText||el.textContent||'').trim();
  if(['dateWidget','custom'].includes(entry.kind)){
   const phoenix=el.closest?.('.phoenix-select');
   // 读回口径必须和 dateDisplayValue 一致（tipEle / calcEle / input 逐个回退）。
   // 这里原来只读 tipEle，于是一旦提示层还没渲染，已经填好的日期和下拉会被最终校验推翻。
   if(phoenix)return dateDisplayValue(el);
   // Semi/Moka (Moka 全站) 把选中的标签放在 display-value 兄弟节点里，input 自己始终是空的。
   // 只读 input 会把“已经选中”读成“没填”，于是刚填好的日期下拉会被填完后的最终校验推翻。
   const display=el.closest?.('label')?.querySelector?.('[class*="sd-Input-display-value"]');
   const shown=(display?.textContent||'').trim();
   if(shown)return shown;
  }
  if('value' in el)return el.value??'';
  return (el.getAttribute?.('data-value')||el.getAttribute?.('aria-valuetext')||el.textContent||'').trim();
}
// A short, stable fingerprint of the control that failed. Reported back to the popup so a bug report
// names the widget library and structure instead of just saying "写入失败".
function describeEntry(entry){
  const el=entry?.el;if(!el)return '';
  const classes=n=>String(n?.className||'').split(/\s+/).filter(Boolean).slice(0,4).join('.');
  return [entry.kind,el.tagName.toLowerCase(),el.type||'',classes(el),el.firstElementChild?'▸'+classes(el.firstElementChild):''].filter(Boolean).join(' / ');
}
