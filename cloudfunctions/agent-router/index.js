const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// Agent路由器：根据问题意图，决定调用哪个云函数
const TOOLS = {
  'assess-client': '客户资格积分评估',
  'smart-alerts': '查询客户预警',
  'generate-script': '生成跟进话术',
  'rag-fact-check': 'RAG事实校验',
  'get-policies-snapshot': '调取政策原文',
  'get-case-library': '检索相似案例'
};

function matchTool(question) {
  if (/积分|打分|评分|高才.*分/.test(question)) return 'assess-client';
  if (/预警|提醒|跟进|提醒我/.test(question)) return 'smart-alerts';
  if (/话术|邮件|微信.*说|怎么跟客户说/.test(question)) return 'generate-script';
  if (/事实|校验|核对|真的吗|准确吗/.test(question)) return 'rag-fact-check';
  if (/政策.*原文|法条|规定/.test(question)) return 'get-policies-snapshot';
  if (/相似案例|类似.*案例|之前.*案例/.test(question)) return 'get-case-library';
  return null;
}

exports.main = async (event) => {
  const { question, clientId } = event;
  if (!question) return { ok: false, error: 'question 必填' };

  const tool = matchTool(question);
  if (!tool) return { ok: true, tool_used: null, message: '无需调用工具，直接回答' };

  return {
    ok: true,
    tool_used: tool,
    tool_desc: TOOLS[tool],
    message: '需要调用工具：' + TOOLS[tool],
    client_id: clientId || null
  };
};
