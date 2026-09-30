async function fill(request){
  if(request.scanId!==scanId)throw new Error('页面扫描已过期，请重新识别');const reports=[];
  for(const item of request.items){const entry=registry.get(item.id);try{
    const usable=entry?.kind==='radioGroup'?entry.peers.some(choiceVisible):entry?.kind==='checkbox'?choiceVisible(entry.el):visible(entry?.el,{allowReadonly:['dateWidget','custom','ariaWidget','switchWidget','contentEditable'].includes(entry?.kind)});if(!entry||!entry.el||!usable)throw new Error('字段已变化，请重新识别');if(typeof item.value!=='string'||!item.value.trim())throw new Error('简历资料为空');const effectiveValue=valueForEntry(entry,item.value,item);
    const before=read(entry);if(semanticEquivalent(entry.el.tagName==='SELECT'?entry.el.selectedOptions[0]?.text||before:before,effectiveValue,entry)){
      if(entry.el.validity&&!entry.el.validity.valid||entry.el.getAttribute('aria-invalid')==='true')throw new Error('网页已有值未通过格式校验');
      reports.push({id:item.id,ok:true,skipped:true,message:'已有值与 profile 一致'});continue;
    }if(!request.overwrite&&before&&before!=='否')throw new Error('保留网页已有内容');
    if(entry.kind==='radioGroup'){
      if(!request.overwrite&&entry.peers.some(x=>x.checked))throw new Error('保留已选择的单选项');const opts=entry.peers.map(x=>({text:optionLabel(x),value:x.value,el:x}));const hit=bestOption(opts,effectiveValue,entry);if(!hit)throw new Error('单选项无可靠匹配，请手动选择');const peersBefore=entry.peers.map(x=>({el:x,before:x.checked}));activateNativeChoice(hit.el,true);await delay(100);if(!hit.el.checked)throw new Error('网页没有接受单选点击');undoStack.push({kind:'radioGroup',peersBefore,chosen:hit.el});
    } else if(entry.kind==='clickGroup'){
      const chosen=await chooseClickGroup(entry,item.value);undoStack.push({kind:'custom',el:entry.el,before,after:chosen});
    } else if(entry.kind==='checkbox'){
      if(!['yes','no'].includes(choiceNorm(effectiveValue)))throw new Error('布尔选项不明确');const want=choiceNorm(effectiveValue)==='yes';const old=entry.el.checked;if(!request.overwrite&&old)throw new Error('保留网页已有选择');if(want)activateNativeChoice(entry.el,true);else setNative(entry.el,false);if(old!==want)undoStack.push({kind:'checkbox',el:entry.el,before:old,after:want});
    } else if(entry.kind==='switchWidget'){
      if(!['yes','no'].includes(choiceNorm(effectiveValue)))throw new Error('布尔选项不明确');const want=choiceNorm(effectiveValue)==='yes';const old=read(entry)==='是';if(!request.overwrite&&old)throw new Error('保留网页已有选择');if(old!==want){smartClick(entry.el);await delay(160);}const now=read(entry)==='是';if(now!==want)throw new Error('网页未确认开关选择，请手动检查');undoStack.push({kind:'custom',el:entry.el,before:old?'是':'否',after:now?'是':'否'});
    } else if(entry.kind==='contentEditable'){
      const old=read(entry);entry.el.focus?.();entry.el.textContent=effectiveValue;entry.el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:effectiveValue}));entry.el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));entry.el.dispatchEvent(new FocusEvent('blur',{bubbles:true,composed:true}));await delay(100);const now=read(entry);if(norm(now)!==norm(effectiveValue))throw new Error('富文本字段读回值与资料不一致');undoStack.push({kind:'contentEditable',el:entry.el,before:old,after:now});
    } else if(entry.kind==='dateWidget'){
      const chosen=await chooseDateWidget(entry.el,effectiveValue);await delay(120);const actual=read(entry);if(!semanticEquivalent(actual,effectiveValue,{...entry,label:entry.label||'日期'}))throw new Error('日期控件已操作，但读回值与资料不一致');undoStack.push({kind:'custom',el:entry.el,before,after:actual});
    } else if(entry.kind==='custom'||entry.kind==='ariaWidget'){
      const chosen=await chooseCustom(entry.el,effectiveValue,entry);await delay(100);const actual=read(entry);if(actual&&!semanticEquivalent(actual,chosen,entry)&&!semanticEquivalent(actual,effectiveValue,entry))throw new Error('选择控件读回值与目标不一致');undoStack.push({kind:'custom',el:entry.el,before,after:actual||chosen});
    } else {
      const value=convertNative(entry.el,effectiveValue,entry);setNative(entry.el,value);await delay(90);const after=read(entry);if(after!==before)undoStack.push({kind:'native',el:entry.el,before,after});if(String(after)!==String(value))throw new Error('网页未保留填写值，请手动检查');if(entry.el.validity&&!entry.el.validity.valid)throw new Error('已填入，但未通过网页格式校验，请检查');
    }
    // 框架重绘会把控件整个换掉，此时上面那次读回读的是已经脱页的旧节点，不能据此认定写成功。
    // 走最终重扫的流程（fillReviewed）把「已脱页」这个事实交给上层，由重扫在活页面上重新定位并读回确认；
    // 其余调用方没有这层兜底，只能在这里直接报失败。
    let detached=false;
    if(!entry.el.isConnected){
     if(!request.deferDetachCheck)throw new Error('控件在交互后被替换，需要重新扫描验证');
     detached=true;
    }
    const sourceDate=parseDateValue(item.value);
    const assumedDay=sourceDate?.day==null&&sourceDate&&isDateEntry(entry)&&
      (datePartForEntry(entry)==='day'||!datePartForEntry(entry)&&!monthControl(entry.el));
    reports.push({id:item.id,ok:true,detached,message:assumedDay?'已填写并校验；资料只有年月，日期按 1 号填写':'已填写并校验'});
  }catch(error){reports.push({id:item.id,ok:false,message:error.message,value:item.value,control:describeEntry(entry)});}}
  return {reports,undoCount:undoStack.length};
}
