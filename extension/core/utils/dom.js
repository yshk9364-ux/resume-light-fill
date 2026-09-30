function roots(root=document,seen=new Set()){
 if(seen.has(root))return [];seen.add(root);const result=[root];
 for(const el of root.querySelectorAll('*')){
  if(el.shadowRoot)result.push(...roots(el.shadowRoot,seen));
  if(el.tagName==='IFRAME')try{if(el.contentDocument)result.push(...roots(el.contentDocument,seen));}catch{}
 }return result;
}
function delay(ms){return new Promise(r=>setTimeout(r,ms));}
function visible(el,{allowReadonly=false}={}){if(!el||!el.isConnected||el.disabled)return false;const css=(el.ownerDocument.defaultView||window).getComputedStyle(el);return !!el.getClientRects().length&&css.display!=='none'&&css.visibility!=='hidden'&&(allowReadonly||!el.readOnly);}
function choiceVisible(el){
  if(visible(el,{allowReadonly:true}))return true;
  if(!el||!el.isConnected||el.disabled)return false;
  for(const label of Array.from(el.labels||[]))if(visible(label,{allowReadonly:true}))return true;
  const wrap=el.closest?.('label,.ant-radio-wrapper,.el-radio,.el-radio-button,.ivu-radio-wrapper,.arco-radio,.semi-radio,.t-radio,.n-radio,.layui-form-radio,.MuiFormControlLabel-root,[role="radio"],[role="switch"]');
  return !!wrap&&visible(wrap,{allowReadonly:true});
}
function dateLike(el){
  if(!el||el.tagName!=='INPUT')return false;
  if(el.type==='date'||el.type==='month')return true;
  const text=[el.getAttribute('placeholder'),el.getAttribute('aria-label'),el.getAttribute('title'),el.name,el.id,el.className,el.parentElement?.className,...directFieldLabels(el)].filter(Boolean).join(' ');
  // 明确属于“选择/年限”的时间不进入日期模块；“入职时间”不能全局排除，因为工作经历里它通常就是日期。
  if(/到岗时间|可到岗|预计到岗|最快到岗|使用时间|使用年限|使用时长|经验年限|熟练时间|工作年限/.test(text))return false;
  const pickerClass=/ant-picker|date-picker|datepicker|el-date|arco-picker|semi-datepicker|t-date-picker|n-date-picker|ivu-date|mx-datepicker|calendar/i.test(text);
  const dateMeaning=/出生日期|出生年月|入学时间|入学日期|毕业时间|毕业日期|开始时间|开始日期|结束时间|结束日期|入职时间|入职日期|离职时间|离职日期|获奖时间|获得时间|颁发时间|发证时间|取得时间|年月|日期/.test(text);
  return pickerClass||dateMeaning;
}
function selectLike(el){if(!el||el.tagName!=='INPUT')return false;const text=[el.getAttribute('placeholder'),el.getAttribute('aria-label'),el.getAttribute('title'),el.name,el.id,el.className,el.parentElement?.className,el.parentElement?.parentElement?.className].filter(Boolean).join(' ');return el.getAttribute('role')==='combobox'||el.hasAttribute('aria-controls')||el.hasAttribute('aria-haspopup')||/请选择|select|combobox|cascader|tree-select|autocomplete|下拉|选择|picker|select2|layui-select|n-base-selection|MuiSelect|MuiAutocomplete/i.test(text);}
function cleanLabel(el){if(!el)return'';const copy=el.cloneNode(true);for(const control of copy.querySelectorAll('input,textarea,select,button,[role="button"],[role="radio"]'))control.remove();return (copy.textContent||'').trim().replace(/\s+/g,' ').slice(0,160);}
function shortText(el){const t=cleanLabel(el);return t&&t.length<=80?t:'';}


const AUXILIARY_CONTROL_SELECTOR='.common-unmodeled-layer,.phoenix-date-picker-special-check,.phoenix-calendar,.phoenix-calendar-picker,.ant-picker-dropdown,.el-picker-panel,.arco-picker-dropdown,.constant-main-selector-container,.area-selector-container,.ant-select-dropdown,.el-select-dropdown,.phoenix-selectList__contentWraper';
function auxiliaryControl(el){return !!el?.closest?.(AUXILIARY_CONTROL_SELECTOR);}
