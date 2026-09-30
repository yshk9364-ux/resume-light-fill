// Domain selection is declarative; site hints always fall back to generic DOM rules.
const siteRules=globalThis.ResumeSiteRules;
const host=location.hostname.toLowerCase();
const siteAdapter=siteRules.filter(r=>r.domains.some(d=>host===d||host.endsWith('.'+d))).sort((a,b)=>Math.max(...b.domains.map(x=>x.length))-Math.max(...a.domains.map(x=>x.length)))[0]||{name:'GenericAdapter',section:'section,fieldset'};
const FRAMEWORKS={'Ant Design':'.ant-form-item','Element Plus/UI':'.el-form-item','Arco':'.arco-form-item','Naive UI':'.n-form-item','TDesign':'.t-form__item','Vant':'.van-field','Material UI':'.MuiFormControl-root','Bootstrap':'.form-group','LayUI':'.layui-form-item','iView/View UI':'.ivu-form-item'};
const SUBMIT_DENY=/投递|提交|申请职位|立即申请|apply\s*(now|for)|submit|send\s*application/i;
function safeAction(el,kind){
 const text=buttonText(el);if(SUBMIT_DENY.test(text)||SUBMIT_DENY.test(el.getAttribute('aria-label')||''))return false;
 if(kind==='save')return /^(保存|确定|完成|添加|新增|保存本条|保存经历|save|ok|confirm|done)$/i.test(text);
 return true;
}
function sectionGroup(el){
 const explicit=el.closest?.('[data-resume-section]')?.getAttribute('data-resume-section');if(ResumeCore.groups[explicit])return explicit;
 const section=el.closest?.(siteAdapter.section);const heading=section?.querySelector('h2,h3,legend,.section-title,.module-title');
 const ctx=heading?.textContent||inferContext(el);const groups=ResumeSchema.contextGroups(ctx);return groups.length===1?groups[0]:null;
}
function recordContainers(group){
 const selector=(siteAdapter.record?siteAdapter.record+',':'')+'[data-resume-record],.resume-record,.record-card,.experience-item,.education-item,.work-item,.ux-standard-form,tbody > tr';
 return roots().flatMap(r=>Array.from(r.querySelectorAll(selector))).filter(el=>visible(el,{allowReadonly:true})&&sectionGroup(el)===group).filter((el,_,all)=>!all.some(other=>other!==el&&el.contains(other)));
}
function recordFitsProfileRow(el,group,row){
 if(group!=='work'||!row?.workType)return true;
 const ctx=inferContext(el),type=norm(row.workType);
 if(/实习/.test(ctx))return /实习/.test(type);
 if(/工作经历|正式工作/.test(ctx))return !/实习/.test(type);
 return true;
}
const identityFields={education:'school',work:'company',projects:'name',family:'relation',campus:'organization',computerSkills:'category',professionalSkills:'name',languages:'language',awards:'name',certificates:'name'};
function recordIdentity(el,group,rows){
 const key=identityFields[group];if(!key)return -1;
 const text=norm(el.textContent+' '+Array.from(el.querySelectorAll('input,select,textarea')).map(x=>x.value).join(' '));
 const matches=rows.map((row,i)=>({i,v:norm(row[key])})).filter(x=>x.v&&text.includes(x.v));
 return matches.length===1?matches[0].i:-1;
}
function adapterName(entry){
 const el=entry?.el;if(!el)return 'UnknownAdapter';
 if(el.type==='file')return 'UploadAdapter';
 if(/年份|year/i.test(entry.label||''))return 'YearPickerAdapter';
 if(el.getAttribute('contenteditable')==='true'&&!el.closest('.ql-editor,.ProseMirror,.tox-edit-area'))return 'ContentEditableAdapter';
 if(entry.kind==='dateWidget')return el.type==='month'?'MonthPickerAdapter':el.type==='date'?'DateInputAdapter':'DatePickerAdapter';
 if(entry.kind==='custom'||entry.kind==='ariaWidget'){
  const c=String(el.className)+' '+String(el.parentElement?.className);
  return /cascader/i.test(c)?'CascaderAdapter':/tree/i.test(c)?'TreeSelectAdapter':/autocomplete/i.test(c)?'AutocompleteAdapter':'SearchSelectAdapter';
 }
 return {radioGroup:'RadioAdapter',checkbox:'CheckboxAdapter',clickGroup:'ButtonGroupAdapter',contentEditable:'RichTextAdapter',switchWidget:'CheckboxAdapter'}[entry.kind]||(el.tagName==='SELECT'?'NativeSelectAdapter':el.tagName==='TEXTAREA'?'TextareaAdapter':'TextInputAdapter');
}
