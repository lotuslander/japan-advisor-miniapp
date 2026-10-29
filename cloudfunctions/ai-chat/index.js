/**
 * ai-chat 云函数（RAG完整版 v0.38）
 * 链路：工具路由 → 查询改写 → 向量+关键词混合检索 → 重排序 → 智能裁剪
 *      → 客户档案+历史对话 → LLM推理 → 结构化输出+可信度+引用
 *      → 记录到chat_logs
 */
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const CHAT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const EMBED_URL = 'https://open.bigmodel.cn/api/paas/v4/embeddings';
const MODEL = 'glm-4-flash';
const EMBED_MODEL = 'embedding-3';

// ============ 配置区域（云端直存，本地调试可用） ============
// 上线商用前必须换成自己的正式付费Key
const CONFIG = {
  api_key: process.env.ZHIPU_API_KEY
};
// ============ 配置结束 ============

// ============ 语义向量工具 ============
async function getEmbedding(apiKey, text) {
  try {
    const d = await postJson(EMBED_URL, { 'Authorization': 'Bearer ' + apiKey }, { model: EMBED_MODEL, input: [text] });
    return d.data[0].embedding;
  } catch (e) {
    return null; // embedding失败不阻塞，退回纯关键词
  }
}

function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

// ============ HTTP工具 ============
function postJson(url, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(bodyObj);
    const req = https.request(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers)
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('解析失败: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function callZhipu(apiKey, messages, chatUrl, useModel) {
  return postJson(chatUrl, { 'Authorization': 'Bearer ' + apiKey }, {
    model: useModel, messages, temperature: 0.3
  }).then(d => d.choices[0].message.content);
}

function embedText(apiKey, text) {
  return postJson(EMBED_URL, { 'Authorization': 'Bearer ' + apiKey }, {
    model: EMBED_MODEL, input: [text]
  }).then(d => d.data[0].embedding);
}

// ============ 检索 ============
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

function extractKeywords(q) {
  const stop = new Set(['的','了','是','我','想','要','吗','呢','在','和','与','怎么','如何','什么','多少','可以','这个','那个','请问','现在','目前','最新','一个','需要','日本','政策','签证',
    'です','ます','こと','もの','する','いる','ある','なる','ない','できる','ください','お願い']);
  return String(q).split(/[\s,，。？？!！、；;：:]/).map(w => w.trim())
    .filter(w => w.length >= 2 && !stop.has(w));
}

async function searchVectors(queryVec, queryText, topK, apiKey) {
  try {
    const res = await db.collection('knowledge_vectors').limit(200).get();
    const kws = extractKeywords(queryText);
    const merged = {};
    res.data.forEach(doc => {
      // 真正的语义搜索：余弦相似度
      const semScore = (queryVec && doc.embedding) ? cosineSim(queryVec, doc.embedding) : 0;
      let kwScore = 0;
      const text = ((doc.title || '') + ' ' + (doc.text || '')).toLowerCase();
      kws.forEach(k => { if (text.includes(k.toLowerCase())) kwScore += 0.1; });
      // 混合分数：语义70% + 关键词30%
      const total = semScore * 0.7 + kwScore * 0.3;
      merged[doc._id] = Object.assign({}, doc, { score: total });
    });
    return Object.values(merged)
      .map(doc => {
        // 智能重排序：按来源加权
        let weight = 1.0;
        if (doc.source_collection === 'policies') weight = 1.3;      // 政策权重最高
        else if (doc.source_collection === 'rejection_cases') weight = 1.1;  // 案例次之
        else if (doc.source_collection === 'doc_templates') weight = 0.9;   // 文书略低
        // 现行政策加分
        if (doc.is_current) weight *= 1.2;
        // 红黄绿分级：红色风险优先
        if (doc.severity === 'red') weight *= 1.15;
        return Object.assign({}, doc, { score: doc.score * weight });
      })
      .sort((a, b) => b.score - a.score).slice(0, topK);
  } catch (e) {
    // 向量库为空，退回关键词检索policies表
    const fallback = await db.collection('policies').limit(50).get();
    const kws = extractKeywords(queryText);
    return fallback.data.map(p => {
      const hay = [p.title_zh, p.title_ja, p.summary, (p.keywords||[]).join(' ')].join(' ');
      let s = 0;
      kws.forEach(k => { if (hay.includes(k)) s += 0.5; });
      return Object.assign({}, p, { score: s });
    }).filter(r => r.score > 0).sort((a,b) => b.score - a.score).slice(0, topK);
  }
}

// ============ System Prompt ============
function buildSystemPrompt(mode) {
  let role = '你是一位有15年实战经验的日本移民置业资深顾问，叫"顾先生"，在跟一线顾问同行交流。';
  if (mode === 'document') role = '你是一位日本行政书士，擅长写入管申请文书。语言正式、准确、符合入管格式。';
  else if (mode === 'compliance') role = '你是一位合规审查专家，专门找材料里的问题、可能被拒的点、虚假陈述风险。要严格挑剔。';
  else if (mode === 'summary') role = '你是一位政策研究员，负责把新政策原文提炼成顾问能快速看懂的摘要。';
  else if (mode === 'compare') role = '你是一位资深移民顾问，帮客户对比两条签证路径，客观列优劣势、成本、时间、成功率。';
  else if (mode === 'jp') role = 'あなたは日本の移民・ビザ専門家です。日本語で回答してください。';
  else if (mode === 'commercial') role = '你是一位资深移民顾问兼商业分析师，帮客户做路径选择的ROI对比。要算清楚：总投入、时间成本、成功率、未来收益、风险点。'

  return role + `

【最重要的规则】
1. 回答优先基于【你读过的资料】。资料里有的直接引用；资料里没有的明确说"这个我需要查一下，不能凭空判断"，绝不编造政策条文、数字、审批结果。
2. 涉及专业判断和关键操作（能不能批、该不该申请），你只做初步分析，最后必须说"建议让行政书士或入管专家最终确认"。
3. 你是助手，不是最终决策者。
4. 问题模糊时先反问澄清：你说的是哪个客户？哪条路径？不要瞎猜。
5. 有【当前客户档案】时，回答要结合客户具体情况。
6. 回答必须分四段：【结论】【依据】【风险】【建议】。简单问题可以短，但格式要有。

记住：你是资深顾问助手，不是搜索引擎。要有温度、有判断、有经验感，但绝不能编造。`;
}

// ============ 主函数 ============
exports.main = async (event) => {
  const { question, history = [], clientId, mode } = event;
  if (!question) return { ok: false, error: '问题不能为空' };

  // 云端直存Key，环境变量可覆盖；客户端传过来的Key优先级最高
  const clientCfg = event._clientConfig || {};
  const apiKey = clientCfg.apiKey || process.env.ZHIPU_API_KEY || CONFIG.api_key;
  const baseUrl = clientCfg.apiBaseUrl || CHAT_URL.replace('/chat/completions', '');
  const model = clientCfg.model || MODEL;
  if (!apiKey) return { ok: false, error: '未配置 API Key' };

  // 1. 工具路由
  if (/算.*积分|高度人才.*分|积分计算/.test(question)) {
    return { ok: true, reply: '我帮你调积分计算器。请提供年龄、学历、年收、日语水平、职历，或直接去"积分计算器"页面填写。', tool_used: 'assess-client', confidence: '高' };
  }
  if (/材料.*还差|缺什么材料|材料清单/.test(question)) {
    return { ok: true, reply: '我帮你查材料清单。你走哪条路径？经管签/高才/永住？我按路径和阶段告诉你该准备什么。', tool_used: 'materials_checklist', confidence: '高' };
  }
  if (/影响.*客户|哪些客户.*影响/.test(question)) {
    return { ok: true, reply: '我帮你查哪些客户受影响。请告诉我是哪条政策，我去客户库里匹配。', tool_used: 'client_lookup', confidence: '中' };
  }
  if (/.*划算|.*值不值|.*ROI|.*成本对比|.*哪个好|.*选哪条|.*路径对比/.test(question)) {
    return { ok: true, reply: '我从商业角度帮你对比两条路径的投入产出。你现在对比哪两条？经管签 vs 高才？永住 vs 定住？', tool_used: 'commercial_analysis', confidence: '高' };
  }

  // 矛盾检测：客户描述有冲突自动指出
  const contradictions = detectContradictions(question, clientId);
  let contradictionWarning = '';
  if (contradictions.length > 0) {
    contradictionWarning = '⚠️ 注意到以下矛盾：\n' + contradictions.map((c, i) => `${i+1}. ${c}`).join('\n') + '\n\n';
  }

  // 2. 查询改写
  let searchQuery = question;
  const chatUrl = baseUrl + '/chat/completions';

  // 对话摘要：长对话自动压缩，避免token爆掉
  let summaryContext = '';
  if (history.length > 6) {
    try {
      const summary = await callZhipu(apiKey, [
        { role: 'system', content: '请用中文总结以下对话的关键信息（客户情况、已确认的问题、待办事项），不超过200字。' },
        { role: 'user', content: history.slice(-12).map(h => h.role + ': ' + h.content).join('\n') }
      ], chatUrl, model);
      summaryContext = '【对话摘要】' + summary + '\n\n';
    } catch (e) {}
  }
  try {
    const rewritten = await callZhipu(apiKey, [
      { role: 'system', content: '你是检索专家。把顾问的口语问题改写成3-5个日本移民专业检索关键词，用顿号隔开，只输出关键词。' },
      { role: 'user', content: question }
    ], chatUrl, model);
    searchQuery = rewritten;
  } catch (e) {}

  // 3. 真正的语义搜索：query转embedding向量
  let queryVec = null;
  try { queryVec = await getEmbedding(apiKey, question); } catch (e) {}

  const relevant = await searchVectors(queryVec, searchQuery, 5, apiKey);
  const top3 = relevant.slice(0, 3);

  // 4. 拼上下文
  const context = top3.map((r, i) =>
    `${i+1}. [${r.title_zh || r.title || '未命名'}] (${r.source_name_zh || r.source_collection || ''}) ${(r.summary || r.text || '').slice(0, 300)}`
  ).join('\n') || '未检索到直接相关资料。';

  // 5. 客户上下文
  let clientContext = '';
  if (clientId) {
    try {
      const c = await db.collection('clients').doc(clientId).get();
      if (c.data) {
        clientContext = `\n\n【当前客户档案】\n客户：${c.data.name}\n年龄：${c.data.age}\n学历：${c.data.education}\n职业：${c.data.occupation}\n年收：${c.data.income_jpy}万日元\n日语：${c.data.japanese}\n目标路径：${c.data.target_path || '未指定'}\n阶段：${c.data.stage || '未知'}\n`;
      }
    } catch (e) {}
  }

  // 6. 历史对话
  let historyContext = '';
  if (clientId) {
    try {
      const chatRes = await db.collection('chat_logs')
        .where({ client_id: clientId })
        .orderBy('created_at', 'desc')
        .limit(5).get();
      if (chatRes.data.length) {
        historyContext = '\n\n【这个客户之前讨论过的要点】\n';
        chatRes.data.reverse().forEach((log, i) => {
          historyContext += `${i+1}. ${log.question} → ${(log.answer||'').slice(0, 100)}...\n`;
        });
      }
    } catch (e) {}
  }

  // 7. 调LLM
  const historyMsgs = (history || []).filter(m => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'bot'))
    .slice(-6).map(m => ({ role: m.role === 'bot' ? 'assistant' : m.role, content: (m.content||'').slice(0, 800) }));

  const messages = [
    { role: 'system', content: buildSystemPrompt(mode) + '\n\n' + summaryContext },
    ...historyMsgs,
    { role: 'user', content: `【你读过的资料】\n${context}${clientContext}${historyContext}\n\n【顾问现在问你】\n${question}` }
  ];

  try {
    const answer = await callZhipu(apiKey, messages, chatUrl, model);

    // 可信度
    const topScore = relevant.length ? relevant[0].score : 0;
    let confidence = '低';
    if (relevant.length >= 3 && topScore > 0.5) confidence = '高（基于多条政策原文+案例）';
    else if (relevant.length >= 1 && topScore > 0.3) confidence = '中（有相关资料，建议再核实）';
    else confidence = '低（知识库无直接匹配，这是经验判断）';

    // 记录对话
    let chatId = null;
    try {
      const addRes = await db.collection('chat_logs').add({
        data: {
          question: question,
          answer: answer,
          citations: top3.map(r => r.title_zh || r.title || ''),
          client_id: clientId || null,
          confidence: confidence,
          created_at: new Date()
        }
      });
      chatId = addRes._id;
    } catch (e) {}

    // 客户档案自动提取：对话中提取关键信息，提示顾问更新
    const extracted = extractClientInfo(question);
    let extractedNote = '';
    if (Object.keys(extracted).length > 0 && clientId) {
      extractedNote = '\n\n【自动提取】对话中识别到：' + JSON.stringify(extracted) + '，建议更新客户档案。';
    }

    return {
      ok: true,
      reply: contradictionWarning + answer + extractedNote,
      confidence: confidence,
      chat_id: chatId,
      citations: top3.map(r => ({
        title: r.title_zh || r.title || '',
        source: r.source_name_zh || r.source_collection || '',
        url: r.url || '',
        relevance: r.score > 0.5 ? '高' : r.score > 0.3 ? '中' : '低'
      })),
      // 关联推荐：回答完自动推荐相关政策/案例
      related: top3.slice(0, 3).map(r => ({
        title: r.title_zh || r.title || '',
        type: r.source_collection === 'policies' ? '政策' : (r.source_collection === 'rejection_cases' ? '案例' : '文书')
      }))
    };
  } catch (e) {
    return { ok: false, error: 'AI服务暂时不可用：' + e.message };
  }
};

// 矛盾检测：客户描述有冲突自动指出
function detectContradictions(question, clientId) {
  const issues = [];

  // 规则1：说要开公司但没资本金
  if ((/開公司|経営管理|开公司/.test(question)) && (/没有钱|资金不足|资本金不够/.test(question))) {
    issues.push('说要走经管签，但提到资本金不足。2025新规需要3000万+专家确认，这是红线。');
  }

  // 规则2：说要买房但又说要快速拿签证
  if ((/买房|購入|不动产/.test(question)) && (/快速|立刻|马上.*签证/.test(question))) {
    issues.push('说要买房，但又要快速拿签证。买房不直接给签证，需要另外申请经管签或高才。');
  }

  // 规则3：年龄大但年收低，说要走高度人才
  if ((/40岁以上|45歳|年長/.test(question)) && (/年收.*300万|年收.*400万/.test(question)) && (/高度人才|高度人材/.test(question))) {
    issues.push('40岁以上+年收低于800万，高度人才积分很难到70分。建议走经管签或传统永住。');
  }

  // 规则4：说有犯罪记录但又说要申永住
  if ((/犯罪|前科|逮捕/.test(question)) && (/永住|永久居住/.test(question))) {
    issues.push('有犯罪记录还想申永住？这是红线，入管直接拒。');
  }

  // 规则5：说在日本但又说没去过
  if ((/在日|住在日本|日本居住/.test(question)) && (/没去过|第一次去|没来过日本/.test(question))) {
    issues.push('说在日本居住，但又说没去过日本？请确认实际情况。');
  }

  return issues;
}

// 客户档案自动提取：从对话中提取关键信息
function extractClientInfo(text) {
  const info = {};

  // 提取年龄
  const ageMatch = text.match(/(\d{2})岁|(\d{2})歳/);
  if (ageMatch) info.age = parseInt(ageMatch[1] || ageMatch[2]);

  // 提取年收
  const incomeMatch = text.match(/年收?(\d+)万|年収?(\d+)万/);
  if (incomeMatch) info.annual_income_jpy = parseInt(incomeMatch[1] || incomeMatch[2]) * 10000;

  // 提取日语水平
  if (/N1|n1/.test(text)) info.japanese_level = 'N1';
  else if (/N2|n2/.test(text)) info.japanese_level = 'N2';
  else if (/N3|n3/.test(text)) info.japanese_level = 'N3';

  // 提取学历
  if (/博士|PhD/.test(text)) info.education = 'phd';
  else if (/硕士|修士/.test(text)) info.education = 'master';
  else if (/本科|学士/.test(text)) info.education = 'bachelor';

  // 提取目标路径
  if (/经管签|経営管理/.test(text)) info.target_path = '经管签';
  else if (/高度人才|高度人材/.test(text)) info.target_path = '高度人才';
  else if (/永住|永久居住/.test(text)) info.target_path = '永住';

  return info;
}
