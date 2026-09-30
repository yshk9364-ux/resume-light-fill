// AI 字段识别与映射修正（§20 动态字段 / §21 修正映射 / §22 纠正误识别 / §33 下拉 AI 判断）。
//
// 铁律（§24/§71）：AI 可以提"映射/格式/字段含义"的建议，但绝不能未经确认改动真实个人事实。
// 所以这个模块产出的全是"建议对象"（pending suggestion），由 UI 展示给用户点【采用】才落库。
// 成败判定仍在引擎的读回校验里，AI 不参与。
(function (root) {
  'use strict';

  const ai = root.ResumeAI;
  const lib = root.ResumeFieldLibrary;
  const mapping = root.ResumeMapping;
  const v2 = root.ResumeProfileV2;
  const logger = root.ResumeLogger;
  const context = root.ResumeContext;

  // 规则链（§50）已经能定就不问 AI —— 省 token、结果稳定。
  // 只有 resolve() 返回 null，或用户显式要求"AI 重新分析"时才走这里。
  function shouldAskAI(label, currentFieldId) {
    if (!ai.isConfigured()) return false;
    const r = mapping.resolve(label);
    if (!r) return true;                       // 规则完全没命中
    if (currentFieldId && r.confidence < 0.7) return true;  // 规则命中但很弱，值得复核
    return false;
  }

  const SYSTEM = `你是一位中国求职网申字段识别专家。任务：把招聘网站上的字段，判断成候选人资料库里的标准字段。

规则：
1. 只输出 JSON，不要任何解释或 markdown 围栏。
2. 只能在给定的 fieldId 列表里选；如果列表里没有任何一个语义相符，就返回 needNewField=true 并给出建议的新 fieldId。
3. 不能凭空发明 fieldId。新字段建议要符合 <category>.<camelCase> 命名。
4. 拿不准就给低 confidence，不要硬凑。`;

  // fields: [{ label, context, type, currentFieldId }] —— 规则没能定的那批
  // 返回 [{ label, fieldId, confidence, reason, needNewField?, newField? , alternativeFieldId? }]
  async function identifyFields(fields) {
    if (!fields.length) return [];
    const catalog = lib.all().map(f => ({ fieldId: f.fieldId, name: f.name, category: f.category }));
    const userPrompt = [
      '标准字段库（只能从中选择）：',
      JSON.stringify(catalog),
      '',
      '需要你判断的网页字段：',
      JSON.stringify(fields.map(f => ({ label: f.label, context: f.context || '', type: f.type || '', 插件当前猜测: f.currentFieldId || '（没猜到）' }))),
      '',
      '对每个字段输出一个对象，字段为：label(原样), fieldId(选中的标准字段或null), confidence(0-1), reason(一句话), needNewField(bool), newField({fieldId,name,category,aliases}), alternativeFieldId(第二可能或null)。',
      '严格输出 JSON 数组。',
    ].join('\n');

    let out;
    try {
      const raw = await ai.chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt }], { temperature: 0, maxTokens: 1500 });
      out = parseJSON(raw);
    } catch (e) {
      logger.warn('AI 字段识别失败', e.message);
      return [];
    }
    // 把结果和输入对齐（模型可能漏项/多项，按 label 配对）
    const byLabel = new Map((out || []).map(o => [norm(o.label), o]));
    return fields.map(f => {
      const o = byLabel.get(norm(f.label)) || {};
      return {
        label: f.label,
        fieldId: lib.byId(o.fieldId) ? o.fieldId : null,
        confidence: Number.isFinite(o.confidence) ? Math.max(0, Math.min(1, o.confidence)) : 0,
        reason: o.reason || '',
        needNewField: !!o.needNewField,
        newField: o.newField || null,
        alternativeFieldId: o.alternativeFieldId || null,
        currentFieldId: f.currentFieldId || null,
      };
    });
  }

  // 下拉候选 AI 判断（§33 流水线的最后一步）：给定资料值和网页候选，问 AI 选哪个最合适。
  // 例如资料"示例省示例市"，候选["成都","成都市","四川-成都"]。规则已经能定的不问。
  async function pickChoice(value, options, fieldLabel) {
    if (!ai.isConfigured()) return null;
    if (!options || options.length < 2) return null;
    const userPrompt = [
      '网页字段：' + (fieldLabel || ''),
      '我的资料值：' + value,
      '网页可选值：' + JSON.stringify(options),
      '',
      '从网页可选值里挑出语义最接近我资料值的一个。只输出 JSON：{"choice":"<选中的原文>","confidence":0-1,"reason":"一句话"}。找不到就说 choice:null。不要输出其它内容。',
    ].join('\n');
    try {
      const raw = await ai.chat([{ role: 'system', content: '只输出 JSON，不要解释。' }, { role: 'user', content: userPrompt }], { temperature: 0, maxTokens: 200 });
      return parseJSON(raw);
    } catch (e) { return null; }
  }

  // 岗位上下文识别复核（§41/§42）：把页面上抓到的文本丢给 AI 复核公司/岗位/JD。
  // apply 页常常没 JD，此时允许 AI 从岗位描述里抽，也允许返回"未找到"由用户手填。
  async function analyzeJobContext() {
    if (!ai.isConfigured()) return null;
    const cur = context.read().fields;
    const pageText = (document.body?.innerText || '').slice(0, 6000);
    const userPrompt = [
      '下面是某个招聘投递页面（或岗位详情页）的文本。请提取：',
      'company(公司名), role(岗位名), location(工作地点), type(校招/社招/实习), jd(岗位描述或职责要求原文，没找到就 null)。',
      '只输出 JSON，不要解释。找不到的字段用 null。jd 最多 800 字。',
      '',
      '当前已抓取到的值（可能不准，供你参考，不要盲从）：',
      JSON.stringify({ company: cur.company?.value, role: cur.role?.value, location: cur.location?.value, type: cur.type?.value }),
      '',
      '页面文本：',
      pageText,
    ].join('\n');
    try {
      const raw = await ai.chat([{ role: 'system', content: '只输出 JSON，不要解释。' }, { role: 'user', content: userPrompt }], { temperature: 0, maxTokens: 1200 });
      return parseJSON(raw);
    } catch (e) { return null; }
  }

  // 格式转换建议（§26）：资料原值 2030-07-01，网页要 2030年07月。让 AI 或规则给显示形态。
  // 注意：这里只产出"显示字符串"，绝不改资料库原值（§26 明确）。
  function suggestFormat(rawValue, dataType, hintFormat) {
    const v = String(rawValue || '').trim();
    if (!v) return '';
    const y = v.match(/^(\d{4})[-/.年]?(\d{1,2})?[-/.月]?(\d{1,2})?/);
    if (!y) return v;
    const Y = y[1], M = y[2], D = y[3];
    const pad = n => (n ? String(n).padStart(2, '0') : '');
    const hint = String(hintFormat || '').toLowerCase();
    if (dataType === 'year' || (!M && /year|年/.test(hint))) return Y;
    if (dataType === 'month' || (!D && /month|月/.test(hint))) {
      if (/年年|月月/.test(hint)) return Y + '年' + pad(M) + '月';
      if (hint.includes('/')) return pad(M) + '/' + Y;
      if (hint.includes('.')) return Y + '.' + pad(M);
      return Y + '-' + pad(M);
    }
    if (dataType === 'date' && M && D) {
      if (/年年/.test(hint)) return Y + '年' + pad(M) + '月' + pad(D) + '日';
      if (hint.includes('/')) return Y + '/' + pad(M) + '/' + pad(D);
      if (hint.includes('.')) return Y + '.' + pad(M) + '.' + pad(D);
      return Y + '-' + pad(M) + '-' + pad(D);
    }
    return v;
  }

  // 解析模型返回的 JSON（模型常包 markdown 围栏或前后带话）
  function parseJSON(raw) {
    let s = String(raw || '').trim();
    const f = s.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
    if (f) s = f[1];
    const a = s.indexOf('['); const b = s.indexOf('{');
    if (a >= 0 && (b < 0 || a < b)) {
      const end = s.lastIndexOf(']');
      if (end > a) return JSON.parse(s.slice(a, end + 1));
    }
    if (b >= 0) {
      const end = s.lastIndexOf('}');
      if (end > b) return JSON.parse(s.slice(b, end + 1));
    }
    return JSON.parse(s);
  }
  function norm(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }

  root.ResumeFieldAI = { shouldAskAI, identifyFields, pickChoice, analyzeJobContext, suggestFormat, parseJSON };
})(typeof globalThis !== 'undefined' ? globalThis : this);
