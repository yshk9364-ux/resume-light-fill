const ADD_PATTERNS={
  family:/(?:添加|新增|增加|新建|继续添加|再添加).*(?:家庭|亲属|家属|父母|配偶)|(?:家庭|亲属|家属|父母).*(?:添加|新增)|add.*(?:family|relative)/i,
  education:/(?:添加|新增|增加|新建|继续添加|再添加).*(?:教育|学历|院校|学校)|(?:教育|学历|院校|学校).*(?:添加|新增)|add.*(?:education|academic)/i,
  work:/(?:添加|新增|增加|新建|继续添加|再添加).*(?:工作|实习|任职|就业)|(?:工作|实习|任职).*(?:添加|新增)|add.*(?:work|employment|experience)/i,
  projects:/(?:添加|新增|增加|新建|继续添加|再添加).*(?:项目|课题)|(?:项目|课题).*(?:添加|新增)|add.*project/i,
  campus:/(?:添加|新增|增加|新建|继续添加|再添加).*(?:校园|校内|在校实践|学生工作|社团|干部)|(?:校园|校内|在校实践|学生工作|社团).*(?:添加|新增)|add.*(?:campus|student|club)/i,
  awards:/(?:添加|新增|增加|新建|继续添加|再添加).*(?:奖项|荣誉|获奖|奖励)|(?:奖项|荣誉|获奖).*(?:添加|新增)|add.*(?:award|honor)/i,
  certificates:/(?:添加|新增|增加|新建|继续添加|再添加).*(?:证书|资格|资质)|(?:证书|资格).*(?:添加|新增)|add.*(?:certificate|license)/i,
  professionalSkills:/(?:添加|新增|增加|新建|继续添加|再添加).*(?:专业技能|技能)|(?:专业技能|技能).*(?:添加|新增)|add.*skill/i,
  computerSkills:/(?:添加|新增|增加|新建|继续添加|再添加).*(?:计算机技能|电脑技能|软件技能)|(?:计算机技能|电脑技能|软件技能).*(?:添加|新增)|add.*(?:computer|software).*skill/i,
  languages:/(?:添加|新增|增加|新建|继续添加|再添加).*(?:英语能力|外语能力|语言能力|语言)|(?:英语能力|外语能力|语言能力).*(?:添加|新增)|add.*language/i
};
const GENERIC_ADD=/^(?:\+|＋)?\s*(?:添加|新增|增加|新建|继续添加|再添加|添加一项|新增一项|添加一条|新增一条|add|new)(?:\s*(?:一项|一条|经历|记录))?\s*(?:\+|＋)?$/i;
function currentRecordCount(group){
  let max=-1;
  for(const f of lastFields)if(f.groupHint===group&&Number.isInteger(f.recordIndex))max=Math.max(max,f.recordIndex);
  const real=max+1,virtual=Number(virtualRecordCounts.get(group)||0);return Math.max(real,virtual);
}
function buttonText(el){return (el.textContent||el.value||el.getAttribute?.('aria-label')||el.getAttribute?.('title')||el.getAttribute?.('data-label')||'').trim().replace(/\s+/g,' ');}
// styled-components and similar frameworks render the add trigger as a bare <span>/<div>
// whose class is a build hash, so tag and class heuristics never match it. The label text
// is the only stable signal, so collect leaf elements that read as an add action and let
// the per-group patterns below rank them. Cached per scan because the text sweep is a
// full-page pass and addButtonFor is called once per group.
let addTextCache=[],addTextCacheScan='';
function addTextCandidates(){
 if(addTextCacheScan===scanId)return addTextCache;
 const found=[];
 for(const r of roots())for(const el of r.querySelectorAll('span,div,a,button,i,em,p,li,label')){
  if(el.children.length)continue;
  const t=buttonText(el);
  if(!t||t.length>40||!/(添加|新增|增加|新建)/.test(t))continue;
  if(!visible(el,{allowReadonly:true})||el.disabled||!safeAction(el,'add'))continue;
  found.push(el);
 }
 addTextCache=found;addTextCacheScan=scanId;return found;
}
function addButtonFor(group){
  const re=ADD_PATTERNS[group],def=ResumeCore.groups[group];if(!re||!def)return null;const candidates=[];
  const selector=(siteAdapter.add?siteAdapter.add+',':'')+'button,a,[role="button"],input[type="button"],input[type="submit"],[data-action*="add" i],[class*="add" i],[class*="plus" i]';
  const pool=[...new Set([...roots().flatMap(r=>Array.from(r.querySelectorAll(selector))),...addTextCandidates()])];
  for(const el of pool){
    if(!visible(el,{allowReadonly:true})||el.disabled||!safeAction(el,'add'))continue;const t=buttonText(el);if(t.length>80)continue;
    if(/提交申请|立即申请|确认投递|投递简历|提交简历|保存并提交|apply now|submit application/i.test(t))continue;
    const ctx=inferContext(el),explicit=!!(t&&re.test(t)),generic=!!(t&&GENERIC_ADD.test(t));
    const contextHit=def.context.test(ctx||'')||def.context.test([ctx,...nearestText(el)].join(' '));
    if(!explicit&&!(generic&&contextHit))continue;
    let score=explicit?200:120;if(contextHit)score+=40;if(/^\+|^＋/.test(t))score+=4;if(/继续添加|再添加/.test(t))score+=8;
    candidates.push({el,t,score,ctx});
  }
  candidates.sort((a,b)=>b.score-a.score||a.t.length-b.t.length);return candidates[0]?.el||null;
}
async function waitForRecordGrowth(group,before,timeout=1500){
  const end=Date.now()+timeout;let latest=before;
  while(Date.now()<end){await delay(120);scan();latest=currentRecordCount(group);if(latest>before)return latest;}
  return latest;
}
async function prepare(request={}){
  const desired=request.desiredCounts||{};const maxAdds=Math.max(1,Number(request.maxAdds||99));let added=0;const details=[];if(!lastFields.length)scan();
  if(activeAddTarget?.dialog?.isConnected&&visible(activeAddTarget.dialog,{allowReadonly:true}))return {added,details,pendingModal:{group:activeAddTarget.group,index:activeAddTarget.index}};
  const groups=Object.keys(ResumeCore.groups);
  for(const group of groups){
    const want=Math.max(0,Math.min(12,Number(desired[group]||0)));if(!want)continue;let have=currentRecordCount(group),attempts=0;
    while(have<want&&attempts<Math.min(12,want-have+3)){
      if(added>=maxAdds)return {added,details,pendingModal:null};
      const btn=addButtonFor(group);if(!btn)break;const beforeDialogs=new Set(visibleDialogs());const targetIndex=have;smartClick(btn);added++;attempts++;
      await delay(220);const newDialog=visibleDialogs().find(d=>!beforeDialogs.has(d));
      if(newDialog){activeAddTarget={group,index:targetIndex,dialog:newDialog};scan();details.push({group,have,want,mode:'modal'});return {added,details,pendingModal:{group,index:targetIndex}};}
      const next=await waitForRecordGrowth(group,have,1300);if(next<=have)break;have=next;
    }
    details.push({group,have,want,mode:'inline'});
  }
  return {added,details,pendingModal:null};
}
function safeModalCommitButton(dialog){
 const matches=Array.from(dialog.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"]')).filter(el=>visible(el,{allowReadonly:true})&&!el.disabled&&safeAction(el,'save')&&!(el.type==='submit'&&el.form&&Array.from(el.form.elements).some(control=>!dialog.contains(control))));
 const preferred=siteAdapter.save?matches.filter(el=>el.matches(siteAdapter.save)):[];return preferred.length===1?preferred[0]:matches.length===1?matches[0]:null;
}
async function commitPendingAdd(){
  if(!activeAddTarget)return {ok:false,message:'当前没有待保存的新增经历'};const dialog=activeAddTarget.dialog;
  if(!dialog?.isConnected||!visible(dialog,{allowReadonly:true})){activeAddTarget=null;scan();return {ok:true,message:'新增弹窗已关闭'};}
  const btn=safeModalCommitButton(dialog);if(!btn)return {ok:false,message:'已填新增经历，但未找到安全的“保存/确定”按钮，请手动保存该弹窗'};
  const savedGroup=activeAddTarget.group,savedIndex=activeAddTarget.index;smartClick(btn);const end=Date.now()+2200;
  while(Date.now()<end){await delay(140);if(!dialog.isConnected||!visible(dialog,{allowReadonly:true})){virtualRecordCounts.set(savedGroup,Math.max(Number(virtualRecordCounts.get(savedGroup)||0),savedIndex+1));activeAddTarget=null;scan();return {ok:true,message:'新增经历已保存'};}}
  return {ok:false,message:'已点击弹窗保存，但弹窗仍未关闭；可能还有必填项或网页校验，请检查'};
}
