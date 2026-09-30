// 字段级常用答案库：保存“字段语义 -> 最终采用内容”，下次按语义相似度、使用次数、最近使用排序。
(function (root) {
  'use strict';

  const store = root.ResumeStore;
  const ai = root.ResumeAI;
  const KEY = 'fieldAnswerLibrary';
  const MAX = 500;

  const PRESET_VERSION = '2.7.0';
  const PRESET_KEY = 'fieldAnswerPresetVersion';
  const DEFAULT_COMMON = [];

  const SYNONYM_GROUPS = [
    ['自我评价','个人评价','个人总结','自我介绍','个人简介','个人优势','自我描述'],
    ['工作描述','工作内容','工作职责','主要职责','职责描述','主要工作职责','主要工作职责和业绩','工作职责及业绩','职责和成就','职责与成就'],
    ['项目描述','项目介绍','项目内容','项目成果','项目经验'],
    ['离职原因','离职理由','结束原因'],
    ['专业描述','在校经历','教育经历描述','校园经历'],
    ['主修课程','核心课程','主要课程'],
    ['爱好特长','兴趣爱好','兴趣特长','个人爱好','个人特长'],
    ['技能','专业技能','技能特长','个人技能'],
    ['职位','岗位','职务','职位名称','岗位名称','担任职务','意向职位','目标岗位','申请职位','应聘职位'],
    ['公司','公司名称','企业名称','单位名称','工作单位','任职单位','实习单位','雇主'],
    ['学校','学校名称','院校','毕业院校','就读学校'],
    ['专业','专业名称','所学专业','毕业专业','就读专业'],
    ['学历','最高学历','教育程度','学历层次'],
    ['学位','最高学位','学位名称'],
    ['入学时间','入学日期','入校时间','就读开始时间','学习开始时间','教育开始时间','开始时间','开始日期','起始时间'],
    ['毕业时间','毕业日期','离校时间','预计毕业时间','就读结束时间','学习结束时间','教育结束时间','结束时间','结束日期','截止时间','终止时间'],
    ['入职时间','入职日期','任职开始时间','实习开始时间','工作开始时间','开始时间','开始日期','起始时间'],
    ['离职时间','离职日期','任职结束时间','实习结束时间','工作结束时间','结束时间','结束日期','截止时间','终止时间'],
    ['组织名称','社团名称','学生组织','任职组织','组织'],
    ['荣誉','奖项','荣誉奖项','获奖情况','奖项名称','荣誉名称','获奖名称'],
    ['获奖时间','获得时间','颁发时间','奖项时间'],
    ['颁发单位','授奖单位','授予单位','发证单位','颁发机构'],
    ['证书','证书名称','资格证书','资格名称'],
    ['语言','语种','语言名称'],
    ['语言等级','语言水平','熟练程度','掌握程度','水平'],
    ['成绩','分数','得分','考试成绩','考试得分'],
    ['部门','所在部门','部门名称'],
    ['工作地点','任职地点','实习地点','工作所在地'],
    ['证明人','推荐人','联系人','证明联系人'],
  ];

  function norm(s) {
    return String(s || '').toLowerCase().replace(/[\s_\-:：*＊()（）/\\.，,；;？?！!【】\[\]·]/g, '');
  }
  function tokens(s) {
    const n = norm(s);
    const out = new Set();
    for (let i = 0; i < n.length; i++) {
      out.add(n[i]);
      if (i + 1 < n.length) out.add(n.slice(i, i + 2));
    }
    return out;
  }
  function sameSynonymGroup(a, b) {
    const A = norm(a), B = norm(b);
    return SYNONYM_GROUPS.some(g => g.some(x => A.includes(norm(x))) && g.some(x => B.includes(norm(x))));
  }
  function similarity(a, b) {
    const A = norm(a), B = norm(b);
    if (!A || !B) return 0;
    if (A === B) return 1;
    if (A.includes(B) || B.includes(A)) return Math.min(0.96, 0.72 + Math.min(A.length, B.length) / Math.max(A.length, B.length) * 0.2);
    if (sameSynonymGroup(A, B)) return 0.90;
    const ta = tokens(A), tb = tokens(B);
    let inter = 0;
    for (const x of ta) if (tb.has(x)) inter++;
    const dice = ta.size + tb.size ? (2 * inter) / (ta.size + tb.size) : 0;
    return Math.min(1, dice * 0.78);
  }
  function stars(score) {
    if (score >= .86) return 5;
    if (score >= .70) return 4;
    if (score >= .52) return 3;
    if (score >= .34) return 2;
    return 1;
  }
  function seedPresets() {
    const current = store.get(PRESET_KEY);
    const raw = store.get(KEY);
    const list = Array.isArray(raw) ? raw.slice() : [];
    if (current === PRESET_VERSION) return list;
    const now = new Date().toISOString();
    for (const preset of DEFAULT_COMMON) {
      const fingerprint = 'scope:global|' + norm(preset.label) + '|' + norm(preset.value);
      if (list.some(x => x.fingerprint === fingerprint || (norm(x.label) === norm(preset.label) && norm(x.value) === norm(preset.value)))) continue;
      list.unshift({
        id: 'preset_' + norm(preset.label).slice(0, 18) + '_' + Math.random().toString(36).slice(2, 6),
        fingerprint, label: preset.label, context: '', value: preset.value, source: 'preset', company: '', role: '', scope: null,
        aliases: Array.from(new Set([preset.label, ...(preset.aliases || [])])).slice(0, 20),
        useCount: 0, createdAt: now, updatedAt: now, lastUsedAt: '',
      });
    }
    store.set(KEY, list.slice(0, MAX));
    store.set(PRESET_KEY, PRESET_VERSION);
    return list.slice(0, MAX);
  }
  function all() { return seedPresets(); }
  function saveAll(list) { store.set(KEY, list.slice(0, MAX)); }


  function normalizeScope(scope) {
    if (!scope || !scope.group || !scope.recordKey) return null;
    return {
      group: String(scope.group || '').trim(),
      recordKey: String(scope.recordKey || '').trim(),
      recordIndex: Number.isInteger(scope.recordIndex) ? scope.recordIndex : null,
      recordLabel: String(scope.recordLabel || '').trim(),
    };
  }
  function scopeFingerprint(scope) {
    const s = normalizeScope(scope);
    return s ? ('scope:' + norm(s.group) + ':' + norm(s.recordKey)) : 'scope:global';
  }
  function sameScope(itemScope, queryScope) {
    const a = normalizeScope(itemScope), b = normalizeScope(queryScope);
    if (!b) return !a;
    if (!a) return false;
    return norm(a.group) === norm(b.group) && norm(a.recordKey) === norm(b.recordKey);
  }

  function save({ label, context = '', value, source = 'manual', company = '', role = '', aliases = [], scope = null, replaceSameField = false }) {
    label = String(label || '').trim(); value = String(value || '').trim();
    if (!label || !value) throw new Error('字段名称和内容不能为空');
    const list = all().slice();
    const normalizedScope = normalizeScope(scope);
    const fingerprint = scopeFingerprint(normalizedScope) + '|' + norm(label) + '|' + norm(value);
    let item = list.find(x => x.fingerprint === fingerprint);
    if (!item && replaceSameField) {
      item = list.find(x => sameScope(x.scope, normalizedScope) && x.source !== 'preset' &&
        (norm(x.label) === norm(label) || (x.aliases || []).some(a => norm(a) === norm(label))));
      if (item) {
        item.value = value;
        item.fingerprint = fingerprint;
      }
    }
    const now = new Date().toISOString();
    if (item) {
      item.context = context || item.context || '';
      item.scope = normalizedScope || item.scope || null;
      item.source = source || item.source || 'manual';
      item.company = company || item.company || '';
      item.role = role || item.role || '';
      item.aliases = Array.from(new Set([...(item.aliases || []), ...aliases, label].filter(Boolean))).slice(0, 20);
      item.updatedAt = now;
    } else {
      item = {
        id: 'fa' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), fingerprint,
        label, context, value, source, company, role, scope: normalizedScope,
        aliases: Array.from(new Set([label, ...aliases].filter(Boolean))).slice(0, 20),
        useCount: 0, createdAt: now, updatedAt: now, lastUsedAt: '',
      };
      list.unshift(item);
    }
    saveAll(list);
    return item;
  }

  function markUsed(id, observedLabel = '') {
    const list = all().slice();
    const item = list.find(x => x.id === id);
    if (!item) return null;
    item.useCount = (Number(item.useCount) || 0) + 1;
    item.lastUsedAt = new Date().toISOString();
    if (observedLabel && !item.aliases?.some(x => norm(x) === norm(observedLabel))) {
      item.aliases = [...(item.aliases || []), observedLabel].slice(-20);
    }
    saveAll(list);
    return item;
  }

  function update(id, data) {
    const list=all().slice(),item=list.find(x=>x.id===id);
    if(!item)throw new Error('字段不存在');
    const label=String(data.label||'').trim(),value=String(data.value||'').trim();
    if(!label||!value)throw new Error('字段名称和内容不能为空');
    Object.assign(item,{label,value,aliases:Array.from(new Set([label,...(data.aliases||[])])).slice(0,20),source:'custom',updatedAt:new Date().toISOString()});
    item.fingerprint=scopeFingerprint(item.scope)+'|'+norm(label)+'|'+norm(value);saveAll(list);return item;
  }
  function remove(id) { saveAll(all().filter(x => x.id !== id)); }

  function scoreItem(item, label, context = '') {
    const labels = [item.label, ...(item.aliases || [])];
    const semantic = Math.max(...labels.map(x => similarity(label, x)), 0);
    const contextScore = context && item.context ? similarity(context, item.context) : 0;
    const useCount = Number(item.useCount) || 0;
    const usage = Math.min(1, Math.log2(useCount + 1) / 5);
    const age = item.lastUsedAt ? Math.max(0, Date.now() - Date.parse(item.lastUsedAt)) : Infinity;
    const recency = Number.isFinite(age) ? Math.max(0, 1 - age / (1000 * 60 * 60 * 24 * 120)) : 0;
    const total = Math.min(1, semantic * .72 + contextScore * .08 + usage * .12 + recency * .08);
    return { semantic, total, stars: stars(semantic) };
  }

  function find(label, context = '', limit = 6, minStars = 3, scope = null) {
    return all().filter(item => sameScope(item.scope, scope)).map(item => ({ item, ...scoreItem(item, label, context) }))
      .filter(x => x.stars >= minStars)
      .sort((a, b) => b.total - a.total || (b.item.useCount || 0) - (a.item.useCount || 0))
      .slice(0, limit);
  }

  async function rerankWithAI(label, context = '', candidates = []) {
    if (!ai?.isConfigured?.() || !candidates.length || ai.isNeverSend('', label)) return candidates;
    const pool = candidates.slice(0, 12);
    const prompt = [
      '当前网页字段：' + label,
      '页面上下文：' + (context || '无'),
      '历史答案候选：',
      JSON.stringify(pool.map((x, i) => ({ index: i, field: x.item.label, aliases: x.item.aliases || [], valuePreview: String(x.item.value).slice(0, 120) }))),
      '',
      '请判断每条历史答案与当前字段的语义匹配程度，只输出 JSON 数组，格式：[{"index":0,"score":0-1}]。不要根据答案内容臆造个人事实，只判断字段语义。',
    ].join('\n');
    try {
      const raw = await ai.chat([{ role: 'system', content: '你只做字段语义匹配。只输出 JSON。' }, { role: 'user', content: prompt }], { temperature: 0, maxTokens: 500 });
      const parsed = root.ResumeFieldAI?.parseJSON?.(raw);
      if (!Array.isArray(parsed)) return candidates;
      const by = new Map(parsed.map(x => [Number(x.index), Math.max(0, Math.min(1, Number(x.score) || 0))]));
      return pool.map((x, i) => {
        const aiScore = by.get(i);
        if (aiScore == null) return x;
        const total = Math.min(1, x.total * .55 + aiScore * .45);
        return { ...x, aiScore, total, stars: stars(aiScore) };
      }).filter(x => x.stars >= 3).sort((a, b) => b.total - a.total);
    } catch { return candidates; }
  }

  root.ResumeAnswerLibrary = { all, save, update, remove, markUsed, find, rerankWithAI, similarity, stars, normalizeScope, sameScope };
})(typeof globalThis !== 'undefined' ? globalThis : this);
