// 资料模型 v2（§6 的完整字段实例 + §20 动态字段 + §24 AI 不得改真实事实 + §25 字段锁定）。
//
// 和引擎的关系（这是整个项目最关键的一处设计）：
//   v2 是"富资料"，字段带 value/locked/confidence/source/status，是唯一真相源；
//   引擎（core.ResumeCore）只认它自己那份"简单资料"（basics.name / education[0].school …），
//   那份已经在 4 个真实站点上实测通过，动不得。
//   所以自动填写时用 toEngineProfile() 把 v2 压成引擎的简单形状喂进去 —— 引擎一行不改，
//   既拿到几百字段的管理能力，又完全不碰已验证的填写与回读逻辑。
(function (root) {
  'use strict';

  const store = root.ResumeStore;
  const core = root.ResumeCore;
  const lib = root.ResumeFieldLibrary;

  const PROFILES_KEY = 'profilesV2';
  const ACTIVE_KEY = 'activeProfileV2';

  // 单值板块 vs 多条板块。skills 是特殊的分类结构，单独处理。
  const SINGLE = ['personal', 'contact', 'job', 'misc'];
  const LISTS = ['education', 'employment', 'campus', 'projects', 'awards', 'certificates', 'languages', 'family'];
  // 引擎旧分组名 → v2 category 名（引擎叫 work/awards/languages…，v2 里我统一叫 employment 等）
  const ENGINE_GROUP = { employment: 'work', awards: 'awards', languages: 'languages', certificates: 'certificates', projects: 'projects', campus: 'campus', education: 'education' };

  // v2.6.6：资料库内所有“日期”统一保存为 YYYY-MM-DD。
  // 旧版本曾把教育/工作/校园/项目/奖项等时间存成 YYYY-MM；升级时只补缺失的日为 01，
  // 不推测缺失的年月，也不改变本来就有明确日的日期。
  function fullDateValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return raw;
    let m = raw.match(/^(\d{4})[-./年](\d{1,2})(?:月)?$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`;
    m = raw.match(/^(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})(?:日)?$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return raw;
  }

  function normalizeProfileDates(p) {
    if (!p || typeof p !== 'object') return false;
    let changed = false;
    const normalizeInst = (fid, inst) => {
      if (!inst || typeof inst !== 'object') return;
      const def = lib.byId(fid);
      if (!def || def.dataType !== 'date') return;
      const next = fullDateValue(inst.value);
      if (next !== inst.value) { inst.value = next; changed = true; }
    };
    for (const rec of Object.values(p.singles || {})) {
      for (const [fid, inst] of Object.entries(rec || {})) normalizeInst(fid, inst);
    }
    for (const rows of Object.values(p.lists || {})) {
      for (const rec of rows || []) for (const [fid, inst] of Object.entries(rec || {})) normalizeInst(fid, inst);
    }
    // 旧引擎兼容区也可能保留 start/end/date；只对明确形似“年月”的值补 01。
    const walkLegacy = value => {
      if (Array.isArray(value)) { value.forEach(walkLegacy); return; }
      if (!value || typeof value !== 'object') return;
      for (const [k, v] of Object.entries(value)) {
        if (v && typeof v === 'object') { walkLegacy(v); continue; }
        if (!/^(start|end|date|birthDate|birthday|graduationDate)$/i.test(k)) continue;
        const next = fullDateValue(v);
        if (next !== v) { value[k] = next; changed = true; }
      }
    };
    walkLegacy(p.legacyExtras || {});
    return changed;
  }

  function supplementConfirmedUserProfile(){return false;}

  // toEngineProfile 只把引擎 schema 里存在的 key 放进去，其余留给 AI 用。

  function emptyRecord() { return {}; }

  function newProfile(title) {
    return {
      id: 'v2_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: title || '新简历',
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      singles: { personal: emptyRecord(), contact: emptyRecord(), job: emptyRecord(), misc: emptyRecord() },
      lists: { education: [], employment: [], campus: [], projects: [], awards: [], certificates: [], languages: [], family: [] },
      skills: {},          // skills.<name> -> { value:{level,years,scenario,desc}, locked, confidence, source, status }
      attachments: [],     // {id,name,status:'confirmed'|'pending'|'extracted', editedText, chunks}
      customFields: [],    // §20 动态新增的字段定义（已确认的）
      legacyExtras: { basics: {} }, // v2 尚无对应字段时，保留旧引擎原值，避免升级丢资料
    };
  }

  function listProfiles() {
    let v = store.get(PROFILES_KEY);
    if (!Array.isArray(v) || !v.length) {
      // 第一次跑：把引擎/扩展那套旧资料（如果有）迁一份进来，别让用户重新填
      const legacy = migrateLegacy();
      v = legacy ? [legacy] : [seedFromDefault()];
      store.set(PROFILES_KEY, v);
    }
    // 老用户覆盖安装脚本后，原 GM 存储仍会保留；这里做一次无损日期升级。
    // 只补“日=01”，不会凭空制造缺失的年月。
    let changed = false;
    for (const p of v) {
      if (normalizeProfileDates(p)) changed = true;
      if (supplementConfirmedUserProfile(p)) changed = true;
    }
    if (changed) store.set(PROFILES_KEY, v);
    return v;
  }

  function activeProfile() {
    const list = listProfiles();
    const id = store.get(ACTIVE_KEY);
    const profile = list.find(p => p.id === id) || list[0];
    syncRuntimeFields(profile);
    return profile;
  }

  function setActive(id) {
    store.set(ACTIVE_KEY, id);
    syncRuntimeFields(listProfiles().find(p => p.id === id));
  }
  function saveProfile(p) { p.updatedAt = new Date().toISOString(); p.revision = (p.revision || 0) + 1; const list = listProfiles(); const i = list.findIndex(x => x.id === p.id); if (i >= 0) list[i] = p; else list.push(p); store.set(PROFILES_KEY, list); return p; }
  function createProfile(title) { const p = newProfile(title); listProfiles().push(p); saveProfile(p); setActive(p.id); return p; }
  function deleteProfile(id) { let list = listProfiles(); list = list.filter(p => p.id !== id); if (!list.length) list = [newProfile('新简历')]; store.set(PROFILES_KEY, list); setActive(list[0].id); return list; }
  function duplicateProfile(id) { const src = listProfiles().find(p => p.id === id); if (!src) return null; const c = JSON.parse(JSON.stringify(src)); c.id = 'v2_' + Date.now().toString(36); c.title = src.title + ' 副本'; c.createdAt = new Date().toISOString(); listProfiles().push(c); saveProfile(c); return c; }

  // ---------------------------------------------------------------- 读值
  // getValue(profile, 'personal.name') —— 支持单值和多条（多条传 index）
  function getInstance(p, fieldId, index) {
    const def = lib.byId(fieldId);
    if (!def) return null;
    if (def.category === 'skills') return p.skills[fieldId] || null;
    if (SINGLE.includes(def.category)) return p.singles[def.category]?.[fieldId] || null;
    const cat = def.category;
    if (index != null) return p.lists[cat]?.[index]?.[fieldId] || null;
    return null;
  }

  function getValue(p, fieldId, index) {
    const inst = getInstance(p, fieldId, index);
    return inst ? inst.value : '';
  }

  // 写值。尊重锁定：锁定字段除非 force，否则普通写入也提示（用户手动在资料页改是允许的，AI 走另一条路）。
  function setValue(p, fieldId, value, opts = {}) {
    const def = lib.byId(fieldId);
    if (!def) throw new Error('未知字段：' + fieldId);
    const inst = existingOrNew(p, fieldId);
    if (inst.locked && !opts.unlock && !opts.force) {
      return { ok: false, reason: '该字段已锁定。解锁后才能修改。', fieldId, def };
    }
    inst.value = value;
    inst.source = opts.source || (opts.fromAI ? 'ai' : 'user');
    inst.status = 'confirmed';
    inst.updatedAt = new Date().toISOString();
    if (opts.fromAI) inst.confidence = opts.confidence ?? 0.7;
    else inst.confidence = 1;
    saveProfile(p);
    return { ok: true, fieldId, def, instance: inst };
  }

  function existingOrNew(p, fieldId) {
    const def = lib.byId(fieldId);
    if (def.category === 'skills') { p.skills[fieldId] = p.skills[fieldId] || { value: '', locked: false, confidence: 0, source: '', status: 'empty' }; return p.skills[fieldId]; }
    if (SINGLE.includes(def.category)) { p.singles[def.category] = p.singles[def.category] || {}; p.singles[def.category][fieldId] = p.singles[def.category][fieldId] || { value: '', locked: false, confidence: 0, source: '', status: 'empty' }; return p.singles[def.category][fieldId]; }
    const cat = def.category;
    p.lists[cat] = p.lists[cat] || [];
    // 多条：这里只操作"正在编辑的那一条"由调用方保证（传 index 或先 addListItem）
    return p.lists[cat][getEditIndex(p, cat)]?.[fieldId] || null;
  }

  // 多条板块的"当前编辑条目"指针，UI 用
  function editIndex(p, cat) { return p._edit?.[cat] ?? 0; }
  function setEditIndex(p, cat, i) { p._edit = p._edit || {}; p._edit[cat] = i; }
  function addListItem(p, cat) { p.lists[cat] = p.lists[cat] || []; p.lists[cat].push({}); saveProfile(p); return p.lists[cat].length - 1; }
  function removeListItem(p, cat, i) { p.lists[cat]?.splice(i, 1); saveProfile(p); }

  // AI 专用写入口（§24）：锁定字段绝不改；未锁定也只"建议"，需要用户确认后才 apply。
  // 这里只负责"生成建议"，真正落库由 UI 调 setValue(fromAI) 且带 unlock 逻辑。
  function proposeAIChange(p, fieldId, newValue, confidence) {
    const cur = getValue(p, fieldId);
    const inst = getInstance(p, fieldId);
    if (inst?.locked) {
      return { blocked: true, reason: '字段已锁定，AI 不能修改真实事实。', fieldId, current: cur, proposed: newValue };
    }
    if (String(cur) === String(newValue)) return { blocked: false, noop: true, fieldId };
    return { blocked: false, needsConfirm: true, fieldId, current: cur, proposed: newValue, confidence: confidence ?? 0.7, def: lib.byId(fieldId) };
  }

  // ---------------------------------------------------------------- 动态字段（§20）
  // AI 遇到库里没有的字段，只能"建议"，不能自动永久添加。这里维护待确认队列。
  function proposeNewField(suggestion) {
    const p = activeProfile();
    if (!suggestion || !/^[a-z]+\.[A-Za-z][A-Za-z0-9]*$/.test(suggestion.fieldId || '') || !lib.categories()[suggestion.category]) return { invalid: true };
    p.customFields = p.customFields || [];
    if (p.customFields.some(f => f.fieldId === suggestion.fieldId)) return { exists: true };
    p.customFields.push(Object.assign({ status: 'proposed', createdAt: new Date().toISOString() }, suggestion));
    saveProfile(p);
    return { proposed: true, fieldId: suggestion.fieldId };
  }
  function confirmCustomField(p, fieldId) {
    const f = p.customFields?.find(x => x.fieldId === fieldId);
    if (!f) return false;
    f.status = 'confirmed';
    // 把它注册进运行期的自定义定义（不落全局库，只对这份资料生效）
    lib.all(); // ensure loaded
    registerRuntimeField(f);
    saveProfile(p);
    return true;
  }
  const RUNTIME = new Map();
  function syncRuntimeFields(p) {
    RUNTIME.clear();
    for (const field of p?.customFields || []) if (field.status === 'confirmed') registerRuntimeField(field);
  }
  function registerRuntimeField(f) {
    RUNTIME.set(f.fieldId, { fieldId: f.fieldId, name: f.name, category: f.category || 'misc', dataType: f.dataType || 'text', aliases: f.aliases || [f.name], options: f.options || null, commonQuestions: [f.name], formatRules: {}, validationRules: {}, aiEditable: true, custom: true });
  }
  // 自定义字段的 def 优先
  const origById = lib.byId;
  lib.byId = function (id) { return RUNTIME.get(id) || origById(id); };
  const origByCategory = lib.byCategory;
  lib.byCategory = function (category) { return origByCategory(category).concat([...RUNTIME.values()].filter(field => field.category === category)); };
  const origAll = lib.all;
  lib.all = function () { return origAll().concat([...RUNTIME.values()]); };

  // ---------------------------------------------------------------- 锁定（§25）
  function setLocked(p, fieldId, locked) {
    const inst = existingOrNew(p, fieldId);
    if (!inst) return false;
    inst.locked = !!locked;
    saveProfile(p);
    return true;
  }
  function lockedFields(p) {
    const out = [];
    for (const cat of Object.keys(p.singles)) for (const [fid, inst] of Object.entries(p.singles[cat])) if (inst.locked) out.push(fid);
    for (const cat of Object.keys(p.lists)) p.lists[cat].forEach(rec => { for (const [fid, inst] of Object.entries(rec)) if (inst.locked) out.push(fid); });
    for (const [fid, inst] of Object.entries(p.skills)) if (inst.locked) out.push(fid);
    return [...new Set(out)];
  }

  // ---------------------------------------------------------------- → 引擎格式（关键桥）
  // 把 v2 压成 core.ResumeCore 认识的简单 profile：basics + education[] + work[] + …
  // 引擎认的字段以 core.ResumeSchema 为准，不认识的丢掉（它们留给 AI 用，不影响自动填）。
  function toEngineProfile(p) {
    const simple = { id: p.id, title: p.title };
    // basics：把 personal/contact/job/misc 里，引擎 schema 中 group==='basics' 的 key 收进来
    const basics = {};
    for (const def of lib.all()) {
      if (def.category === 'skills' || LISTS.includes(def.category)) continue;
      // 引擎 personal.* key 直接对应；contact/job/misc 里引擎也用 personal./job. 前缀的，映射过去
      const v = getValue(p, def.fieldId);
      if (v === '' || v == null) continue;
      const engineKey = toEngineKey(def);
      if (engineKey) basics[engineKey] = v;
    }
    simple.basics = Object.assign({}, p.legacyExtras?.basics || {}, basics);
    // 多条：v2 category → 引擎 group
    for (const [cat, items] of Object.entries(p.lists)) {
      const engineGroup = ENGINE_GROUP[cat] || cat;
      simple[engineGroup] = (items || []).map((rec, index) => {
        const row = {};
        for (const def of lib.byCategory(cat)) {
          const v = getValueFromRecord(rec, def.fieldId);
          if (v === '' || v == null) continue;
          const field = toRecordEngineKey(def, engineGroup);
          if (field) row[field] = v;
        }
        return Object.assign({}, p.legacyExtras?.[engineGroup]?.[index] || {}, row);
      });
    }
    for (const [group, rows] of Object.entries(p.legacyExtras || {})) {
      if (group === 'basics' || !Array.isArray(rows)) continue;
      simple[group] = simple[group] || [];
      rows.forEach((row, index) => {
        simple[group][index] = Object.assign({}, row, simple[group][index] || {});
      });
    }
    // 旧引擎认识的 certificates/professionalSkills/computerSkills：v2 没有独立板块，
    // 这里从 skills 里投影几个常见的（可选）。先留空，技能板块由 AI 文本处理。
    simple.certificates = simple.certificates || [];
    simple.professionalSkills = simple.professionalSkills || [];
    simple.computerSkills = simple.computerSkills || [];
    return simple;
  }

  function getValueFromRecord(rec, fieldId) {
    const def = lib.byId(fieldId);
    if (!def) return '';
    const inst = rec[fieldId];
    return inst ? inst.value : '';
  }

  // 标准字段名与旧引擎的记录键并非总是相同，例如 position/title、startDate/start。
  // 只投影旧引擎确实支持的字段，避免把值写进 "undefined" 键而悄悄丢失。
  function toRecordEngineKey(def, engineGroup) {
    const tail = def.fieldId.split('.').at(-1);
    const aliases = {
      position: 'title', startDate: 'start', endDate: 'end',
      degreeEn: 'degreeName', educationType: 'studyType', length: 'duration',
      overseasExperience: 'overseasStudy', majorDesc: 'description',
      companyScale: 'companySize', salaryBeforeTax: 'monthlySalary',
      leaveReason: 'reason', intro: 'description', duty: 'responsibility',
    };
    const candidate = aliases[tail] || tail;
    return root.ResumeCore.groups[engineGroup]?.fields.some(([field]) => field === candidate) ? candidate : null;
  }

  // v2 fieldId 的尾段（education.school → school）映射到引擎 basics 的 key（personal.name）
  function toEngineKey(def) {
    const tail = def.fieldId.split('.').at(-1);
    const aliases = {
      birthDate: 'birthday', politicalStatus: 'political', maritalStatus: 'marital',
      nativePlace: 'birthplace', sourcePlace: 'admissionHukou', householdPlace: 'hukou',
      householdType: 'hukouType', resideCity: 'city', targetCity: 'cityPreference',
    };
    const candidate = aliases[tail] || tail;
    if (root.ResumeCore.basics.some(([key]) => key === candidate)) return candidate;
    // 引擎 basics 里也有 job.* 的？schema 用 personal 前缀。查一下引擎 schema。
    const engineFields = (root.ResumeSchema && root.ResumeSchema.fields) || [];
    for (const f of engineFields) {
      if (f.group === 'basics' && (f.aliases || []).some(a => def.aliases.includes(a) || a === def.name)) return f.field;
    }
    // 兜底：名字完全一样
    for (const f of engineFields) if (f.group === 'basics' && f.name === def.name) return f.field;
    return null;
  }

  // 反向：引擎字段 → v2 fieldId（AI 修正映射时用）
  function fromEngineKey(engineField) {
    const engineFields = (root.ResumeSchema && root.ResumeSchema.fields) || [];
    const f = engineFields.find(x => x.field === engineField && x.group === 'basics');
    if (!f) return null;
    return f.key;   // schema 的 key 就是 personal.name 这种
  }

  function fromEngineBasicKey(key) {
    const preferred = {
      birthday: 'personal.birthDate', political: 'personal.politicalStatus',
      marital: 'personal.maritalStatus', birthplace: 'personal.nativePlace',
      admissionHukou: 'personal.sourcePlace', hukou: 'personal.householdPlace',
      hukouType: 'personal.householdType', city: 'personal.resideCity',
      cityPreference: 'job.targetCity',
    };
    if (preferred[key] && lib.byId(preferred[key])) return preferred[key];
    for (const category of SINGLE) {
      const id = category + '.' + key;
      if (lib.byId(id)) return id;
    }
    return null;
  }

  function preserveLegacyFields(p, source) {
    const projected = toEngineProfile(p);
    const extras = { basics: {} };
    for (const [key, value] of Object.entries(source.basics || {})) {
      if (value !== '' && value != null && projected.basics?.[key] !== value) extras.basics[key] = value;
    }
    for (const [group, rows] of Object.entries(source)) {
      if (!Array.isArray(rows)) continue;
      rows.forEach((row, index) => {
        for (const [key, value] of Object.entries(row || {})) {
          if (value === '' || value == null || projected[group]?.[index]?.[key] === value) continue;
          extras[group] = extras[group] || [];
          extras[group][index] = extras[group][index] || {};
          extras[group][index][key] = value;
        }
      });
    }
    p.legacyExtras = extras;
  }

  // ---------------------------------------------------------------- 迁移 / 种子
  function seedFromDefault() {
    const p = newProfile('我的简历');
    // 把引擎的默认资料灌进 v2（globalThis.ResumeDefaultProfile）
    const def = root.ResumeDefaultProfile;
    if (def) {
      for (const [k, v] of Object.entries(def.basics || {})) {
        if (v === '' || v == null) continue;
        const fieldId = fromEngineBasicKey(k);
        if (lib.byId(fieldId)) setValueQuiet(p, fieldId, v);
      }
      for (const [cat, rows] of Object.entries(def)) {
        if (cat === 'basics' || !Array.isArray(rows)) continue;
        const v2cat = { work: 'employment' }[cat] || cat;
        if (!LISTS.includes(v2cat)) continue;
        rows.forEach(row => {
          const idx = addListItemQuiet(p, v2cat);
          for (const def2 of lib.byCategory(v2cat)) {
            const v = row[toRecordEngineKey(def2, cat)];
            if (v === '' || v == null) continue;
            setRecordValueQuiet(p, v2cat, idx, def2.fieldId, v);
          }
        });
      }
    }
    preserveLegacyFields(p, def || {});
    return p;
  }

  function migrateLegacy() {
    const legacy = store.get('profiles');
    if (!Array.isArray(legacy) || !legacy.length) return null;
    const src = legacy[0];
    const p = newProfile(src.title || '我的简历（已迁移）');
    for (const [k, v] of Object.entries(src.basics || {})) {
      if (v === '' || v == null) continue;
      const fid = fromEngineBasicKey(k);
      if (fid) setValueQuiet(p, fid, v);
    }
    for (const [cat, rows] of Object.entries(src)) {
      if (cat === 'basics' || !Array.isArray(rows)) continue;
      const v2cat = { work: 'employment' }[cat] || cat;
      if (!LISTS.includes(v2cat)) continue;
      rows.forEach(row => {
        const idx = addListItemQuiet(p, v2cat);
        for (const def2 of lib.byCategory(v2cat)) {
          const v = row[toRecordEngineKey(def2, cat)];
          if (v === '' || v == null) continue;
          setRecordValueQuiet(p, v2cat, idx, def2.fieldId, v);
        }
      });
    }
    preserveLegacyFields(p, src);
    return p;
  }

  // 静默写（迁移用，不 bump revision、不触发锁定检查）
  function setValueQuiet(p, fieldId, v) {
    const def = lib.byId(fieldId); if (!def) return;
    const inst = { value: v, locked: false, confidence: 1, source: 'import', status: 'confirmed', updatedAt: new Date().toISOString() };
    if (def.category === 'skills') p.skills[fieldId] = inst;
    else if (SINGLE.includes(def.category)) { p.singles[def.category] = p.singles[def.category] || {}; p.singles[def.category][fieldId] = inst; }
  }
  function addListItemQuiet(p, cat) { p.lists[cat] = p.lists[cat] || []; p.lists[cat].push({}); return p.lists[cat].length - 1; }
  function setRecordValueQuiet(p, cat, idx, fieldId, v) {
    const def = lib.byId(fieldId); if (!def) return;
    p.lists[cat][idx] = p.lists[cat][idx] || {};
    p.lists[cat][idx][fieldId] = { value: v, locked: false, confidence: 1, source: 'import', status: 'confirmed', updatedAt: new Date().toISOString() };
  }

  // 导出/导入整份 v2（§57）
  function exportAll() { return { v: 2, profiles: listProfiles(), active: store.get(ACTIVE_KEY) }; }
  function importAll(obj) {
    if (!obj || obj.v !== 2 || !Array.isArray(obj.profiles) || !obj.profiles.length) throw new Error('不是有效的简历轻填 v2 备份文件');
    store.set(PROFILES_KEY, obj.profiles);
    if (obj.active) setActive(obj.active);
    return obj.profiles.length;
  }

  root.ResumeProfileV2 = {
    SINGLE, LISTS, ENGINE_GROUP,
    listProfiles, activeProfile, setActive, saveProfile, createProfile, deleteProfile, duplicateProfile,
    getValue, getInstance, setValue, setLocked, lockedFields,
    addListItem, removeListItem, editIndex, setEditIndex, getValueFromRecord,
    proposeAIChange, proposeNewField, confirmCustomField,
    toEngineProfile, toEngineKey, toRecordEngineKey, fromEngineKey,
    exportAll, importAll, newProfile, seedFromDefault,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
