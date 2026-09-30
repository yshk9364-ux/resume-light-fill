// 线上 AI 客户端。两种协议：OpenAI 兼容（国内各家基本都有）与 Anthropic。
//
// 为什么必须双协议：OpenAI 官方接口拒绝浏览器来源，油猴的 GM_xmlhttpRequest 绕过了浏览器
// 的 CORS 检查，但服务端会看来源直接拒。Anthropic 加 anthropic-dangerous-direct-browser-access
// 头即可浏览器直连；国内的 DeepSeek / 通义 / Kimi / 智谱 CORS 宽松，直连通常最顺。
// 所以做成两种，用户填什么就用什么，不在代码里绑死一家。
(function (root) {
  'use strict';

  const store = root.ResumeStore;
  const CONFIG_KEY = 'aiConfig';
  const CACHE_KEY = 'aiCache';
  const ANSWERS_KEY = 'savedAnswers';   // 「常用网申答案」：用户改过满意的答案就存这里

  // 预置的常见服务商。用户填名字匹配得到端点和协议，省得自己查。
  const PROVIDERS = [
    { id: 'deepseek', name: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat', note: '国内直连通常最顺' },
    { id: 'qwen', name: '通义千问', protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus', note: '' },
    { id: 'kimi', name: 'Kimi / Moonshot', protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-32k', note: '' },
    { id: 'zhipu', name: '智谱 GLM', protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4', note: '' },
    { id: 'minimax', name: 'MiniMax', protocol: 'openai', baseUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2', model: 'abab6.5s-chat', note: '' },
    { id: 'claude', name: 'Claude（Anthropic）', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', note: '浏览器直连需要加专用头，已自动处理' },
    { id: 'openrouter', name: 'OpenRouter', protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'nvidia/nemotron-3-ultra-550b-a55b:free', note: 'Base URL 可填 /api/v1，自动补全聊天接口' },
    { id: 'custom', name: '自定义（OpenAI 兼容）', protocol: 'openai', baseUrl: '', model: '', note: '任何 OpenAI 兼容端点都能填' },
  ];

  function config() {
    const saved = store.get(CONFIG_KEY);
    if (!saved || typeof saved !== 'object') {
      return { provider: 'deepseek', baseUrl: '', model: '', apiKey: '', extraHeaders: '', temperature: 0.7, maxTokens: 800 };
    }
    return {
      provider: saved.provider || 'deepseek',
      baseUrl: saved.baseUrl || '',
      model: saved.model || '',
      apiKey: saved.apiKey || '',
      extraHeaders: saved.extraHeaders || '',
      temperature: typeof saved.temperature === 'number' ? saved.temperature : 0.7,
      maxTokens: Number.isFinite(saved.maxTokens) && saved.maxTokens >= 128 ? Math.round(saved.maxTokens) : 800,
    };
  }

  function saveConfig(next) { store.set(CONFIG_KEY, next); return next; }

  function provider() {
    const c = config();
    return PROVIDERS.find(p => p.id === c.provider) || PROVIDERS[PROVIDERS.length - 1];
  }

  // 端点 / 模型：用户填了就用用户填的，没填就用预置的。
  function endpoint() {
    const c = config(), p = provider();
    const raw = (c.baseUrl || p.baseUrl || '').trim().replace(/\/+$/, '');
    if (p.protocol === 'anthropic' || !raw) return raw;
    if (/\/chat\/completions$/i.test(raw)) return raw;
    if (/\/api\/v1$|\/v1$/i.test(raw)) return raw + '/chat/completions';
    return raw;
  }
  function model() {
    const c = config(), p = provider();
    return (c.model || p.model || '').trim();
  }
  function isConfigured() { return !!config().apiKey && !!endpoint() && !!model(); }

  // key 只显示后 4 位。页面上任何地方都不应该出现完整 key —— 包括错误报告，
  // 因为错误报告是设计成可以直接粘给 AI / 粘到别处的。
  function maskKey(key) {
    const k = String(key || '');
    if (!k) return '';
    if (k.length <= 8) return '••••';
    return k.slice(0, 3) + '••••' + k.slice(-4);
  }

  // ---------------------------------------------------------------- 隐私过滤
  // 这些字段永远不进 prompt。这条是代码级拦截，不是靠提示词自觉。
  const NEVER_SEND = [
    'idNumber', 'idCard', '身份证', '证件号码', '身份证号',
    'photo', '照片', '一寸照', '二寸照',
    'transcript', '成绩单', 'gpa', '绩点', '排名',
    'bankCard', '银行卡', '开户行',
    'familyPhone', '家庭电话', '紧急联系人电话',
    'salaryExpectation', '期望薪资', '薪资要求',
    'password', '密码',
  ];

  // 值层面的兜底：即便某个字段没在上面的名单里，只要值长得像身份证号 / 手机号 / 银行卡，
  // 也不发。宁可少发，也不把身份信息交出去。
  const VALUE_PATTERNS = [
    /\b\d{17}[\dXx]\b/,                    // 身份证号
    /\b1[3-9]\d{9}\b/,                     // 手机号
    /\b\d{16,19}\b/,                       // 银行卡
    /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/,   // 分组银行卡
  ];

  function scrubValue(value) {
    const s = String(value ?? '');
    for (const re of VALUE_PATTERNS) {
      if (re.test(s)) return '[已省略的敏感信息]';
    }
    return s;
  }

  function isNeverSend(fieldKey, label) {
    const hay = `${fieldKey || ''} ${label || ''}`.toLowerCase();
    return NEVER_SEND.some(k => hay.includes(k.toLowerCase()));
  }

  // ---------------------------------------------------------------- 缓存
  function cacheGet(key) {
    const c = store.get(CACHE_KEY);
    if (!c || typeof c !== 'object') return null;
    return c[key] || null;
  }
  function cachePut(key, value) {
    const c = Object.assign({}, store.get(CACHE_KEY) || {});
    c[key] = value;
    // 只保留最近 200 条，避免 GM 存储无限膨胀。
    const keys = Object.keys(c);
    if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete c[k];
    store.set(CACHE_KEY, c);
  }

  // 「常用网申答案」：命中就完全不发请求。这是省 token 的一等公民。
  function savedAnswer(question, contextKey) {
    const list = store.get(ANSWERS_KEY);
    if (!Array.isArray(list)) return null;
    return list.find(a => a.question === question && (!contextKey || !a.contextKey || a.contextKey === contextKey)) || null;
  }
  function saveAnswer(entry) {
    const list = Array.isArray(store.get(ANSWERS_KEY)) ? store.get(ANSWERS_KEY).slice() : [];
    const i = list.findIndex(a => a.question === entry.question && a.contextKey === entry.contextKey);
    if (i >= 0) list[i] = entry; else list.push(entry);
    store.set(ANSWERS_KEY, list.slice(-200));
    return entry;
  }
  function removeAnswer(question, contextKey) {
    const list = Array.isArray(store.get(ANSWERS_KEY)) ? store.get(ANSWERS_KEY) : [];
    store.set(ANSWERS_KEY, list.filter(a => !(a.question === question && a.contextKey === contextKey)));
  }

  // ---------------------------------------------------------------- 请求
  function request(rawUrl, { method = 'POST', headers = {}, body = null, timeout = 60000 } = {}) {
    const GMx = root.GM_xmlhttpRequest || root.GM?.xmlHttpRequest || null;
    if (typeof GMx !== 'function') return Promise.reject(new Error('当前脚本管理器不支持 GM_xmlhttpRequest，请换用 Tampermonkey 或 Violentmonkey'));
    return new Promise((resolve, reject) => {
      GMx({
        method,
        url: rawUrl,
        headers,
        data: body,
        timeout,
        onload: res => {
          // GM 在跨域请求成功时也会给 2xx 之外的 status，所以要按 status 判，不能只看有没有 error。
          if (res.status >= 200 && res.status < 300) return resolve(res);
          if (res.status === 0) return reject(new Error('网络请求没有到达服务器：可能被浏览器的隐私设置或公司网络拦了。若用的是公司网络，换个服务商试试。'));
          const detail = extractApiError(res);
          reject(new Error(detail));
        },
        onerror: () => reject(new Error('网络请求失败：连不上服务器。请检查网络、端点地址是否正确。')),
        ontimeout: () => reject(new Error('请求超时。AI 服务可能很慢，或网络不通。')),
      });
    });
  }

  function extractApiError(res) {
    let msg = '';
    try {
      const j = JSON.parse(res.responseText);
      msg = j.error?.message || j.message || j.msg || j.error || '';
      if (Array.isArray(msg)) msg = msg.map(m => m.message || String(m)).join('; ');
    } catch { /* 不是 JSON 就用原文 */ }
    if (!msg) msg = String(res.responseText || '').slice(0, 300);
    if (res.status === 401 || res.status === 403) return `API 拒绝了请求（${res.status}）：${maskKey(config().apiKey)} 不是有效的 key，或没有这个模型的权限。` + (msg ? ` 服务端说：${msg}` : '');
    if (res.status === 404) return `端点不对（404）：${endpoint()}。请检查端点地址是否完整。` + (msg ? ` 服务端说：${msg}` : '');
    if (res.status === 429) return 'AI 服务返回 429（请求频率或当前模型的容量限制）。账户有余额也可能遇到此限制，请稍后重试或切换模型。' + (msg ? ` 服务端说：${msg}` : '');
    if (res.status >= 500) return `AI 服务端出错（${res.status}）。这是对方的问题，稍后重试。` + (msg ? ` 服务端说：${msg}` : '');
    return `请求失败（${res.status}）：${msg}`;
  }

  function parseExtraHeaders(text) {
    const out = {};
    for (const line of String(text || '').split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) {
        const k = line.slice(0, i).trim();
        if (k) out[k] = line.slice(i + 1).trim();
      }
    }
    return out;
  }

  // 一次对话请求。messages 是 [{role, content}]，返回纯文本。
  async function chat(messages, opts = {}) {
    if (!isConfigured()) throw new Error('还没有配置 AI。请在「AI 设置」里填 API key。');
    const c = config(), p = provider();
    const url = endpoint();
    const extra = parseExtraHeaders(c.extraHeaders);
    const temperature = typeof opts.temperature === 'number' ? opts.temperature : c.temperature;
    let maxTokens = Number.isFinite(opts.maxTokens) && opts.maxTokens >= 128 ? Math.round(opts.maxTokens) : c.maxTokens;

    let headers, payload;
    if (p.protocol === 'anthropic') {
      headers = Object.assign({
        'content-type': 'application/json',
        'x-api-key': c.apiKey,
        'anthropic-version': '2023-06-01',
        // 这行是浏览器直连 Claude 的必要条件，漏了会被拒。
        'anthropic-dangerous-direct-browser-access': 'true',
      }, extra);
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
      payload = {
        model: model(),
        max_tokens: maxTokens,
        temperature,
        system: sys || undefined,
        messages: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
      };
    } else {
      headers = Object.assign({ 'content-type': 'application/json', authorization: 'Bearer ' + c.apiKey }, extra);
      payload = { model: model(), messages, temperature, max_tokens: maxTokens, stream: false };
      // Nemotron 3 Ultra defaults to reasoning; short form answers can spend the entire
      // output budget thinking and return no usable content. This model allows reasoning off.
      if (p.id === 'openrouter' && model() === 'nvidia/nemotron-3-ultra-550b-a55b:free') payload.reasoning = { enabled: false };
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      payload.max_tokens = maxTokens;
      const res = await request(url, { method: 'POST', headers, body: JSON.stringify(payload) });
      let text = '', finishReason = '';
      try {
        const j = JSON.parse(res.responseText);
        if (p.protocol === 'anthropic') {
          text = (j.content || []).map(c => c.text || '').join('');
          finishReason = j.stop_reason || '';
        } else {
          text = j.choices?.[0]?.message?.content ?? j.choices?.[0]?.text ?? '';
          finishReason = j.choices?.[0]?.finish_reason || '';
        }
      } catch {
        throw new Error('AI 返回的内容不是预期的 JSON，请确认端点填的是 chat/completions 或 messages 接口。');
      }
      const cleaned = cleanModelOutput(text);
      if (cleaned) return cleaned;
      if (attempt === 0 && maxTokens < 4096 && ['length', 'max_tokens'].includes(finishReason)) {
        maxTokens = Math.min(4096, Math.max(2048, maxTokens * 4));
        continue;
      }
      throw new Error(`AI 服务已响应，但没有返回正文${finishReason ? `（结束原因：${finishReason}）` : ''}。已尝试增加输出长度；请更换模型或检查模型设置。`);
    }
  }

  // 模型偶尔会包一层 markdown 或加「好的，以下是…」的开场白。网申框里要的是能直接粘的正文，
  // 所以这里做一次保守清洗 —— 只去围栏和首尾寒暄，不改写内容本身。
  function cleanModelOutput(text) {
    let out = String(text || '').trim();
    const fence = out.match(/^```[a-z]*\s*\n([\s\S]*?)\n```$/i);
    if (fence) out = fence[1].trim();
    out = out.replace(/^(好的|以下是|根据你的|根据您的)[^\n]{0,40}[:：]\s*\n+/, '');
    out = out.replace(/^\s*[-*]\s+/gm, '');       // 去掉逐条前导的 - / *
    return out.trim();
  }

  // 连通性测试，设置页点一下就知道 key 和端点对不对，比填完才发现强。
  async function ping() {
    const answer = await chat(
      [
        { role: 'system', content: '只回复两个字：可用' },
        { role: 'user', content: '测试' },
      ],
      { maxTokens: 128, temperature: 0 }
    );
    if (!/^可用[。.!！]?$/.test(answer.trim())) throw new Error('服务已响应，但模型没有按要求返回“可用”。请切换模型或检查输出设置。');
    return answer;
  }

  root.ResumeAI = {
    PROVIDERS, config, saveConfig, provider, endpoint, model, isConfigured, maskKey,
    chat, ping, request,
    isNeverSend, scrubValue,
    savedAnswer, saveAnswer, removeAnswer,
    cacheGet, cachePut,
    cleanModelOutput,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
