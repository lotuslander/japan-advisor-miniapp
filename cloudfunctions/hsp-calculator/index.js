// 高度人才积分计算器（HSP Points Calculator）
// 官方表：https://www.moj.go.jp/isa/content/930004016.pdf
const EDU = { bachelor: 10, master: 20, doctor: 30, mba_plus: 5, double_degree: 10 };
const CAREER = { lt3: 0, y3: 5, y5: 10, y7: 15, y10: 20, y15: 25 };
const INCOME_TABLE = [
  { min: 300, max: 400, points: 5 }, { min: 400, max: 500, points: 10 },
  { min: 500, max: 600, points: 15 }, { min: 600, max: 700, points: 20 },
  { min: 700, max: 800, points: 25 }, { min: 800, max: 900, points: 30 },
  { min: 900, max: 1000, points: 35 }, { min: 1000, max: 1500, points: 40 },
  { min: 1500, max: 99999, points: 50 }
];
const AGE = { lt30: 15, y30_34: 10, y35_39: 5, y40_44: 0, y45: 0 };
const JAPANESE = { n1: 15, n2: 10, bjt480: 10, none: 0 };
const SPECIAL = {
  jap_univ: 10,  // 日本大学毕业
  internship: 5,  // 日本实习1年
  it_co: 10,      // 中小企业
  top_univ: 10,   // 指定名校
  research: 15,    // 研究业绩
  startup: 15,    // 创业实绩
  green: 10,      // 绿色产业
  digital: 10     // 数字产业
};

function calc(form) {
  const items = [];
  let total = 0;

  // 学历
  let eduPts = EDU[form.education] || 0;
  if (form.mba_add) eduPts += EDU.mba_plus;
  if (form.double_degree) eduPts += EDU.double_degree;
  items.push({ label: '学历', points: eduPts, detail: eduDetail(form.education) });
  total += eduPts;

  // 职历
  let careerPts = CAREER[form.career] || 0;
  items.push({ label: '职历', points: careerPts, detail: careerDetail(form.career) });
  total += careerPts;

  // 年收（注意：年收加点和年龄有交叉规则，40岁以上年收要求更高）
  const incomeWan = Number(form.income_wan) || 0;
  let incomePts = 0;
  for (const t of INCOME_TABLE) {
    if (incomeWan >= t.min && incomeWan < t.max) { incomePts = t.points; break; }
  }
  // 年龄修正：40岁以上年收要求×1.25，45岁以上×1.5
  let adjustedIncome = incomeWan;
  if (form.age === 'y40_44') adjustedIncome = incomeWan / 1.25;
  if (form.age === 'y45') adjustedIncome = incomeWan / 1.5;
  let adjPts = 0;
  for (const t of INCOME_TABLE) {
    if (adjustedIncome >= t.min && adjustedIncome < t.max) { adjPts = t.points; break; }
  }
  if (adjPts < incomePts) {
    items.push({ label: '年收', points: adjPts, detail: `年收${incomeWan}万円（年龄修正后按${Math.round(adjustedIncome)}万计算）` });
    total += adjPts;
  } else {
    items.push({ label: '年收', points: incomePts, detail: `年收${incomeWan}万円` });
    total += incomePts;
  }

  // 年龄
  const agePts = AGE[form.age] || 0;
  items.push({ label: '年龄', points: agePts, detail: ageDetail(form.age) });
  total += agePts;

  // 日语
  const jpPts = JAPANESE[form.japanese] || 0;
  items.push({ label: '日语', points: jpPts, detail: jpDetail(form.japanese) });
  total += jpPts;

  // 特别加算
  const extras = [];
  if (form.jap_univ) extras.push({ label: '日本大学毕业', points: SPECIAL.jap_univ });
  if (form.internship) extras.push({ label: '日本实习1年', points: SPECIAL.internship });
  if (form.it_co) extras.push({ label: '中小企业', points: SPECIAL.it_co });
  if (form.top_univ) extras.push({ label: '指定名校', points: SPECIAL.top_univ });
  if (form.research) extras.push({ label: '研究业绩', points: SPECIAL.research });
  if (form.startup) extras.push({ label: '创业实绩', points: SPECIAL.startup });
  if (form.green) extras.push({ label: '绿色产业', points: SPECIAL.green });
  if (form.digital) extras.push({ label: '数字产业', points: SPECIAL.digital });
  for (const e of extras) {
    items.push({ label: e.label, points: e.points, detail: '特别加算' });
    total += e.points;
  }

  // 判定
  let level, advice;
  if (total >= 80) {
    level = 'J-Skip（特別高度人材）';
    advice = '🎉 80分以上！1年即可申请永住。准备J-Skip特别高度人才材料。';
  } else if (total >= 70) {
    level = '高度専門職1号ロ（70点）';
    advice = '✅ 70分！3年后可申请永住。走高度人才路径。';
  } else if (total >= 60) {
    level = '接近70分';
    advice = '⚠️ 差' + (70 - total) + '分。建议：①考N1（+15）②凑年收③加学历。';
  } else {
    level = '不够线';
    advice = '❌ 差' + (70 - total) + '分。建议：先工作几年攒职历+年收，或考虑其他路径（经管签/家族签）。';
  }

  return { total, level, advice, items };
}

function eduDetail(k) {
  return { bachelor: '学士=10点', master: '硕士=20点', doctor: '博士=30点' }[k] || '';
}
function careerDetail(k) {
  return { lt3: '不满3年=0', y3: '3年=5', y5: '5年=10', y7: '7年=15', y10: '10年=20', y15: '15年=25' }[k] || '';
}
function ageDetail(k) {
  return { lt30: '30岁以下=15', y30_34: '30-34岁=10', y35_39: '35-39岁=5', y40_44: '40-44岁=0', y45: '45岁以上=0' }[k] || '';
}
function jpDetail(k) {
  return { n1: 'N1=15', n2: 'N2或BJT480=10', none: '无=0' }[k] || '';
}

exports.main = async (event) => {
  return { ok: true, result: calc(event.form || {}) };
};
