// AI方案生成器：根据客户描述，自动生成可操作方案
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 智谱API配置（测试Key，上线前换）
const CONFIG = {
  apiKey: process.env.ZHIPU_API_KEY,
  apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  model: 'glm-4-flash'
};

exports.main = async (event) => {
  const clientDescription = event.description || '';
  const clientConfig = event._clientConfig || null;

  // 用户自配置优先
  const apiKey = (clientConfig && clientConfig.apiKey) || CONFIG.apiKey;
  const apiUrl = (clientConfig && clientConfig.apiUrl) || CONFIG.apiUrl;
  const model = (clientConfig && clientConfig.model) || CONFIG.model;

  const systemPrompt = `你是日本移民置业资深顾问。根据客户描述，输出一套可操作的方案。

输出格式（严格按JSON）：
{
  "recommended_path": "推荐路径（经管签/高度人才/永住/家族/不动产）",
  "feasibility_score": "可行性评分(0-100)",
  "feasibility_level": "可行/有条件可行/风险高",
  "key_advantages": ["优势1", "优势2"],
  "key_risks": ["风险1", "风险2"],
  "required_documents": ["材料1", "材料2", "材料3"],
  "timeline": [
    { "stage": "阶段名", "duration": "预计时长" }
  ],
  "budget_estimate": {
    "service_fee": "服务费范围",
    "government_fee": "官方费用",
    "other_costs": "其他费用"
  },
  "next_actions": ["下一步动作1", "下一步动作2"]
}`;

  try {
    const res = await cloud.callFunction({
      name: 'ai-chat',
      data: {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `客户描述：${clientDescription}\n\n请输出方案JSON。` }
        ],
        _clientConfig: clientConfig
      }
    });

    return {
      ok: true,
      plan: res.result.reply
    };
  } catch (e) {
    // 兜底：模板生成
    return {
      ok: false,
      fallback: true,
      plan: generateFallbackPlan(clientDescription)
    };
  }
};

// 兜底方案（模板生成）
function generateFallbackPlan(desc) {
  let path = '待定';
  let score = 50;
  let risks = [];
  let docs = [];

  if (desc.includes('30岁') || desc.includes('年轻')) {
    path = '高度人才70分';
    score = 75;
    docs = ['学历证明', '在职证明', '年收证明', '日语N2证书'];
    risks.push('年龄优势，但需确认年收和日语');
  } else if (desc.includes('开公司') || desc.includes('经营')) {
    path = '经管签';
    score = 65;
    docs = ['事业计划书', '资本金证明(3000万)', '办公租赁', '员工社保'];
    risks.push('2025新规需3000万+专家确认');
  } else if (desc.includes('买房') || desc.includes('房产')) {
    path = '不动产投资+签证并行';
    score = 60;
    docs = ['资金来源证明', '纳税管理人指定', '管理会社签约'];
    risks.push('买房不直接给签证');
  }

  return JSON.stringify({
    recommended_path: path,
    feasibility_score: score,
    feasibility_level: score >= 70 ? '可行' : (score >= 50 ? '有条件可行' : '风险高'),
    key_advantages: ['根据客户描述初步匹配'],
    key_risks: risks,
    required_documents: docs,
    timeline: [
      { stage: '初回相談', duration: '30分钟' },
      { stage: '资格评估', duration: '3工作日' },
      { stage: '契約', duration: '1天' },
      { stage: '材料准备', duration: '1-2个月' },
      { stage: '提交申请', duration: '1天' },
      { stage: '等待审查', duration: '2-6个月' }
    ],
    budget_estimate: {
      service_fee: '80-120万日元',
      government_fee: '在留资格认定证明 4000日元',
      other_costs: '材料翻译/行政书士 10-20万'
    },
    next_actions: ['安排初回相談', '收集客户基本资料']
  }, null, 2);
}
