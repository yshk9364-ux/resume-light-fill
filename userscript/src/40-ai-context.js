// 投递上下文识别 + 提示词组装。
//
// 这一层决定 AI 答案的针对性。原则：抓到什么用什么，抓不到就明说抓不到，
// 绝不用公司名猜出来的信息冒充网页上真实存在的内容。所有抓取值都带来源标记，
// 人工改过的值优先于抓取值 —— 抓取准确率不可能 100%，手动校正是刚需不是可选项。
(function (root) {
  'use strict';

  const presets = root.ResumePresets;
  const ai = root.ResumeAI;

  const KEY = 'jobContext';
  const CACHE_KEY = 'jobContextCache';

  // ---------------------------------------------------------------- 抓取
  const JD_HINTS = /(岗位职责|工作职责|职位描述|岗位描述|任职要求|职位要求|岗位要求|任职资格|工作内容|职责描述|requirements?|responsibilit)/i;

  function text(el) {
    return (el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function metaContent(keywords) {
    for (const el of document.querySelectorAll('meta[name],meta[property]')) {
      const n = (el.getAttribute('name') || el.getAttribute('property') || '').toLowerCase();
      if (keywords.some(k => n.includes(k))) {
        const c = (el.getAttribute('content') || '').trim();
        if (c) return c;
      }
    }
    return '';
  }

  // 公司名。按可信度从高到低，前面的更可能是真的。
  function detectCompany() {
    const candidates = [];

    // 已知公司预设匹配最可信 —— 预设是用户自己确认过的。
    const sitePresets = presets.all();
    for (const c of [...sitePresets.companies, ...sitePresets.learned]) {
      if (presets.isDisabled(c.id)) continue;
      const hit = [c.name, ...(c.aliases || [])].find(a => a && (document.title.includes(a) || text(document.body).includes(a)));
      if (hit) { candidates.push({ value: hit, source: '预设匹配', confidence: 0.9 }); break; }
    }

    // og:site_name / 面包屑
    const og = metaContent(['og:site_name', 'application-name']);
    if (og) candidates.push({ value: og, source: '页面 meta', confidence: 0.7 });

    const crumbs = Array.from(document.querySelectorAll('[aria-label*="面包屑"] a, .breadcrumb a, .crumb a, nav a'))
      .map(a => text(a)).filter(Boolean);
    if (crumbs.length) {
      // 面包屑里公司名一般是第一项。
      candidates.push({ value: crumbs[0], source: '面包屑', confidence: 0.6 });
    }

    // 标题里把"招聘"之类的后缀剥掉
    const t = document.title.replace(/校园招聘|校招|招聘|社会招聘|网申|职位|岗位|首页/g, ' ').replace(/\s+/g, ' ').trim();
    if (t && t.length <= 30) candidates.push({ value: t, source: '页面标题（已剥离通用词）', confidence: 0.4 });

    if (!candidates.length) return { value: '', source: '未识别', confidence: 0, candidates: [] };
    candidates.sort((a, b) => b.confidence - a.confidence);
    return Object.assign({}, candidates[0], { candidates });
  }

  function detectRole() {
    const candidates = [];
    // URL 里带 job id 的页面，正文通常有岗位标题
    const h = Array.from(document.querySelectorAll('h1, h2, [class*="job-name"], [class*="jobName"], [class*="position-name"], [class*="positionName"]'))
      .map(text).filter(s => s && s.length <= 40);
    for (const s of h) {
      if (/(运营|产品|市场|人力|财务|研发|管培|策划|销售|设计|测试|数据|运营管培)/.test(s)) {
        candidates.push({ value: s, source: '页面标题', confidence: 0.75 });
        break;
      }
    }
    if (!candidates.length && h.length) candidates.push({ value: h[0], source: '页面标题', confidence: 0.3 });
    if (!candidates.length) {
      const t = text(document.querySelector('title'));
      if (t) candidates.push({ value: t.replace(/校园招聘|校招|招聘/g, '').trim(), source: '浏览器标题', confidence: 0.2 });
    }
    return Object.assign({}, candidates[0] || { value: '', source: '未识别', confidence: 0 }, { candidates });
  }

  // JD 正文。apply 页通常没有 JD，所以这里抓不到是常态，不是 bug ——
  // 上层会据此提示"要不要从详情页带过来 / 手填一段"。
  function detectJD() {
    const sections = Array.from(document.querySelectorAll('div, section, article, li, p'));
    for (const el of sections) {
      const t = text(el);
      if (t.length < 60 || t.length > 4000) continue;
      if (!JD_HINTS.test(t)) continue;
      // 只取包含提示词、且自身是"块"而不是把整页都包进来的元素
      if (el.querySelectorAll('div,section,article').length > 12) continue;
      return { value: t.slice(0, 4000), source: '页面正文', confidence: 0.7 };
    }
    return { value: '', source: '未识别', confidence: 0 };
  }

  function detectLocation() {
    const meta = metaContent(['location']);
    if (meta) return { value: meta, source: '页面 meta', confidence: 0.8 };
    const t = text(document.body);
    const m = t.match(/(工作地点|工作地址|办公地点|所在地|职位地点)[:：]?\s*([^\s，,。；;]{2,20})/);
    if (m) return { value: m[2], source: '页面正文', confidence: 0.6 };
    return { value: '', source: '未识别', confidence: 0 };
  }

  function detectType() {
    const t = document.title + text(document.body).slice(0, 2000);
    if (/(校园招聘|校招|应届|毕业生|管培生)/.test(t)) return { value: '校园招聘', source: '页面', confidence: 0.8 };
    if (/(社会招聘|社招|经验要求)/.test(t)) return { value: '社会招聘', source: '页面', confidence: 0.8 };
    return { value: '', source: '未识别', confidence: 0 };
  }

  // ---------------------------------------------------------------- 上下文
  // 合并「当前投递上下文」：抓取值 + 预设补充 + 用户手改。
  // edited 为 true 的字段永远优先于抓取值。
  function read() {
    const saved = store_get(KEY);
    if (saved && typeof saved === 'object' && saved.fields) return saved;
    return { fields: {}, pageUrl: '', updatedAt: 0 };
  }

  function store_get(key) {
    try { return root.ResumeStore.get(key); } catch { return null; }
  }

  function write(ctx) {
    const cur = read();
    const next = {
      fields: Object.assign({}, cur.fields, ctx.fields || {}),
      pageUrl: location.href,
      updatedAt: Date.now(),
    };
    root.ResumeStore.set(KEY, next);
    return next;
  }

  // 抓一遍当前页面，合并进上下文（不覆盖用户改过的）。
  function detect() {
    const prev = read();
    const picked = {
      company: detectCompany(),
      role: detectRole(),
      jd: detectJD(),
      location: detectLocation(),
      type: detectType(),
    };
    const fields = Object.assign({}, prev.fields);
    for (const [k, v] of Object.entries(picked)) {
      // 用户手改过（edited）就不覆盖；否则有更高置信度才覆盖。
      if (fields[k]?.edited) continue;
      if (v.value) fields[k] = Object.assign({}, v, { edited: false });
    }
    // 换页面就丢掉上一站的 JD —— 串台比没 JD 更糟。
    if (prev.pageUrl && prev.pageUrl !== location.href) {
      for (const k of ['jd', 'role', 'company', 'location', 'type']) {
        if (fields[k] && !fields[k].edited) delete fields[k];
      }
    }
    return write({ fields });
  }

  // 从上一个详情页缓存 JD —— apply 页常常没 JD，这是最省事的补法：
  // 用户在岗位详情页打开过一次，就存下来了。
  function rememberJD(jdText) {
    if (!jdText) return;
    const c = read();
    c.fields.jd = { value: String(jdText).slice(0, 4000), source: '手动带入', confidence: 1, edited: true };
    root.ResumeStore.set(KEY, Object.assign({}, c, { updatedAt: Date.now() }));
  }

  function value(key) { return read().fields[key]?.value || ''; }

  // 站点 + 公司 + 岗位预设
  function presetBundle() {
    const site = presets.siteForDomain();
    const company = presets.companyByName(value('company')) || presets.companyByName(detectCompany().value);
    const role = presets.roleByName(value('role')) || presets.roleByName(detectRole().value);
    return { site, company, role };
  }

  // ---------------------------------------------------------------- 提示词
  const SYSTEM = `你是一位中国校招/社招网申的写作助手，帮候选人写网申表单里的开放性问答。

硬性要求（违反任何一条都算不合格）：
1. 只输出可以直接粘进输入框的正文，不要输出任何解释、前言、结尾客套。
2. 不要用 markdown 标记（不要 ** 不要 ## 不要 - 开头的列表符号）。
3. 绝对不许编造候选人的经历、数据、公司、奖项。没给到的信息就不要提，宁可少写。
4. 严格满足字数上限。超了要自己压到上限以内。
5. 用中文，语气务实、具体，不用"作为一个优秀的""具有极强学习能力"这类空话。
6. 段落之间用换行分隔，不要用编号列表。`;

  function buildPrompt({ question, limit, style, contextKey, previous, profileSlice, attachmentSlice }) {
    const c = read().fields;
    const { site, company, role } = presetBundle();

    // 只发"跟这个问题有关"的资料切片，不是全量倾倒。
    const parts = [];
    parts.push(`【岗位信息】\n公司：${c.company?.value || '（未提供）'}\n岗位：${c.role?.value || '（未提供）'}\n工作地点：${c.location?.value || '（未提供）'}\n类型：${c.type?.value || '（未提供）'}`);
    if (c.jd?.value) parts.push(`【岗位描述】\n${c.jd.value}`);
    if (company) {
      parts.push(`【关于这家公司（预置信息，可能不完全准确，仅供参考）】\n名称：${company.name}\n行业：${company.industry || '未填'}\n常见岗位：${(company.roles || []).join('、') || '未填'}\n关键词：${(company.jdKeywords || []).join('、') || '未填'}`);
    }
    if (role?.jdPoints?.length) {
      parts.push(`【这个岗位通常看重什么（预置，仅作参考）】\n${role.jdPoints.join('、')}`);
    }
    if (profileSlice) parts.push(`【候选人资料（只挑与本题相关的部分）】\n${profileSlice}`);
    if (attachmentSlice) parts.push(`【参考附件片段】\n${attachmentSlice}`);
    if (site?.quirks?.length) parts.push(`【当前招聘网站】${site.name}。注意：${site.quirks.join('；')}`);

    parts.push(`【要回答的问题】\n${question}`);
    if (limit) parts.push(`【字数上限】\n不超过 ${limit} 字。`);
    if (style) parts.push(`【风格】\n${style}`);
    if (previous) parts.push(`【上一版内容】\n${previous}\n\n请换一个角度重写，不要只是换同义词。`);

    return {
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: parts.join('\n\n') },
      ],
      key: contextKey || '',
    };
  }

  // 一次生成。命中缓存或「常用网申答案」就不发请求。
  async function recommend({ question, limit, style, contextKey, previous, profileSlice, attachmentSlice, force = false }) {
    const key = [question, contextKey || '', style || '', limit || '', previous || ''].join('|');
    if (!force) {
      const saved = ai.savedAnswer(question, contextKey);
      if (saved) return { text: saved.text, from: '已保存的答案', cached: true };
      const cached = ai.cacheGet('reco:' + key);
      if (cached) return { text: cached, from: '缓存', cached: true };
    }
    const { messages } = buildPrompt({ question, limit, style, contextKey, previous, profileSlice, attachmentSlice });
    const text = await ai.chat(messages, { maxTokens: Math.max(400, (limit || 300) * 2 + 200) });
    ai.cachePut('reco:' + key, text);
    return { text, from: 'AI 生成', cached: false };
  }

  root.ResumeContext = {
    read, write, detect, detectCompany, detectRole, detectJD, detectLocation, detectType,
    value, rememberJD, presetBundle, buildPrompt, recommend, SYSTEM,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
