// 资料切片：把 profile 里与「当前问题」相关的内容挑出来，喂给 AI。
//
// 目标：既让 AI 看到足够的经历（针对性），又不把整份资料倾倒出去（隐私 + token）。
// 做法：按问题关键词做相关性打分，只取 top 若干条，并且强制过隐私闸（身份证/照片/成绩等不进）。
(function (root) {
  'use strict';

  const core = root.ResumeCore;
  const ai = root.ResumeAI;

  // 绝对不发给 AI 的字段（与 ai.NEVER_SEND 呼应，这里再挡一层，因为切片是按字段名挑的）
  const BLOCK_KEYS = new Set([
    'idNumber', 'photo', 'avatar', 'transcript', 'score', 'gpa', 'rank', 'bankCard',
    'familyPhone', 'parentPhone', 'emergencyContact', 'password', 'politicalStatusCertificate',
  ]);

  // 隐私闸：健康状况只发"健康/良好"这类结论，不发具体病史。
  const HEALTH_ALLOW = /^(健康|良好|一般|较差|无特殊疾病|正常)$/;

  // 按问题类型挑哪些分组。问"为什么申请"不需要家庭成员，问"自我评价"需要校园和技能。
  const QUESTION_HINTS = [
    { re: /(为什么|为何|申请|选择|动机|interest|motivation|why)/i, groups: ['work', 'projects', 'campus', 'professionalSkills', 'computerSkills', 'languages', 'awards'] },
    { re: /(岗位|职位|理解|认识|职责|工作内容|job|role|position)/i, groups: ['work', 'projects', 'campus', 'awards'] },
    { re: /(优势|特长|优点|strength|优势是)/i, groups: ['projects', 'work', 'campus', 'professionalSkills', 'computerSkills', 'languages', 'awards'] },
    { re: /(规划|发展|未来|五年|三年|plan|career)/i, groups: ['education', 'work', 'campus'] },
    { re: /(介绍|自我介绍|简历|about|me|intro)/i, groups: ['education', 'work', 'projects', 'campus', 'awards', 'professionalSkills', 'computerSkills', 'languages'] },
    { re: /(家庭|家庭情况|married)/i, groups: [] },   // 家庭情况一般不主动发，需要用户手填
  ];

  function groupsForQuestion(q) {
    const s = String(q || '');
    const hit = QUESTION_HINTS.find(h => h.re.test(s));
    return hit ? hit.groups : ['education', 'work', 'projects', 'campus', 'professionalSkills', 'computerSkills', 'languages', 'awards', 'certificates'];
  }

  function safeValue(key, value) {
    const k = String(key || '').toLowerCase();
    if (BLOCK_KEYS.has(k)) return '';
    if (ai.isNeverSend(k, '')) return '';
    if (/health/i.test(k)) {
      const s = String(value || '').trim();
      return HEALTH_ALLOW.test(s) ? s : '';   // 只放行结论性描述
    }
    return ai.scrubValue(value);
  }

  // 把一组经历数组压成可读文本
  function renderRow(group, row, labels) {
    const parts = [];
    for (const [field, label] of labels) {
      if (!row || row[field] === undefined) continue;
      const v = safeValue(field, row[field]);
      if (v === '' || v == null) continue;
      parts.push(label + '：' + v);
    }
    return parts.length ? parts.join('；') : '';
  }

  function currentProfile() {
    const v2 = root.ResumeProfileV2;
    const activeV2 = v2?.activeProfile?.();
    if (activeV2) return v2.toEngineProfile(activeV2);
    const store = root.ResumeStore;
    const profiles = store.get('profiles') || [];
    const active = store.get('activeProfile');
    return profiles.find(p => p.id === active) || profiles[0] || globalThis.ResumeDefaultProfile;
  }

  // 给一个问题，返回一段"我的资料"文本。
  function sliceForQuestion(question) {
    const profile = currentProfile();
    if (!profile) return '';
    const want = new Set(groupsForQuestion(question));
    const lines = [];
    const limitChars = 2600;   // 切片本身也要有上限，否则资料再大也会超

    // 基本信息：只挑跟"这个人是谁"相关的（姓名/学校/专业/毕业时间/求职意向），联系方式和证件不给
    if (want.size) {
      const b = profile.basics || {};
      const basicsFields = [
        ['name', '姓名'], ['gender', '性别'], ['birthday', '出生日期'],
        ['graduationDate', '毕业时间'], ['political', '政治面貌'],
      ];
      const btxt = renderRow('basics', b, basicsFields);
      if (btxt) lines.push('【基本信息】' + btxt);
    }

    const groupsDef = {
      education: [['school', '学校'], ['major', '专业'], ['degree', '学历'], ['studyType', '学习形式'], ['start', '起始'], ['end', '毕业'], ['description', '在校描述']],
      work: [['company', '公司'], ['department', '部门'], ['title', '职位'], ['workType', '类型'], ['start', '起始'], ['end', '结束'], ['description', '工作内容']],
      campus: [['organization', '组织'], ['department', '部门'], ['title', '职务'], ['start', '起始'], ['end', '结束'], ['description', '做了什么']],
      projects: [['name', '项目'], ['role', '角色'], ['start', '起始'], ['end', '结束'], ['description', '内容'], ['result', '成果']],
      professionalSkills: [['name', '技能'], ['level', '熟练度']],
      computerSkills: [['category', '类别'], ['level', '熟练度']],
      languages: [['language', '语言'], ['level', '水平']],
      awards: [['name', '奖项'], ['level', '级别'], ['date', '时间']],
      certificates: [['name', '证书'], ['date', '时间']],
    };
    const titles = { education: '教育经历', work: '实习/工作经历', campus: '校园经历', projects: '项目经历', professionalSkills: '专业技能', computerSkills: '计算机技能', languages: '语言', awards: '获奖', certificates: '证书' };

    for (const group of Object.keys(groupsDef)) {
      if (!want.has(group)) continue;
      const rows = profile[group];
      if (!Array.isArray(rows) || !rows.length) continue;
      const texts = [];
      for (const row of rows) {
        const t = renderRow(group, row, groupsDef[group]);
        if (t) texts.push(t);
      }
      if (texts.length) lines.push('【' + (titles[group] || group) + '】\n' + texts.join('\n'));
    }

    // 自我评价单独放最后（如果有）
    const selfEval = safeValue('selfEvaluation', (profile.basics || {}).selfEvaluation);
    if (selfEval && (want.has('work') || want.size === 0)) lines.push('【自我评价】' + selfEval);

    let out = lines.join('\n');
    if (out.length > limitChars) out = out.slice(0, limitChars) + '\n…（资料较长，已截断）';
    return out;
  }

  root.ResumeProfileAI = { sliceForQuestion, groupsForQuestion, safeValue, currentProfile };
})(typeof globalThis !== 'undefined' ? globalThis : this);
