'use strict';
const $ = id => document.getElementById(id);
let profiles = [], active = '', dirty = false;
const longFields = new Set(['summary', 'skills', 'description']);
function message(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function current() { return profiles.find(x => x.id === active); }
function changed() { dirty = true; message('有未保存的修改'); }
function input(label, key, value, parent) {
  const wrapper = document.createElement('label');
  const title = document.createElement('span'); title.textContent = label;
  const control = document.createElement(longFields.has(key.split('.').at(-1)) ? 'textarea' : 'input');
  control.value = value || ''; control.dataset.key = key;
  if (control.tagName === 'TEXTAREA') wrapper.className = 'wide';
  control.addEventListener('input', changed);
  wrapper.append(title, control); parent.append(wrapper);
}
function collect() {
  const p = current(); p.title = $('title').value.trim() || '未命名简历';
  for (const el of document.querySelectorAll('[data-key]')) {
    const path = el.dataset.key.split('.'); let target = p;
    for (const part of path.slice(0, -1)) target = target[part];
    target[path.at(-1)] = el.value;
  }
}
function render() {
  $('profiles').replaceChildren(...profiles.map(p => new Option(p.title, p.id)));
  $('profiles').value = active;
  const p = current(); $('title').value = p.title;
  $('basics').replaceChildren(); $('groups').replaceChildren();
  for (const [key, label] of ResumeCore.basics) input(label, `basics.${key}`, p.basics[key], $('basics'));
  for (const [group, def] of Object.entries(ResumeCore.groups)) {
    const section = document.createElement('section'); section.className = 'card section';
    const heading = document.createElement('div'); heading.className = 'row between section-head';
    const title = document.createElement('h2'); title.textContent = def.title;
    const add = document.createElement('button'); add.textContent = '＋ 添加一条';
    add.addEventListener('click', () => { collect(); if (p[group].length >= 20) { message('每类最多 20 条经历', true); return; } p[group].push({}); changed(); render(); });
    heading.append(title, add); section.append(heading);
    p[group].forEach((record, index) => {
      const container = document.createElement('div'); container.className = 'record';
      const bar = document.createElement('div'); bar.className = 'row between';
      const label = document.createElement('h3'); label.textContent = `经历 ${index + 1}`;
      const remove = document.createElement('button'); remove.className = 'quiet danger'; remove.textContent = '移除';
      remove.addEventListener('click', () => { collect(); p[group].splice(index, 1); changed(); render(); });
      const grid = document.createElement('div'); grid.className = 'grid';
      for (const [key, label] of def.fields) input(label, `${group}.${index}.${key}`, record[key], grid);
      bar.append(label, remove); container.append(bar, grid); section.append(container);
    });
    $('groups').append(section);
  }
}
async function save() {
  collect();
  const clean = profiles.map(p => ({ ...ResumeCore.validateProfile(p), id: p.id }));
  await chrome.storage.local.set({ profiles: clean, activeProfile: active });
  profiles = clean; dirty = false; render(); message('已保存到本机。现在可以去招聘网页填写了。');
}
async function safely(fn) { try { await fn(); } catch (error) { message(`未完成：${error.message}`, true); } }
$('title').addEventListener('input', changed);
$('save').addEventListener('click', () => safely(save));
$('profiles').addEventListener('change', () => { collect(); active = $('profiles').value; render(); });
$('new').addEventListener('click', () => { collect(); const p = ResumeCore.emptyProfile(); profiles.push(p); active = p.id; changed(); render(); });
$('duplicate').addEventListener('click', () => { collect(); const p = ResumeCore.validateProfile(current()); p.title += '（副本）'; profiles.push(p); active = p.id; changed(); render(); });
$('delete').addEventListener('click', () => {
  if (!confirm('移除这份简历？保存后生效；保存前关闭此页可放弃修改。')) return;
  profiles = profiles.filter(p => p.id !== active);
  if (!profiles.length) profiles.push(ResumeCore.emptyProfile());
  active = profiles[0].id; changed(); render();
});
$('export').addEventListener('click', () => safely(async () => {
  collect(); const p = current();
  const url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `简历-${p.title.replace(/[^\p{L}\p{N}\-_]/gu, '_')}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); message('已导出当前简历，备份文件含个人资料，请妥善保存。');
}));
$('import').addEventListener('change', () => safely(async () => {
  const file = $('import').files[0]; if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('文件不能超过 2 MB');
    const p = ResumeCore.validateProfile(JSON.parse(await file.text()));
    collect(); profiles.push(p); active = p.id; changed(); render(); message('已导入，请核对后保存。');
  } finally { $('import').value = ''; }
}));
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
(async () => safely(async () => {
  const data = await chrome.storage.local.get(['profiles', 'activeProfile','parentPhoneRevision']);
  profiles = data.profiles?.length ? data.profiles : [ResumeCore.validateProfile(globalThis.ResumeDefaultProfile || ResumeCore.emptyProfile())];
  if(globalThis.ResumeProfileUpdates){const update=ResumeProfileUpdates.apply(profiles,data.parentPhoneRevision);profiles=update.profiles;if(update.changed)await chrome.storage.local.set({profiles,parentPhoneRevision:update.parentPhoneRevision});}
  active = profiles.some(p => p.id === data.activeProfile) ? data.activeProfile : profiles[0].id;
  render();
}))();
