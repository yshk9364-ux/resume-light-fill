// 三层预设库：站点（招聘平台）/ 公司（雇主）/ 岗位（职位）。
//
// 定位要讲清楚，否则很容易做成「固定模板」，那正是需求里明确不要的东西：
//   预设提供的是**结构**（这个平台怎么点、这个问题通常怎么问、这个字段限多少字），
//   不是**答案**。答案必须由「我的资料 + 这家公司这个岗位的 JD」现场生成。
// 所以下面每条 preset 都带 kind:'hint' 的语义，组装提示词时只当参考材料，不当既定事实。
(function (root) {
  'use strict';

  const store = root.ResumeStore;
  const KEY = 'presets';

  // ---------------------------------------------------------------- 内置种子
  // 站点预设：先覆盖已知的主流平台。dropdown 是关键 —— 用户 v2.4.7 那批失败里，
  // 很大一部分是「下拉里到底有什么 nobody 知道」，把候选缓存下来，匹配就有依据了。
  const SITE_SEED = [
    {
      id: 'mokahr',
      name: 'Moka（漠河）',
      domains: ['mokahr.com'],
      // Moka 用 Semi Design，所有类名都是 "<block>-<hash>"，hash 每次发版都会变，
      // 所以只能按 block 前缀匹配，不能写完整类名。
      notes: 'Semi Design。类名形如 sd-Input-input-10L0t，hash 会变，禁止写完整类名。',
      dropdown: {
        最高学历: ['大专', '本科', '硕士', '博士', '其他'],
        学位: ['学士', '硕士', '博士', '无'],
        性别: ['男', '女'],
        民族: ['汉族', '满族', '回族', '蒙古族', '藏族', '维吾尔族', '苗族', '彝族', '壮族', '其他'],
        政治面貌: ['中共党员', '中共预备党员', '共青团员', '民主党派', '群众'],
        婚姻状况: ['未婚', '已婚', '离异'],
        生源地区: ['城市', '农村'],
        是否有兄弟姐妹: ['否', '是'],
        直属上级: ['无'],
      },
      // 已知的坑，写进预设是为了以后换人维护时不用重新踩。
      quirks: [
        '下拉的真正值在 input 的兄弟节点 sd-Input-display-value-* 上，input.value 本身恒为空。',
        '「意向工作城市」是按省份折叠的级联菜单（sd-Menu-header-*），顶层只有省份，点开才有城市。',
        '日期是「年」「月」两个独立 input，placeholder 分别是 年 / 月。',
      ],
    },
    {
      id: 'beisen',
      name: '北森 iTalent',
      domains: ['beisen.com', 'italent.cn'],
      notes: 'iTalent。经历类字段常在弹窗里，弹窗未打开时扫描不到。',
      dropdown: { 最高学历: ['大专', '本科', '硕士', '博士'], 性别: ['男', '女'] },
      quirks: ['新增经历走弹窗，必须先点「添加」等弹窗出现，否则该区块字段数为 0。'],
    },
    {
      id: 'liepin',
      name: '猎聘',
      domains: ['liepin.com'],
      notes: '校招与社招两套表单，字段不完全一致。',
      dropdown: { 最高学历: ['大专', '本科', '硕士', '博士'], 工作经验: ['应届生', '1年以内', '1-3年', '3-5年', '5-10年', '10年以上'] },
      quirks: ['投递前常弹「同意授权」类弹窗，会挡住扫描。'],
    },
    {
      id: 'zhaopin',
      name: '智联招聘',
      domains: ['zhaopin.com'],
      notes: '校招站点是 xiaoyuan.zhaopin.com，与主站字段不同。',
      dropdown: { 最高学历: ['大专', '本科', '硕士', '博士', '其他'] },
      quirks: [],
    },
    {
      id: '51job',
      name: '前程无忧 51job',
      domains: ['51job.com'],
      notes: '',
      dropdown: { 最高学历: ['大专', '本科', '硕士', '博士', '其他'] },
      quirks: [],
    },
    {
      id: 'zhipin',
      name: 'BOSS 直聘',
      domains: ['zhipin.com'],
      notes: '',
      dropdown: { 最高学历: ['初中及以下', '中专/中技', '高中', '大专', '本科', '硕士', '博士', '其他'] },
      quirks: ['登录态失效时页面会跳登录，扫描到的是空表单。'],
    },
    {
      id: 'shixiseng',
      name: '实习僧',
      domains: ['shixiseng.com', 'shixiseng.net'],
      notes: '',
      dropdown: {},
      quirks: [],
    },
  ];

  // 公司预设：先放用户已经投过、且存档网页里有的几家。作用是 AI 不用每次从零猜公司，
  // 顺带让公司名能被自动校准。
  const COMPANY_SEED = [
    {
      id: 'hotwind',
      name: '热风时尚',
      aliases: ['热风', 'Hotwind', '热风时尚集团'],
      industry: '服饰零售',
      scale: '连锁零售',
      roles: ['运营管培生', '门店管理培训生', '商品企划', '市场推广'],
      jdKeywords: ['门店运营', '销售管理', '陈列', '会员运营', '数据驱动', '轮岗'],
      openQuestions: ['为什么选择热风', '对门店运营的理解', '职业规划'],
    },
    {
      id: 'jinjiang',
      name: '锦江国际集团',
      aliases: ['锦江国际', '锦江之星', '锦江都城'],
      industry: '酒店旅游',
      scale: '跨国酒店集团',
      roles: ['管培生', '酒店运营', '前厅管理'],
      jdKeywords: ['酒店运营', '客户体验', '收益管理', '跨文化', '轮岗培养'],
      openQuestions: ['为什么选择酒店行业', '对锦江的理解', '职业规划'],
    },
    {
      id: 'daijia',
      name: '大家保险',
      aliases: ['大家保险', '大家人寿'],
      industry: '保险金融',
      scale: '保险公司',
      roles: ['管培生', '寿险顾问', '运营岗'],
      jdKeywords: ['保险', '金融', '合规', '客户服务', '长期主义'],
      openQuestions: ['为什么选择保险行业', '对保险的理解', '职业规划'],
    },
    {
      id: 'bosc',
      name: '上海银行',
      aliases: ['上海银行', 'BOSC'],
      industry: '银行',
      scale: '城商行',
      roles: ['管培生', '客户经理', '风险管理', '金融科技'],
      jdKeywords: ['银行', '风险合规', '客户经营', '数字化', '柜面'],
      openQuestions: ['为什么选择银行', '对银行业的理解', '职业规划'],
    },
  ];

  // 岗位预设：同一岗位在不同公司问法高度相似，所以「问法 + 字数上限 + 答题骨架」是结构性的，
  // 值得预置；具体内容仍然每次按这家公司 JD 现场生成。
  const ROLE_SEED = [
    {
      id: 'ops-trainee',
      name: '运营管培生',
      match: ['运营管培', '运营培训生', '管培生', '运营管理培训'],
      jdPoints: ['门店/业务一线运营', '数据驱动决策', '会员与用户运营', '跨部门协作', '轮岗培养'],
      questions: [
        { key: '为什么申请这个岗位', limit: 300, frame: '先说对岗位的理解，再说自己的哪一点经历对得上，最后落到为什么是这家公司。' },
        { key: '对岗位的理解', limit: 300, frame: '拆解这个岗位的日常动作和核心指标，再说自己能补上哪一块。' },
        { key: '个人优势', limit: 250, frame: '挑 2-3 条，每条都用具体经历佐证，不要形容词堆砌。' },
        { key: '职业规划', limit: 250, frame: '近期（1年）做什么、中期（3年）到什么位置、长期想成为什么样的人，要和这个岗位接得上。' },
        { key: '自我介绍', limit: 400, frame: '按 教育 → 实习/项目 → 校园 → 技能 与岗位的顺序讲，结尾一句落到岗位。' },
        { key: '其他补充说明', limit: 300, frame: '只写对岗位真正有加分的：相关证书、跨文化/语言能力、可入职时间。' },
      ],
    },
    {
      id: 'product',
      name: '产品经理',
      match: ['产品经理', '产品运营', '产品策划', '产品管培'],
      jdPoints: ['需求挖掘', '用户研究', '数据驱动迭代', '跨团队推进', '竞品分析'],
      questions: [
        { key: '为什么申请这个岗位', limit: 300, frame: '对岗位的理解 → 自己做过的用户/数据侧证据 → 为什么是这家公司。' },
        { key: '对岗位的理解', limit: 300, frame: '需求从哪来、怎么判断做不做、怎么衡量做得好不好。' },
        { key: '职业规划', limit: 250, frame: '从执行到独立负责一条线，节奏要具体。' },
      ],
    },
    {
      id: 'marketing',
      name: '市场营销',
      match: ['市场', '营销', '品牌', '推广', '内容运营'],
      jdPoints: ['品牌建设', '活动策划', '内容传播', '渠道增长', '数据分析'],
      questions: [
        { key: '为什么申请这个岗位', limit: 300, frame: '理解 + 传播/活动相关经历 + 公司契合点。' },
        { key: '个人优势', limit: 250, frame: '用具体产出（阅读量、活动到场率、内容转化）代替形容词。' },
      ],
    },
    {
      id: 'hr',
      name: '人力资源',
      match: ['人力资源', 'HR', '招聘', 'HRBP', '人力管培'],
      jdPoints: ['招聘交付', '人才发展', '组织文化', '员工关系', '数据画像'],
      questions: [
        { key: '为什么申请这个岗位', limit: 300, frame: '理解 + 服务/组织相关经历 + 为什么这家公司。' },
        { key: '对岗位的理解', limit: 300, frame: '从业务伙伴角度讲，不要讲成事务性 HR。' },
      ],
    },
    {
      id: 'finance',
      name: '财务',
      match: ['财务', '会计', '审计', '金融', '风控'],
      jdPoints: ['财务核算', '预算管理', '合规风控', '数据准确性', '审计配合'],
      questions: [
        { key: '为什么申请这个岗位', limit: 300, frame: '强调严谨、耐心、可重复验证的工作习惯。' },
      ],
    },
    {
      id: 'tech',
      name: '研发',
      match: ['研发', '开发', '工程师', '算法', '测试', '运维'],
      jdPoints: ['技术能力', '工程质量', '问题定位', '协作与文档', '持续学习'],
      questions: [
        { key: '为什么申请这个岗位', limit: 300, frame: '项目里的技术难点和你怎么解决的，这是最有说服力的部分。' },
        { key: '对岗位的理解', limit: 300, frame: '别空谈，写你实际见过的问题类型和处理方式。' },
      ],
    },
  ];

  // ---------------------------------------------------------------- 读写
  function defaults() {
    return {
      sites: SITE_SEED,
      companies: COMPANY_SEED,
      roles: ROLE_SEED,
      disabled: [],   // 被用户拉黑的条目 id
      learned: [],    // 从填写记录里学到的公司/站点补充
    };
  }

  function all() {
    const saved = store.get(KEY);
    if (!saved || typeof saved !== 'object') {
      const d = defaults();
      store.set(KEY, d);
      return d;
    }
    // 逐段补齐：用户可能只存了部分段，或者旧版本存的段名不同。
    const d = defaults();
    return {
      sites: Array.isArray(saved.sites) ? saved.sites : d.sites,
      companies: Array.isArray(saved.companies) ? saved.companies : d.companies,
      roles: Array.isArray(saved.roles) ? saved.roles : d.roles,
      disabled: Array.isArray(saved.disabled) ? saved.disabled : [],
      learned: Array.isArray(saved.learned) ? saved.learned : [],
    };
  }

  function save(next) { store.set(KEY, next); return next; }

  function isDisabled(id) { return all().disabled.includes(id); }
  function disable(id) { const s = all(); if (!s.disabled.includes(id)) { s.disabled.push(id); save(s); } }
  function enable(id) { const s = all(); s.disabled = s.disabled.filter(x => x !== id); save(s); }

  // ---------------------------------------------------------------- 查询
  const host = () => String(location.hostname || '').toLowerCase();

  function siteForDomain(domain) {
    const d = String(domain || host()).toLowerCase();
    return all().sites.find(s => !isDisabled(s.id) && (s.domains || []).some(x => d === x || d.endsWith('.' + x))) || null;
  }

  function companyByName(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    return all().companies.find(c => {
      if (isDisabled(c.id)) return false;
      return [c.name, ...(c.aliases || [])].some(a => a && (t.includes(a) || a.includes(t)));
    }) || null;
  }

  function roleByName(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    return all().roles.find(r => !isDisabled(r.id) && (r.match || []).some(m => t.includes(m) || m.includes(t))) || null;
  }

  // 下拉候选：合并站点预设和运行时观察到的。运行时那份优先，因为它反映当前页面的真实情况。
  function dropdownOptions(siteId, fieldLabel) {
    const s = all().sites.find(x => x.id === siteId);
    if (!s) return [];
    const exact = (s.dropdown || {})[fieldLabel];
    if (Array.isArray(exact)) return exact;
    const fuzzy = Object.keys(s.dropdown || {}).find(k => fieldLabel.includes(k) || k.includes(fieldLabel));
    return fuzzy ? s.dropdown[fuzzy] : [];
  }

  // ---------------------------------------------------------------- 经验积累
  // 用户投完一家可以让它记下来，下次遇到同类公司直接命中。这条是「预设越用越准」的关键，
  // 手动维护一份公司名单不可能跟得上海投的速度。
  function learnCompany(entry) {
    if (!entry || !entry.name) return null;
    const s = all();
    const id = 'learned-' + String(entry.name).trim().replace(/\s+/g, '-').slice(0, 40);
    if (s.learned.some(c => c.id === id)) return id;
    s.learned.push({
      id,
      name: String(entry.name).trim(),
      aliases: entry.aliases || [],
      industry: entry.industry || '',
      roles: entry.roles || [],
      jdKeywords: entry.jdKeywords || [],
      openQuestions: entry.openQuestions || [],
      learnedFrom: entry.source || 'manual',
      at: new Date().toISOString().slice(0, 10),
    });
    save(s);
    return id;
  }

  // 站点层面的学习：把「这个下拉里实际有哪些选项」记下来。直接解决"没人知道下拉里有什么"。
  function learnDropdown(siteId, fieldLabel, options) {
    if (!siteId || !fieldLabel || !Array.isArray(options) || options.length < 2) return false;
    const s = all();
    const site = s.sites.find(x => x.id === siteId);
    if (!site) return false;
    site.dropdown = site.dropdown || {};
    const existing = site.dropdown[fieldLabel];
    const merged = [...new Set([...(existing || []), ...options.filter(Boolean)])].slice(0, 60);
    if (JSON.stringify(merged) === JSON.stringify(existing)) return false;
    site.dropdown[fieldLabel] = merged;
    save(s);
    return true;
  }

  function summary() {
    const s = all();
    return {
      sites: s.sites.length,
      companies: s.companies.length + s.learned.length,
      roles: s.roles.length,
      disabled: s.disabled.length,
    };
  }

  root.ResumePresets = {
    all, save, defaults,
    siteForDomain, companyByName, roleByName, dropdownOptions,
    isDisabled, disable, enable,
    learnCompany, learnDropdown,
    summary,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
