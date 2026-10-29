// 自动合规校验引擎：输入客户资料，自动跑所有规则
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const client = event.client || {};
  const warnings = [];
  const pass = [];

  // 规则1：年龄30以下+年收600万+N2 = 高度人才70分
  if (client.age <= 30 && client.annual_income_jpy >= 6000000 && client.japanese_level >= 'N2') {
    pass.push({ rule: '高度人才70分', result: '达标', score: 70 });
  } else if (client.age > 40 && client.annual_income_jpy < 8000000) {
    warnings.push({ rule: '高度人才', result: '40岁以上年收需800万+', severity: 'red' });
  }

  // 规则2：经管签资本金3000万
  if (client.path === '经管签' && client.capital_jpy < 30000000 && !client.expert_certified) {
    warnings.push({ rule: '经管签资本金', result: '2025新规需3000万+专家确认', severity: 'red' });
  } else if (client.path === '经管签' && client.capital_jpy >= 30000000) {
    pass.push({ rule: '经管签资本金', result: '达标' });
  }

  // 规则3：无犯罪记录
  if (client.criminal_record) {
    warnings.push({ rule: '无犯罪记录', result: '有犯罪记录=红线', severity: 'red' });
  } else {
    pass.push({ rule: '无犯罪记录', result: '达标' });
  }

  // 规则4：纳税证明
  if (!client.tax_certificate) {
    warnings.push({ rule: '纳税证明', result: '缺纳税证明=永住红线', severity: 'red' });
  }

  // 规则5：真实办公
  if (client.virtual_office) {
    warnings.push({ rule: '真实办公', result: 'virtual office=红线', severity: 'red' });
  }

  return {
    ok: true,
    warnings: warnings,
    pass: pass,
    summary: {
      total_rules: 5,
      pass_count: pass.length,
      warning_count: warnings.length,
      risk_level: warnings.some(w => w.severity === 'red') ? 'high' : 'medium'
    }
  };
};
