// The ARIA pass claims a whole widget (for example [role="radiogroup"]) as one field. The
// choice pass must not register its options again as a second field for the same question.
function alreadyRegisteredEl(el){for(const entry of registry.values())if(entry.el===el)return true;return false;}

function scan(){
  if(stateUrl!==location.href){stateUrl=location.href;virtualRecordCounts.clear();activeAddTarget=null;}
  registry=new Map();scanId=crypto.randomUUID();sectionMarkers=buildSectionMarkers();const fields=[];let index=0;const seenRadio=new Set(),seenCustom=new Set(),registered=new WeakSet(),registeredEls=new WeakSet();
  for(const root of roots()){
    for(const el of root.querySelectorAll('input,textarea,select,[contenteditable="true"]')){
      if(auxiliaryControl(el)||el.matches('input')&&excluded.test(el.type))continue;
      const isEditable=el.getAttribute?.('contenteditable')==='true';
      const isSelect=selectLike(el);
      // A date picker can contain an editable "select" input (Phoenix, Ant,
      // Element, etc.). Date semantics win only when dateLike has identified a
      // real date; it explicitly excludes arrival/duration dropdowns.
      const nativeDate=el.tagName==='INPUT'&&(el.type==='date'||el.type==='month');
      const isDate=nativeDate||dateLike(el);
      const usable=el.type==='radio'||el.type==='checkbox'?choiceVisible(el):visible(el,{allowReadonly:isDate||isSelect||isEditable});if(!usable)continue;
      if(el.type==='radio'){
        const peers=radioGroup(el);const box=fieldContainer(el);const key=`radio:${el.form?.id||''}:${el.name||''}:${box?.id||shortText(box).slice(0,60)||index}`;if(seenRadio.has(key))continue;seenRadio.add(key);
        const id=String(index++);const extras=questionLabels(el,peers);const desc=describe(el,extras);registry.set(id,{kind:'radioGroup',el,peers});registered.add(el);registeredEls.add(el);
        fields.push({id,...desc,semanticLabels:extras.length?[...new Set(extras)]:desc.semanticLabels,label:extras[0]||desc.labels.find(x=>!peers.map(optionLabel).includes(x))||desc.labels[0]||`单选项 ${index}`,type:'radio-group',value:optionLabel(peers.find(x=>x.checked)||{value:''}),custom:false,required:fieldRequired(el,[...extras,...desc.labels]),options:peers.map(x=>({text:optionLabel(x),value:x.value}))});continue;
      }
      if(el.type==='checkbox'){
        // “至今” is an end-date modifier, not a second date input. A finite profile date
        // must never toggle it or report a later date rollback for this checkbox.
        if(/^至今$/.test((el.closest('.phoenix-checkbox')?.querySelector('.phoenix-checkbox__text')?.textContent||optionLabel(el)).trim()))continue;
        const id=String(index++);const desc=describe(el,questionLabels(el,[el]));registry.set(id,{kind:'checkbox',el});registered.add(el);registeredEls.add(el);
        fields.push({id,...desc,semanticLabels:desc.semanticLabels,label:desc.labels[0]||`复选项 ${index}`,type:'checkbox',value:el.checked?'是':'否',custom:false,required:fieldRequired(el,desc.labels),options:[{text:'是',value:'true'},{text:'否',value:'false'}]});continue;
      }
      const custom=isSelect||el.getAttribute('role')==='combobox'||el.hasAttribute('aria-controls'); // Each input is a separate field, even when range endpoints share aria-controls.

      const id=String(index++);const kind=isEditable?'contentEditable':(isDate?'dateWidget':(custom?'custom':'native'));registry.set(id,{kind,el});registered.add(el);registeredEls.add(el);const desc=describe(el);
      fields.push({id,...desc,label:desc.labels[0]||`未命名字段 ${index}`,type:kind==='dateWidget'?'date-widget':(kind==='contentEditable'?'rich-text':(el.type||el.tagName.toLowerCase())),value:kind==='contentEditable'?(el.innerText||el.textContent||''):read({kind,el}),custom:custom||kind==='dateWidget',required:fieldRequired(el,desc.labels),options:el.tagName==='SELECT'?Array.from(el.options).map(o=>({text:o.text,value:o.value})):[]});
    }
    // ARIA/common-library widgets that do not expose a usable native input.
    const widgets=root.querySelectorAll('[role="combobox"],[role="radiogroup"],[role="switch"],div[aria-haspopup="listbox"],button[aria-haspopup="listbox"],.ant-select-selector,.ant-cascader,.el-select__wrapper,.el-cascader,.ivu-select-selection,.arco-select-view,.semi-select,.t-input-adornment,.t-select,.n-base-selection,.n-cascader,.select2-selection,.layui-form-select,.MuiSelect-select,.MuiAutocomplete-root,[data-radix-select-trigger]');
    for(const el of widgets){
      if(auxiliaryControl(el)||el.matches('input,textarea,select')||!visible(el,{allowReadonly:true}))continue;
      if(el.querySelector('input,textarea,select')&&Array.from(el.querySelectorAll('input,textarea,select')).some(n=>registered.has(n)))continue;
      const key=el.getAttribute('aria-controls')||el.id||shortText(el)||`${el.className}:${index}`;if(key&&seenCustom.has(key))continue;if(key)seenCustom.add(key);
      const id=String(index++);const desc=describe(el);const widgetKind=el.getAttribute('role')==='switch'?'switchWidget':'ariaWidget';registry.set(id,{kind:widgetKind,el});const wv=widgetKind==='switchWidget'?(el.getAttribute('aria-checked')==='true'?'是':'否'):(el.getAttribute('data-value')||el.getAttribute('aria-valuetext')||el.textContent||'').trim();fields.push({id,...desc,label:desc.labels[0]||`选择项 ${index}`,type:el.getAttribute('role')||'custom-select',value:wv,custom:true,required:fieldRequired(el,desc.labels),options:widgetKind==='switchWidget'?[{text:'是',value:'true'},{text:'否',value:'false'}]:[]});
    }
    // Button/card based choices.
    // Phoenix (上海银行等) renders radio groups out of plain <div>s: a .phoenix-radio-group
    // holds .phoenix-radio-group__radioItem > .phoenix-radio, with no native input and no ARIA
    // role, so neither the input pass nor the ARIA pass can see them. The selected option is
    // marked with the "phoenix-radio--checked" class on the option root.
    const choiceNodes=Array.from(root.querySelectorAll('[role="radio"],[role="switch"],[aria-pressed],.ant-radio-wrapper,.ant-segmented-item,.el-radio,.el-radio-button,.ivu-radio-wrapper,.arco-radio,.semi-radio,.t-radio,.n-radio,.layui-form-radio,.MuiFormControlLabel-root,.MuiToggleButton-root,.phoenix-radio-group__radio,.radio-button,.radio-item,.choice-item,.option-item,.segmented-item')).filter(x=>!auxiliaryControl(x)&&visible(x,{allowReadonly:true}));
    const byParent=new Map();
    for(const node of choiceNodes){if(node.querySelector('input[type="radio"]'))continue;const parent=node.closest('[role="radiogroup"],.ant-radio-group,.ant-segmented,.el-radio-group,.ivu-radio-group,.arco-radio-group,.semi-radioGroup,.t-radio-group,.n-radio-group,.MuiFormGroup-root,.MuiToggleButtonGroup-root,.phoenix-radio-group,.radio-group,.choice-group,.segmented-group')||fieldContainer(node)||node.parentElement;if(!parent)continue;if(!byParent.has(parent))byParent.set(parent,[]);byParent.get(parent).push(node);}
    // byParent is already keyed by element identity, so the only dedup left is against the input and
    // ARIA passes above. A text key cannot do that job: several 是/否 groups reduce to the same short
    // text ("是否"), which made seenCustom collapse four separate questions into a single field.
    for(const [parent,nodes] of byParent){const uniq=[...new Set(nodes)];if(uniq.length<2||uniq.length>16)continue;
      if(registeredEls.has(parent)||uniq.some(n=>registeredEls.has(n))||alreadyRegisteredEl(parent))continue;
      const options=uniq.map(n=>({text:(n.textContent||n.getAttribute('aria-label')||n.getAttribute('data-value')||'').trim(),value:n.getAttribute('data-value')||''})).filter(o=>o.text&&o.text.length<50);if(options.length<2)continue;
      registeredEls.add(parent);
      const id=String(index++);const extras=questionLabels(parent,uniq);const desc=describe(parent,extras);registry.set(id,{kind:'clickGroup',el:parent,peers:uniq});const chosen=uniq.find(n=>n.getAttribute('aria-checked')==='true'||n.getAttribute('aria-pressed')==='true'||/checked|selected|active/.test(String(n.className)));
      fields.push({id,...desc,semanticLabels:extras.length?[...new Set(extras)]:desc.semanticLabels,label:extras[0]||desc.labels[0]||`点选项 ${index}`,type:'click-choice-group',value:chosen?(chosen.textContent||'').trim():'',custom:true,required:fieldRequired(parent,[...extras,...desc.labels]),options});}
  }
  // 第一阶段：只确定“属于哪个区块/哪个字段”，暂不按字段出现次数分配经历序号。
  // A split date range contributes several part inputs to ONE record, so its record index is counted per row.
  const rangeRowKey=new WeakMap(),rangeRowCounts=new Map();
  for(const field of fields){
    const entry=registry.get(field.id);
    if(activeAddTarget&&elementInActiveAddDialog(entry?.el)){
      const key=bestFieldKeyForGroup(field,activeAddTarget.group);
      if(key){field.groupHint=activeAddTarget.group;field.fieldKey=key;field.recordIndex=activeAddTarget.index;}
    }
    // 明确处于某个经历/家庭区块时，区块内字段语义优先于全局基本信息。
    // 例如“家庭关系 > 政治面貌”必须属于 family.N.political，不能误命中 basics.political。
    // 拆分日期范围行单独处理：一行「就读时间／起止时间」里每个年月日下拉都顶着同一个标签，
    // 别名打分分不开 start 和 end，只有控件在行内的位置能区分，所以先定区块再按位置定字段。
    if(!field.groupHint&&!field.basicKey){
      const side=dateRangeSideForField(field);
      if(side){
        const group=ResumeSchema.contextGroups(field.context).find(g=>ResumeCore.groups[g]?.fields.some(([key])=>key===side));
        if(group){
          field.groupHint=group;field.fieldKey=side;
          const row=entry?.el?.closest?.(FIELD_CONTAINER_SELECTOR);
          if(row){
            let n=rangeRowKey.get(row);
            if(n===undefined){n=rangeRowCounts.get(group)||0;rangeRowCounts.set(group,n+1);rangeRowKey.set(row,n);}
            field.recordIndex=n;
          }
        }
      }
    }
    if(!field.groupHint&&!field.basicKey){
      const groupHits=ResumeSchema.contextGroups(field.context).map(group=>[group,ResumeCore.groups[group]]);
      let picked=null;
      for(const [group] of groupHits){const best=bestFieldKeyForGroup(field,group);if(best){picked={group,best};break;}}
      if(picked){field.groupHint=picked.group;field.fieldKey=picked.best;}
    }
    if(!field.groupHint&&!field.basicKey&&field.label==='本科学习形式'){field.groupHint='education';field.fieldKey='studyType';field.recordIndex=0;}
    if(!field.groupHint&&!field.basicKey){
      const strong=strongSemanticIdentity(field);
      if(strong){if(strong.scope==='basics')field.basicKey=strong.key;else{field.groupHint=strong.scope;field.fieldKey=strong.key;}}
    }
    if(!field.groupHint){
      const semanticText=norm([field.context,...(field.semanticLabels||[])].filter(Boolean).join(' '));
      if(/是否(?:是|为)?独生(?:子女|子|女)|独生子女|独生女|独生子/.test(semanticText)) field.basicKey='onlyChild';
      // “政治面貌参加年月” asks when the party membership started, not which status it is.
      // Any time qualifier disqualifies the label from the status field.
      else if(/政治面貌|政治身份|政治情况|党派/.test(semanticText)&&!/(年月|日期|时间|何时)/.test(semanticText)) field.basicKey='political';
      const labels=semanticLabelsForField(field);let best=null,bestScore=0,second=0;
      for(const [key,,aliases] of ResumeCore.basics){let local=0;for(const alias of aliases){const a=norm(alias);if(!a)continue;for(const l of labels){let score=l===a||l===`请输入${a}`||l===`请选择${a}`?10:prefixAliasScore(a,l);local=Math.max(local,score);}}if(local>bestScore){second=bestScore;bestScore=local;best=key;}else if(local>second)second=local;}
      if(!field.basicKey&&best&&bestScore>=7&&bestScore>second)field.basicKey=best;
    }
  }
  // 第二阶段：重复经历只使用“同类字段在页面中的可见出现顺序”分配记录序号。
  // 不再混用锚点距离、DOM 中线和出现次数三套算法。招聘表单通常按记录自上而下重复同一字段结构，
  // 因此第 1 个工作开始时间对应第 1 段工作，第 2 个对应第 2 段工作；其它字段同理。
  // 新增弹窗中的字段已在第一阶段由 activeAddTarget 明确指定记录序号，不参与此计数。
  const counters=new Map(),partRows=new Map();
  for(const field of fields){
    if(!field.groupHint||Number.isInteger(field.recordIndex))continue;
    const key=field.fieldKey;
    if(!key)continue;
    const ck=`${field.groupHint}:${key}`;
    // 拆成“年+月”两个下拉的日期是同一个值：两个控件必须落在同一条记录里，只有行数才代表经历条数。
    const el=registry.get(field.id)?.el;
    const row=el&&datePartForEntry({...field,el})?el.closest?.(FIELD_CONTAINER_SELECTOR):null;
    if(row){
      let seen=partRows.get(key);
      if(!seen){seen=new WeakMap();partRows.set(key,seen);}
      let n=seen.get(row);
      if(n===undefined){n=counters.get(ck)||0;counters.set(ck,n+1);seen.set(row,n);}
      field.recordIndex=n;
      continue;
    }
    const n=counters.get(ck)||0;
    counters.set(ck,n+1);
    field.recordIndex=n;
  }
  // 根据已经识别出的语义修正控件类型。扫描控件时无法仅凭“入职时间”判断它是工作日期还是到岗选项，
  // 到这里已经知道字段归属，因此可以安全分流。
  for(const field of fields){
    const entry=registry.get(field.id);if(!entry?.el)continue;
    if(field.basicKey==='availableDate'||field.basicKey==='workYears'||field.fieldKey==='useTime'){
      if(entry.kind==='dateWidget') entry.kind=selectLike(entry.el)?'custom':'native';
      field.type=entry.kind==='custom'?'custom-select':(entry.el.type||entry.el.tagName.toLowerCase());
      field.custom=entry.kind==='custom';
    } else if(['birthday','graduationDate'].includes(field.basicKey)||((['start','end','date'].includes(field.fieldKey)&&['education','work','projects','campus','awards','certificates'].includes(field.groupHint))||(field.groupHint==='family'&&field.fieldKey==='birthDate'))){
      if(entry.el.tagName==='INPUT'&&!['checkbox','radio'].includes(entry.el.type)&&!datePartForEntry({...field,el:entry.el})){entry.kind='dateWidget';field.type='date-widget';field.custom=true;}
    }
  }
  for(const field of fields){
    const entry=registry.get(field.id);
    if(entry?.kind==='dateWidget'&&datePartForEntry({...field,el:entry.el})){
      entry.kind=selectLike(entry.el)?'custom':'native';field.type=entry.el.type||'text';field.custom=entry.kind==='custom';
    }
  }
  // Stable slot within the same canonical field. Re-scans may recreate DOM nodes, so
  // workflow code relocates a field by semantic identity + slot rather than by label text.
  // 日期部件（年/月/日）同样要存在字段自己身上：它原先靠字段 id 去注册表反查控件才能算出，而重扫会重新
  // 分配 id，旧字段按新注册表反查会拿到别的控件。算错部件 → 年、月两个控件身份相同 → 报“无法唯一定位”。
  for(const field of fields){const entry=registry.get(field.id);field.datePart=datePartForEntry({...field,el:entry?.el})||'';}
  const semanticSlots=new Map();
  for(const field of fields){
    const identity=field.basicKey?`b:${field.basicKey}`:(field.groupHint&&field.fieldKey?`g:${field.groupHint}:${Number.isInteger(field.recordIndex)?field.recordIndex:'?'}:${field.fieldKey}`:'');
    if(!identity){field.semanticSlot=0;continue;}
    const n=semanticSlots.get(identity)||0;field.semanticSlot=n;semanticSlots.set(identity,n+1);
  }
  for(const field of fields){const entry=registry.get(field.id);if(entry)Object.assign(entry,{groupHint:field.groupHint,fieldKey:field.fieldKey,recordIndex:field.recordIndex,basicKey:field.basicKey,semanticSlot:field.semanticSlot,label:field.label,context:field.context,semanticLabels:field.semanticLabels});}
  lastFields=fields;
  return {scanId,fields,iframeCount:document.querySelectorAll('iframe').length,undoCount:undoStack.length,url:location.href};
}
