'use strict';
const $ = id => document.getElementById(id);
let profiles = [], values = [], snapshot = null, tabId = null, busy = false, pageUrl = '';
let lastRun = null, lastStatus = { text: '', error: false };
function status(text, error = false) {
  $('status').textContent = text; $('status').classList.toggle('error', error);
  lastStatus = { text, error };
  // The button stays visible from the moment the popup opens. Hiding it until something happened meant
  // users could not find it at all, and buildErrorReport() already copes with no run yet.
}
// Field matching and writing are separate steps, so a field can be matched correctly and
// still fail to be written. The bundle keeps both so a report can be acted on.
// Two report shapes exist: fillReviewed returns {ok,message}, the full engine returns
// {result,adapter}. Normalise both onto the same columns so the pasted text is readable.
function reportRows(){
  return (lastRun?.reports||[]).map(r=>({
    state:r.result==='verified'?'成功':r.result==='failed'?'失败':r.ok===false?'失败':r.skipped?'跳过':'成功',
    label:r.label||'(无标签)',canonical:r.canonical||r.key||'-',type:r.type||'-',control:r.control||r.adapter||'-',
    value:r.value??'',message:r.message||''}));
}
function buildErrorReport() {
  const group = $('scopeGroup').value;
  const record = $('scopeRecord').value;
  const lines = ['# 简历轻填 错误信息', `版本: ${PAGE_VERSION}`, `时间: ${new Date().toLocaleString('zh-CN')}`];
  if (pageUrl) lines.push(`页面: ${pageUrl}`);
  lines.push(`填写范围: ${group}${group !== 'all' && record !== '' ? ` 第 ${Number(record) + 1} 条` : ''}`);
  lines.push(`状态: ${lastStatus.text || '(无)'}`);
  if (snapshot) lines.push(`已识别字段: ${snapshot.fields.length}，其中未匹配: ${snapshot.fields.filter(f => !f.fieldKey && !f.basicKey).length}`);
  if (!lastRun) return lines.join('\n');
  const rows = reportRows();
  const c = lastRun.counts || {
    success:rows.filter(r=>r.state==='成功').length,
    skipped:rows.filter(r=>r.state==='跳过').length,
    failed:rows.filter(r=>r.state==='失败').length};
  lines.push('', `结果: 成功 ${c.success || 0}，跳过 ${c.skipped || 0}，失败 ${c.failed || 0}`);
  if (lastRun.error) lines.push(`引擎报错: ${lastRun.error}`);
  if (lastRun.completionMessage) lines.push(`收尾提示: ${lastRun.completionMessage}`);
  if (lastRun.site) lines.push(`站点适配: ${lastRun.site}`);
  const problems = rows.filter(r => r.state !== '成功');
  lines.push('', `--- 未成功明细（${problems.length} 条）---`);
  for (const r of problems) lines.push(`[${r.state}] ${r.label} | 控件=${r.type} | 资料字段=${r.canonical} | 写入值=${r.value || '-'} | 控件结构=${r.control} | ${r.message}`);
  if (lastRun.history) lines.push('', `--- 流程 ---\n${lastRun.history.map(x => x.state).join(' → ')}`);
  if (snapshot) {
    const missed = snapshot.fields.filter(f => !f.fieldKey && !f.basicKey).map(f => `${f.label}(${f.type})`);
    lines.push('', `--- 识别到但没有可用资料的字段（${missed.length} 个）---`, missed.join('、'));
  }
  return lines.join('\n');
}
async function copyErrorInfo() {
  const text = buildErrorReport(), hint = $('copyHint');
  try {
    await navigator.clipboard.writeText(text);
    hint.textContent = '已复制，可直接粘贴给 AI';
  } catch {
    // The clipboard API is unavailable in some extension contexts; leave a selectable box.
    let box = $('copyFallback');
    if (!box) {
      box = document.createElement('textarea');
      box.id = 'copyFallback';
      box.className = 'copy-fallback';
      $('copyError').after(box);
    }
    box.hidden = false; box.value = text; box.focus(); box.select();
    hint.textContent = '已选中，请按 Cmd+C 复制';
  }
  hint.hidden = false;
  clearTimeout(copyHintTimer);
  copyHintTimer = setTimeout(() => { hint.hidden = true; }, 5000);
}
let copyHintTimer = null;
function updateFill() {
 const count=Array.from(document.querySelectorAll('.field select')).filter(x=>x.value).length;
 const hasProfile=profiles.some(p=>p.id===$('profiles').value),rows=Array.from($('scopeRecord').options);
 const validSelection=$('scopeGroup').value==='all'||$('scopeGroup').value==='basics'||rows.length>0;
 $('fill').textContent=`填写已匹配字段${count?` ${count} 项`:''}`;
 $('fill').disabled=busy||!count;
 $('quickFill').textContent='填写当前表单';
 $('quickFill').disabled=busy||!hasProfile||!validSelection;
 $('nextRecord').disabled=busy||!rows.length||$('scopeRecord').selectedIndex>=rows.length-1;
 $('applyRecord').disabled=busy||!hasProfile||!validSelection;
 for(const el of document.querySelectorAll('.field select,.batch-record-picker select'))el.disabled=busy;
}
async function action(fn) {
  if (busy) return;
  busy = true;
  for (const id of ['quickFill', 'scan', 'expand', 'undo', 'profiles', 'fill', 'scopeGroup', 'scopeRecord', 'nextRecord', 'applyRecord', 'closeModal', 'overwrite']) $(id).disabled = true;
  updateFill();
  try { await fn(); } catch (error) {
    status(`操作未完成：${error.message}`, true);
  } finally {
    busy = false;
    for (const id of ['quickFill', 'scan', 'expand', 'undo', 'profiles', 'scopeGroup', 'scopeRecord', 'nextRecord', 'applyRecord', 'closeModal', 'overwrite']) $(id).disabled = false;
    updateFill();
  }
}
const PAGE_VERSION = '2.8.0';
async function ensurePageBridge(tabId, force = false) {
  if (!force) {
    try {
      const probe = await chrome.scripting.executeScript({ target: { tabId }, func: (version) => globalThis.ResumePage?.version === version, args: [PAGE_VERSION] });
      if (probe?.[0]?.result === true) return;
    } catch {}
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['core.js', 'core/profile/schema.js', 'core/matcher/scoring.js', 'engine.js', 'content.js'] });
}
async function invokePage(tabId, method, args) {
  const results = await chrome.scripting.executeScript({ target: { tabId }, func: async (method, args, version) => {
    if (!globalThis.ResumePage || globalThis.ResumePage.version !== version || typeof globalThis.ResumePage[method] !== 'function') {
      return { __resumeBridgeError: '页面填写脚本状态异常' };
    }
    try {
      const value = await globalThis.ResumePage[method](args);
      return { __resumeBridgeOk: true, value: value ?? null };
    } catch (error) {
      return { __resumeBridgeError: error?.message || String(error) };
    }
  }, args: [method, args ?? null, PAGE_VERSION] });
  return results?.[0]?.result;
}
async function page(method, args) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) pageUrl = tab.url;
  if (!tab?.id || (tabId !== null && tab.id !== tabId)) throw new Error('当前标签页已改变，请重新打开插件');
  tabId = tab.id;
  await ensurePageBridge(tabId);
  let wrapped = await invokePage(tabId, method, args);
  if (!wrapped || wrapped.__resumeBridgeError === '页面填写脚本状态异常') {
    await ensurePageBridge(tabId, true);
    wrapped = await invokePage(tabId, method, args);
  }
  if (!wrapped) throw new Error('页面没有返回填写结果，请刷新当前招聘页面后重试');
  if (wrapped.__resumeBridgeError) throw new Error(wrapped.__resumeBridgeError);
  if (!wrapped.__resumeBridgeOk) throw new Error('页面填写结果格式异常');
  if (wrapped.value == null) throw new Error('页面填写流程未返回结果');
  return wrapped.value;
}
function selectedValues() {
  const profile = profiles.find(x => x.id === $('profiles').value);
  const selection=currentSelection();
  values = profile ? ResumeCore.entries(profile).filter(x => x.value.trim()&&(!selection||x.group===selection.group&&(selection.group==='basics'||x.index===selection.index))) : [];
}
function render() {
  $('fields').replaceChildren();
  if (!snapshot){updateFill();return;}
  renderBatchPickers();
  for (const field of snapshot.fields) {
    const row = document.createElement('div'); row.className = 'field'; row.dataset.id = field.id;
    const title = document.createElement('p'); title.className = 'field-title'; title.textContent = `${field.context ? field.context + ' · ' : ''}${field.label}${field.required ? ' · 必填' : ''}`;
    const select = document.createElement('select'); select.setAttribute('aria-label', `${field.label} 对应的简历资料`);
    select.append(new Option('跳过此字段 / 选择对应资料', ''));
    const related=ResumeSchema.related(field,values);
    for (const value of related){const option=new Option(`${value.label}：${value.value.length>48?value.value.slice(0,48)+'…':value.value}`,value.key);option.title=value.value;select.append(option);}
    select.disabled = false;
    select.value = ResumeCore.match(field, related) || '';
    if (field.custom) title.textContent += ' · 自定义选择控件（实验支持）';
    const preview = document.createElement('p'); preview.className = 'value';
    const result = document.createElement('p'); result.className = 'result';
    function refresh() {
      const chosen = values.find(x => x.key === select.value);
      preview.textContent = chosen ? chosen.value : (!related.length?'当前条目没有该字段的相关资料，已跳过':field.value ? `网页已有：${field.value}` : '未选择资料，不会填写');
      updateFill();
    }
    select.addEventListener('change', refresh);
    row.append(title, select, preview, result); $('fields').append(row); refresh();
  }
  updateFill();
}

function missingRequiredSummary() {
  if (!snapshot) return '';
  const rows = Array.from(document.querySelectorAll('.field'));
  const missing = snapshot.fields.filter(f => f.required).filter(f => {
    const row = rows.find(r => r.dataset.id === f.id);
    if (!row) return false;
    const chosen = row.querySelector('select')?.value;
    const result = row.querySelector('.result')?.classList.contains('ok');
    return !chosen || !result;
  }).map(f => f.label).filter(Boolean);
  const uniq = [...new Set(missing)].slice(0, 12);
  return uniq.length ? `\n仍需处理的必填项：${uniq.join('、')}${missing.length > uniq.length ? '…' : ''}` : '';
}

async function scanCurrent(){
 selectedValues();const profile=profiles.find(x=>x.id===$('profiles').value);
 if(!profile)throw new Error('请先创建并选择简历资料');
 try{snapshot=await page('scanSelected',{profile,selection:currentSelection()});}
 catch(error){snapshot=null;render();throw error;}
 render();return snapshot;
}
async function fillMatchedFromSnapshot() {
 if(!snapshot)await scanCurrent();
 const items=Array.from(document.querySelectorAll('.field')).flatMap(row=>{
  const key=row.querySelector('select').value,field=snapshot.fields.find(f=>f.id===row.dataset.id);
  return key&&field?[{field,key}]:[];
 });

 const result=await page('fillReviewed',{profile:profiles.find(x=>x.id===$('profiles').value),selection:currentSelection(),items,overwrite:$('overwrite').checked});
 if(!Array.isArray(result?.reports))throw new Error('填写结果异常，请重新识别');
 for(const report of result.reports){
  const row=Array.from(document.querySelectorAll('.field')).find(x=>x.dataset.id===report.id);if(!row)continue;
  row.querySelector('.result').textContent=report.message;row.querySelector('.result').classList.toggle('ok',report.ok);
 }
 return result;
}
async function fillCurrent(){
 status('正在按本次已选字段填写，并检查日期是否保留…');
 const result=await fillMatchedFromSnapshot();lastRun=result;
 if(!result.reports.length){status(snapshot?.fields.length?'本次没有已选字段，已在网页结果浮窗列出可手动补填项。':'当前未找到可填写字段。请在网站打开新增／编辑表单，再点击“识别并核对”。');return;}
 let closeMessage='',closeFailed=false;
 if(currentSelection()&&$('closeModal').checked&&result.reports.every(r=>r.ok)){
  const closed=await page('finishSelected',{profile:profiles.find(x=>x.id===$('profiles').value),selection:currentSelection(),reviewedKeys:result.reports.map(r=>r.key)});
  await page('resultNotice',closed.message);
  closeMessage='\n'+closed.message;closeFailed=!closed.ok;
  if(closed.closed){snapshot=null;render();}
 }
 const ok=result.reports.filter(x=>x.ok).length;
 const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='本次填写报告';details.append(summary);
 for(const r of result.reports){const line=document.createElement('p');line.textContent=`${r.ok?'✓':'✗'} ${r.label} · ${r.canonical}：${r.message}`;details.append(line);}
 $('fields').querySelector('details')?.remove();$('fields').prepend(details);
 status(`已填写：成功 ${ok} 项，需检查 ${result.reports.length-ok} 项。${closeMessage}${snapshot?missingRequiredSummary():''}`,closeFailed||ok!==result.reports.length);
}

let scopePreferences={};
const scopeTitles={family:'亲属',education:'教育经历',work:'工作经历',projects:'项目经历',campus:'校园经历',awards:'奖项荣誉',certificates:'证书',professionalSkills:'专业技能',computerSkills:'计算机技能',languages:'语言能力'};
// Which data groups actually have fields on the page in front of the user, filled by a silent
// unfiltered probe, so the scope list can say what each choice would actually do here.
let pageGroups=null;
let probeToken=0;
function renderScopeOptions(){
  const select=$('scopeGroup'),current=select.value||'all';
  select.replaceChildren(new Option('当前页面全部资料','all'),new Option('个人信息','basics'));
  for(const [group,def] of Object.entries(ResumeCore.groups)){
    const title=scopeTitles[group]||def.title;
    const suffix=pageGroups?(pageGroups.has(group)?` · 本页 ${pageGroups.get(group)} 项`:' · 本页没有这类字段'):'';
    select.append(new Option(title+suffix,group));
  }
  select.value=Array.from(select.options).some(o=>o.value===current)?current:'all';
}
renderScopeOptions();
// Read-only probe: which groups does this page actually show? Runs once per popup open and never
// writes to the page, so a page the extension cannot reach simply leaves the list unannotated.
async function probePageGroups(){
  const token=++probeToken,profile=profiles.find(x=>x.id===$('profiles').value);
  if(!profile)return;
  let counts=null;
  try{
    const scanned=await page('scanSelected',{profile,selection:null});
    counts=new Map();
    for(const field of scanned.fields){const key=ResumeCore.groups[field.groupHint]?field.groupHint:null;if(key)counts.set(key,(counts.get(key)||0)+1);}
  }catch{counts=null;}
  // Switching profiles starts a new probe; the slower earlier one must not overwrite it, and a probe
  // that lands after the popup closed must not touch the torn-down document.
  if(token!==probeToken||typeof document==='undefined'||!document.getElementById('scopeGroup'))return;
  pageGroups=counts;
  renderScopeOptions();updateSelectionHint();
}
function currentSelection(){const group=$('scopeGroup').value;return group==='all'?null:group==='basics'?{group}:{group,index:Number($('scopeRecord').value)};}
function populateRecords(index=0){
 const group=$('scopeGroup').value,p=profiles.find(x=>x.id===$('profiles').value),rows=p?.[group]||[];
 $('recordControls').hidden=group==='all'||group==='basics';$('scopeRecord').replaceChildren();
 if(Array.isArray(rows))rows.forEach((r,i)=>$('scopeRecord').append(new Option(recordCaption(group,r,i),String(i))));
 if(rows[index])$('scopeRecord').value=String(index);
 updateSelectionHint();
 updateFill();
 $('expand').hidden=group!=='all';
}
function updateSelectionHint(){
 const group=$('scopeGroup').value,p=profiles.find(x=>x.id===$('profiles').value);
 if(group==='all'){$('selectionHint').textContent='填写当前页面可识别的全部资料。';return;}
  if(group==='basics'){$('selectionHint').textContent='只填写个人信息；经历、家庭情况等其它区块都不会动，需要时再单独选一次。';return;}
  if(pageGroups&&!pageGroups.has(group)){$('selectionHint').textContent=`当前页面没有识别到${scopeTitles[group]||'这类'}字段，换一个范围，或用“当前页面全部资料”。`;return;}
  const index=Number($('scopeRecord').value),row=p?.[group]?.[index];
  const total=pageGroups?pageGroups.get(group):null;
  $('selectionHint').textContent=row?`本次统一使用：${recordCaption(group,row,index)}。只填写本页属于${scopeTitles[group]||'该区块'}的字段，其它区块不会动。${total?`本页该区块共 ${total} 个字段。`:''}`:'此类资料尚无条目，请先到“管理资料”添加。';
}
function restoreScope(){const pref=scopePreferences[$('profiles').value]||{};$('scopeGroup').value=pref.group||'all';if(!$('scopeGroup').value)$('scopeGroup').value='all';populateRecords(pref.index||0);$('closeModal').checked=pref.closeModal!==false;}
async function rememberScope(){scopePreferences[$('profiles').value]={...(currentSelection()||{group:'all'}),closeModal:$('closeModal').checked};await chrome.storage.local.set({fillSelections:scopePreferences});}
function recordCaption(group,row,index){return `${scopeTitles[group]||'记录'} ${index+1} · ${[row.relation,row.name||row.company||row.school||row.category||row.language||row.organization].filter(Boolean).join(' · ')||'未命名'}`;}
function renderBatchPickers(){
 if(currentSelection())return;
 const p=profiles.find(x=>x.id===$('profiles').value);
 for(const group of new Set(snapshot.fields.map(f=>f.groupHint).filter(g=>ResumeCore.groups[g]))){
  const rows=p?.[group]||[];if(!rows.length)continue;
  const bar=document.createElement('div');bar.className='batch-record-picker';bar.dataset.group=group;
  const label=document.createElement('label');label.textContent=`${scopeTitles[group]}：统一使用`;
  const select=document.createElement('select');select.setAttribute('aria-label',`${scopeTitles[group]}所有已识别字段统一使用的条目`);
  select.append(new Option('选择一条，统一切换下方相关字段',''));
  rows.forEach((r,i)=>select.append(new Option(recordCaption(group,r,i),String(i))));
  select.addEventListener('change',()=>{if(select.value==='')return;useRecord(group,Number(select.value));});
  label.append(select);bar.append(label);$('fields').append(bar);
 }
}
async function refreshSelection(){
 selectedValues();await rememberScope();
 updateSelectionHint();
 const profile=profiles.find(x=>x.id===$('profiles').value);if(!profile){snapshot=null;render();return;}
 status('正在把已识别字段统一切换到所选资料…');
 try{snapshot=await page('scanSelected',{profile,selection:currentSelection()});}
 catch(error){snapshot=null;render();throw error;}
 render();
 const selection=currentSelection(),caption=selection?.group&&selection.group!=='basics'?recordCaption(selection.group,profile[selection.group]?.[selection.index]||{},selection.index):selection?'个人信息':'全部资料';
 const count=Array.from(document.querySelectorAll('.field select')).filter(x=>x.value).length;
 status(`已统一选用 ${caption}，匹配 ${count} 个字段。点击“填写当前表单”即可填写。`);
}
function useRecord(group,index){
 if(busy)return;
 $('scopeGroup').value=group;populateRecords(index);
 return action(refreshSelection);
}
$('scopeGroup').addEventListener('change',()=>{if(busy)return;populateRecords();action(refreshSelection);});
$('scopeRecord').addEventListener('change',()=>{if(!busy)action(refreshSelection);});
$('applyRecord').addEventListener('click',()=>action(refreshSelection));
$('nextRecord').addEventListener('click',()=>{if(busy)return;const select=$('scopeRecord');if(select.selectedIndex<select.options.length-1){select.selectedIndex++;action(refreshSelection);}else status('已经是最后一条，请核对后自行提交。');});
$('closeModal').addEventListener('change',rememberScope);
$('closePopup').addEventListener('click',()=>window.close());

$('manage').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('profiles').addEventListener('change', async () => {
  restoreScope();selectedValues();snapshot=null; render(); await chrome.storage.local.set({ activeProfile: $('profiles').value }); probePageGroups();
});

async function runEngine(){
 selectedValues();const profile=profiles.find(x=>x.id===$('profiles').value);
 if(!profile){status('请先选择简历资料',true);return;}
 status('正在识别、填写、校验和处理记录，请保持招聘页面打开…');
 const report=await page('run',{profile,selection:currentSelection(),closeModal:$('closeModal').checked,overwrite:$('overwrite').checked});lastRun=report;snapshot=null;render();
 const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='填写报告 / Debug Mode';details.append(summary);
 for(const row of report.reports){const line=document.createElement('pre');line.style.whiteSpace='pre-wrap';line.textContent=JSON.stringify(row,null,2);details.append(line);}
 const trace=document.createElement('pre');trace.textContent=report.history.map(x=>x.state).join(' → ');trace.style.whiteSpace='pre-wrap';details.append(trace);$('fields').prepend(details);
 status(`成功 ${report.counts.success} 项，跳过 ${report.counts.skipped} 项，失败 ${report.counts.failed} 项。${report.completionMessage?'\n'+report.completionMessage:''}${report.error?'\n'+report.error:''}\n请核对后自行提交。`,!!report.error);
}
$('quickFill').addEventListener('click',()=>action(fillCurrent));

// 这个按钮的名字是“自动新增缺少记录”，以前却接着普普通通的 runEngine()，从头到尾没调用过 prepare()，
// 点了等于没点。改成真的按资料条数把经历区块的记录行建出来，并把每组的前后条数报给用户。
$('expand').addEventListener('click',()=>action(async()=>{
 selectedValues();const profile=profiles.find(x=>x.id===$('profiles').value);
 if(!profile){status('请先选择简历资料',true);return;}
 status('正在按资料条数补齐经历区块（实习经历／在校活动／获奖经历等）…');
 let result;try{result=await page('prepareRecords',{profile,selection:currentSelection()});}catch(error){status(error.message,true);return;}
 const added=Number(result&&result.added)||0;
 const details=(result&&result.details)||[];
 const lines=details.map(d=>d.group+'：'+d.have+' → '+d.want+(d.mode==='modal'?'（已打开新增弹窗，填完请点“保存本条”）':''));
 const modal=details.some(d=>d.mode==='modal');
 status(added
  ?'已新增 '+added+' 条经历记录行。\n'+lines.join('\n')+'\n接下来点“识别并核对字段”逐条核对，再点“填写已匹配字段”。'+(modal?'\n新增弹窗里的内容需要先保存，弹窗才会关闭。':'')
  :'没有补齐任何记录行：页面上已有的条数已经够，或该区块没有“添加”按钮。'+(lines.length?'\n'+lines.join('\n'):''),!added);
}));

$('scan').addEventListener('click',()=>action(async()=>{
 status('正在识别当前页面…');await scanCurrent();
 $('reviewPanel').open=true;
 status(`发现 ${snapshot.fields.length} 个可见字段。可在“逐字段核对与调整”中修改对应关系。`);
}));
$('fill').addEventListener('click',()=>action(fillCurrent));
$('copyError').addEventListener('click', () => action(copyErrorInfo));
$('undo').addEventListener('click', () => action(async () => {
  const result = await page('undo');
  snapshot = null; render(); updateFill();
  status(`已撤销 ${result.restored} 项，${result.skipped} 项因已被修改或移除而保留。刷新网页后无法撤销。`);
}));
(async () => {
  try {
    const data = await chrome.storage.local.get(['profiles', 'activeProfile', 'bundleRevision','fillSelections','parentPhoneRevision']);
    profiles = data.profiles || [];
    if (!profiles.length && globalThis.ResumeDefaultProfile) {
      const p = ResumeCore.validateProfile(globalThis.ResumeDefaultProfile); profiles = [p]; await chrome.storage.local.set({ profiles, activeProfile: p.id });
    }
    if(globalThis.ResumeProfileUpdates){const update=ResumeProfileUpdates.apply(profiles,data.parentPhoneRevision);profiles=update.profiles;if(update.changed)await chrome.storage.local.set({profiles,parentPhoneRevision:update.parentPhoneRevision});}
    scopePreferences=data.fillSelections||{};
    if (!profiles.length) $('profiles').append(new Option('尚未创建简历', ''));
    for (const p of profiles) $('profiles').append(new Option(p.title, p.id));
    if (profiles.some(x => x.id === data.activeProfile)) $('profiles').value = data.activeProfile;
    restoreScope();selectedValues();updateFill();await probePageGroups();
  } catch (error) { status(`无法读取简历：${error.message}`, true); }
})();

$('results').addEventListener('click',()=>action(async()=>{const shown=await page('showResults');status(shown?'已展开网页结果浮窗':'尚无填写结果，请先填写当前表单');}));
