const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 个案评估规则引擎：输入客户数据，输出每条签证路径的红黄绿
// c = {
//   path: 'business_manager' | 'hsp' | 'pr' | 'work' | 'family' | 'tokutei' | 'kika',
//   age, education, work_years, income_jpy_wan, japanese_level,
//   capital_jpy_wan, office_type, regular_staff_count, fund_stayed_months, plan_stamped,
//   hsp_points, reside_years, tax_overdue, crime_history, material_authentic, period_valid,
//   sponsor_income_jpy_wan, major_relevant, invest_only_understanding
// }

function checkBusinessManager(c) {
  const checks = [];
  checks.push({
    id: 'CAPITAL', label: '资本金≥3000万円',
    pass: (c.capital_jpy_wan || 0) >= 3000,
    severity: 'red',
    detail: c.capital_jpy_wan ? '当前：' + c.capital_jpy_wan + '万円' : '未填'
  });
  checks.push({
    id: 'OFFICE', label: '独立事务所（非自宅）',
    pass: c.office_type === 'independent',
    severity: 'red',
    detail: c.office_type === 'independent' ? '已确认独立事务所' : '当前：' + (c.office_type || '未填')
  });
  checks.push({
    id: 'STAFF', label: '常勤职员≥1名（真雇佣）',
    pass: (c.regular_staff_count || 0) >= 1,
    severity: 'red',
    detail: c.regular_staff_count ? '当前：' + c.regular_staff_count + '名' : '未填'
  });
  checks.push({
    id: 'FUND', label: '资本金已停留≥3个月',
    pass: (c.fund_stayed_months || 0) >= 3,
    severity: 'red',
    detail: c.fund_stayed_months ? '已停留：' + c.fund_stayed_months + '月' : '未填'
  });
  checks.push({
    id: 'PLAN', label: '事业计划书有专家盖章',
    pass: c.plan_stamped === true,
    severity: 'yellow',
    detail: c.plan_stamped ? '已盖章' : '未盖章（2025新规要求）'
  });
  checks.push({
    id: 'FRAUD', label: '材料全部真实',
    pass: c.material_authentic === true,
    severity: 'red',
    detail: c.material_authentic ? '已确认' : '需顾问签字确认'
  });
  return checks;
}

function checkHsp(c) {
  const checks = [];
  checks.push({
    id: 'POINTS70', label: '积分≥70',
    pass: (c.hsp_points || 0) >= 70,
    severity: 'red',
    detail: '当前积分：' + (c.hsp_points || '未算')
  });
  checks.push({
    id: 'POINTS80', label: '积分≥80（1年永住）',
    pass: (c.hsp_points || 0) >= 80,
    severity: 'yellow',
    detail: (c.hsp_points || 0) >= 80 ? '已达标，1年可申永住' : '差' + (80 - (c.hsp_points || 0)) + '分到80'
  });
  checks.push({
    id: 'AGE', label: '年龄<40岁（加点项）',
    pass: (c.age || 99) < 40,
    severity: 'yellow',
    detail: c.age ? '当前：' + c.age + '岁' : '未填'
  });
  checks.push({
    id: 'JAPANESE', label: '日语N2以上',
    pass: ['N1', 'N2'].includes(c.japanese_level),
    severity: 'yellow',
    detail: '当前：' + (c.japanese_level || '未填')
  });
  return checks;
}

function checkPr(c) {
  const checks = [];
  checks.push({
    id: 'RESIDE', label: '在日≥10年（就劳5年）',
    pass: (c.reside_years || 0) >= 10,
    severity: 'red',
    detail: '当前：' + (c.reside_years || '未填') + '年'
  });
  checks.push({
    id: 'TAX', label: '无税务滞纳',
    pass: c.tax_overdue === false,
    severity: 'red',
    detail: c.tax_overdue === false ? '已完纳' : '有滞纳，须先缴清'
  });
  checks.push({
    id: 'CRIME', label: '无犯罪记录',
    pass: c.crime_history === false,
    severity: 'red',
    detail: c.crime_history === false ? '无犯罪' : '有犯罪记录，不许可'
  });
  checks.push({
    id: 'INCOME', label: '年收≥300万円（独立生計）',
    pass: (c.income_jpy_wan || 0) >= 300,
    severity: 'yellow',
    detail: '当前：' + (c.income_jpy_wan || '未填') + '万円'
  });
  return checks;
}

function checkRealEstate(c) {
  const checks = [];
  checks.push({
    id: 'FUND', label: '购房资金全部可追溯',
    pass: c.fund_traceable === true,
    severity: 'red',
    detail: c.fund_traceable ? '已提供银行流水/购汇凭证' : '资金来源不明=反洗钱风险'
  });
  checks.push({
    id: 'TAX_MGR', label: '已指定日本纳税管理人（非居民）',
    pass: c.tax_manager === true || c.is_resident === true,
    severity: 'yellow',
    detail: c.is_resident ? '日本居住者，无需指定' : '非居民须指定纳税管理人'
  });
  checks.push({
    id: 'INHERIT', label: '已测算继承税影响',
    pass: c.inheritance_calc === true,
    severity: 'yellow',
    detail: c.inheritance_calc ? '已测算' : '日本继承税最高55%，建议提前规划'
  });
  checks.push({
    id: 'INVEST_UNDERSTAND', label: '客户理解"买房≠签证"',
    pass: c.invest_only_understanding === true,
    severity: 'red',
    detail: c.invest_only_understanding ? '已确认' : '客户误以为买房直接给签证=错误预期'
  });
  return checks;
}

function checkFamily(c) {
  const checks = [];
  checks.push({
    id: 'SPONSOR_INCOME', label: '扶养者年收≥300万円',
    pass: (c.sponsor_income_jpy_wan || 0) >= 300,
    severity: 'red',
    detail: '当前：' + (c.sponsor_income_jpy_wan || '未填') + '万円'
  });
  checks.push({
    id: 'SPONSOR_STATUS', label: '扶养者在留资格稳定（正社员/经管签）',
    pass: ['正社員', '経営管理', '高度専門職', '永住者'].includes(c.sponsor_status),
    severity: 'red',
    detail: '当前：' + (c.sponsor_status || '未填')
  });
  checks.push({
    id: 'MARRIAGE_REAL', label: '婚姻真实（非假结婚）',
    pass: c.marriage_real === true,
    severity: 'red',
    detail: c.marriage_real ? '已确认' : '入管会电话核实，假结婚=不许可+离婚后驱逐'
  });
  return checks;
}

function summarize(checks) {
  const red = checks.filter(c => !c.pass && c.severity === 'red').length;
  const yellow = checks.filter(c => !c.pass && c.severity === 'yellow').length;
  const green = checks.filter(c => c.pass).length;
  let verdict = '通过';
  if (red > 0) verdict = '不建议申请（有红线问题）';
  else if (yellow > 0) verdict = '可申请（有注意事项）';
  return { red, yellow, green, verdict };
}

exports.main = async (event) => {
  const c = event.client || {};
  const path = c.path || 'business_manager';
  let checks = [];
  if (path === 'business_manager') checks = checkBusinessManager(c);
  else if (path === 'hsp') checks = checkHsp(c);
  else if (path === 'pr') checks = checkPr(c);
  else if (path === 'realestate') checks = checkRealEstate(c);
  else if (path === 'family') checks = checkFamily(c);
  else checks = [{ id: 'TODO', label: '该路径规则待补', pass: false, severity: 'yellow', detail: '规则引擎开发中' }];

  const result = summarize(checks);
  return {
    ok: true,
    path,
    checks,
    summary: result,
    advice: result.red > 0
      ? '存在红线问题，必须先解决：' + checks.filter(x => !x.pass && x.severity === 'red').map(x => x.label).join('、')
      : (result.yellow > 0 ? '基本可申请，注意：' + checks.filter(x => !x.pass && x.severity === 'yellow').map(x => x.label).join('、') : '材料齐全，可直接递交')
  };
};
