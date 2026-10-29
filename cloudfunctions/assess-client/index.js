const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ============================================================
// 综合评估引擎：客户画像 × 现行政策 × 历史案例 → 可行性分级
// 客观性：每条检查项回链政策原文；不代顾问作审批结论
// ============================================================

function incomeScore(inc, age) {
  let base;
  if (age < 30) base = 300;       // 29歳以下：300万から
  else if (age < 35) base = 400;  // 30-34歳：400万から
  else if (age < 40) base = 500;  // 35-39歳：500万から
  else base = 600;                // 40歳以上：600万から
  if (inc < base) return 0;
  return Math.min(Math.floor((inc - base) / 100) * 5 + 5, 50);
}
// 高度人才积分（简化版，口径与 calculator 页一致：年龄/学历/职历/年收/日语/加分）
function hspScore(p) {
  const age = Number(p.age) || 0;
  let s = 0;
  // 学历
  const edu = { doctor: 30, master: 20, bachelor: 10, junior_college: 0, other: 0 };
  s += edu[p.education] !== undefined ? edu[p.education] : 0;
  // 职历
  const exp = Number(p.years_experience) || 0;
  if (exp >= 10) s += 20; else if (exp >= 7) s += 15; else if (exp >= 5) s += 10; else if (exp >= 3) s += 5;
  // 年收（官方分档：按年龄定起算线，每超 100 万 +5 分，封顶 50；口径与 calculator 页一致）
  const income = Number(p.annual_income_jpy) || 0;
  s += incomeScore(Math.round(income / 10000), age);
  // 年龄
  if (age < 30) s += 15; else if (age < 35) s += 10; else if (age < 40) s += 5;
  // 日语
  const jp = p.japanese_level || 'none';
  if (jp === 'n1') s += 15; else if (jp === 'n2') s += 10; else if (jp === 'bjt400') s += 10; else if (jp === 'n3') s += 0;
  return s;
}

function checkBusinessManager(p) {
  const checks = [];
  let passed = 0, total = 0;

  const capital = Number(p.budget_jpy) || 0;
  total++;
  if (capital >= 30000000) { passed++; checks.push({ item: '资本金 ≥ 3000 万日元', passed: true, detail: '预算 ' + Math.round(capital / 10000) + ' 万日元；法人=资本金，个人事业主=投下资金总额', source: '经营管理新规' }); }
  else { checks.push({ item: '资本金 ≥ 3000 万日元', passed: false, detail: '当前预算 ' + Math.round(capital / 10000) + ' 万日元，不足新规 3000 万门槛', source: '经营管理新规' }); }

  const jp = p.japanese_level || 'none';
  total++;
  if (['n1', 'n2', 'bjt400'].includes(jp)) { passed++; checks.push({ item: '日语 B2 相当（N2/BJT400 等）', passed: true, detail: '申请人或常勤职员任一方具备即可', source: '经营管理新规' }); }
  else { checks.push({ item: '日语 B2 相当（N2/BJT400 等）', passed: false, detail: '当前日语 ' + jp + '，未达 B2；可由常勤职员一方满足', source: '经营管理新规' }); }

  total++;
  if (p.fulltime_employee) { passed++; checks.push({ item: '常勤职员 1 名以上', passed: true, detail: '已具备/计划雇用常勤职员', source: '经营管理新规' }); }
  else { checks.push({ item: '常勤职员 1 名以上', passed: false, detail: '未确认常勤职员安排（新规硬性要求）', source: '经营管理新规' }); }

  total++;
  if (p.expert_review) { passed++; checks.push({ item: '事业计划书专家确认', passed: true, detail: '中小企业诊断士/公认会计士/税理士确认', source: '经营管理新规' }); }
  else { checks.push({ item: '事业计划书专家确认', passed: false, detail: '需提前预约专家（流程项，可安排）', source: '经营管理新规' }); }

  const exp = Number(p.years_experience) || 0;
  const eduOk = ['doctor', 'master'].includes(p.education);
  total++;
  if (exp >= 3 || eduOk) { passed++; checks.push({ item: '学历或 3 年管理经验', passed: true, detail: (eduOk ? '经营管理相关学位 ' : '管理经验 ' + exp + ' 年') + '，满足其一', source: '经营管理新规' }); }
  else { checks.push({ item: '学历或 3 年管理经验', passed: false, detail: '需经营管理相关博士/硕士/专门职学位，或 3 年以上经营管理经验', source: '经营管理新规' }); }

  total++;
  if (p.independent_office) { passed++; checks.push({ item: '事务所独立性（非自宅兼用）', passed: true, detail: '已确认独立事务所，与自宅分离', source: '经营管理新规' }); }
  else { checks.push({ item: '事务所独立性（非自宅兼用）', passed: false, detail: '2025 新规明确自宅兼事务所不认可；需独立事务所租赁', source: '经营管理新规' }); }

  total++;
  if (p.business_type) { passed++; checks.push({ item: '事业内容具体性', passed: true, detail: p.business_type, source: '审查实务' }); }
  else { checks.push({ item: '事业内容具体性', passed: false, detail: '需明确事业计划（行业/模式/营收预期），避免空壳事业', source: '审查实务' }); }

  return { passed, total, checks };
}

function checkPr(p) {
  const checks = [];
  let passed = 0, total = 0;

  const years = Number(p.residence_years) || 0;
  total++;
  if (years >= 10) { passed++; checks.push({ item: '原则在留 10 年以上', passed: true, detail: '在日 ' + years + ' 年', source: '永住指南' }); }
  else { checks.push({ item: '原则在留 10 年以上', passed: false, detail: '在日 ' + years + ' 年；若为高度人才 80 分可 1 年/70 分 3 年/特别高度人才 1 年', source: '永住指南' }); }

  total++;
  if ((Number(p.annual_income_jpy) || 0) > 0) { passed++; checks.push({ item: '独立生计能力', passed: true, detail: '年收 ' + Math.round((Number(p.annual_income_jpy) || 0) / 10000) + ' 万日元', source: '永住指南' }); }
  else { checks.push({ item: '独立生计能力', passed: false, detail: '需证明有独立生计资产或技能', source: '永住指南' }); }

  total++;
  if (p.good_conduct) { passed++; checks.push({ item: '素行要件（无重大违法/滞纳）', passed: true, detail: '无罚金刑・纳税滞纳・届出义务懈怠', source: '永住指南' }); }
  else { checks.push({ item: '素行要件（无重大违法/滞纳）', passed: false, detail: '罚金刑・再入国期限切れ・纳税滞纳均为不合格事由', source: '永住指南' }); }

  total++;
  if (p.tax_ok) { passed++; checks.push({ item: '纳税·年金·医保履行', passed: true, detail: '已确认公的義務履行', source: '永住指南' }); }
  else { checks.push({ item: '纳税·年金·医保履行', passed: false, detail: '需提供纳税证明/年金记录（常见补正项）', source: '永住指南' }); }

  return { passed, total, checks };
}

function checkRealestate(p) {
  const checks = [];
  let passed = 0, total = 0;

  total++; passed++;
  checks.push({ item: '外国人购置原则无限制', passed: true, detail: '无国籍/在留资格限制，非居住者亦可全所有权', source: '不动产原则' });

  total++; passed++;
  checks.push({ item: '外汇法报告义务（2026-04 起）', passed: true, detail: p.non_resident ? '非居住者购房 20 天内向财务省报告，违者罚最高 100 万日元' : '居住者购房无外汇法报告义务', source: '外汇法' });

  total++; passed++;
  checks.push({ item: '国籍申报与登记申报（2025-07 / 2026-10）', passed: true, detail: '一定规模土地交易申报含国籍；2026-10-05 起登记强制申报国籍', source: '国土利用计划法' });

  total++;
  if (p.fund_ok) { passed++; checks.push({ item: '资金来源合规', passed: true, detail: '已确认资金来源可追溯', source: '审查实务' }); }
  else { checks.push({ item: '资金来源合规', passed: false, detail: '需准备完税/流水等资金来源证明（银行审查重点）', source: '审查实务' }); }

  checks.push({ item: '置业不挂钩签证', passed: null, detail: '重要提示：取得不动产本身不授予签证或永住（无黄金签证），需另行申请在留资格', source: '不动产原则' });

  return { passed, total, checks };
}

// 相似案例匹配：按 path + 画像关键词
async function matchCases(path, p) {
  try {
    const res = await db.collection('cases_library')
      .where({ path, approved_for_publish: true })
      .limit(30)
      .get();
    if (!res.data.length) return [];

    // 关键词打分：年龄/学历/日语/年收/职业 与案例 profile_tags 的匹配
    const keywords = [];
    if (p.age) keywords.push(p.age + '岁');
    if (p.japanese_level && p.japanese_level !== 'none') keywords.push(p.japanese_level.toUpperCase());
    if (p.years_experience) keywords.push(p.years_experience + '年');
    if (p.business_type) keywords.push(p.business_type.slice(0, 4));

    const scored = res.data.map(c => {
      const hay = (c.profile_tags || []).join(' ');
      let hit = 0;
      for (const k of keywords) { if (k && hay.includes(k)) hit++; }
      return { c, hit };
    }).filter(x => x.hit > 0 || keywords.length === 0)
      .sort((a, b) => b.hit - a.hit)
      .slice(0, 4);

    return scored.map(x => ({
      title: x.c.title,
      result: x.c.result,
      resultLabel: x.c.result === 'approved' ? '获批' : (x.c.result === 'withdrawn' ? '撤回' : '处理中'),
      duration: x.c.duration_months || null,
      tags: (x.c.profile_tags || []).slice(0, 3)
    }));
  } catch (e) { return []; }
}

// 风险清单
function buildRisks(checks, similarCases) {
  const risks = [];
  for (const c of checks) {
    if (c.passed === false) {
      risks.push({ risk: c.item, level: 'high', advice: c.detail });
    }
  }
  for (const sc of similarCases) {
    if (sc.result === 'withdrawn') {
      risks.push({ risk: '相似案例存在撤回记录：' + sc.title, level: 'medium', advice: '重点复盘该案例失败原因' });
    }
  }
  return risks.slice(0, 6);
}

exports.main = async (event) => {
  const p = event.profile || {};
  const path = p.path || 'business_manager';
  if (!p.age && !p.budget_jpy && !p.residence_years) {
    return { ok: false, error: '请至少填写年龄与目标路径相关关键信息' };
  }

  try {
    let checks = [], passed = 0, total = 0, score = 0, recommendations = [];

    if (path === 'business_manager') {
      const r = checkBusinessManager(p);
      checks = r.checks; passed = r.passed; total = r.total;
      score = Math.round(passed / total * 100);
      recommendations = [
        '资本金与日语是 2025 新规两大硬门槛，优先解决',
        '事业计划书专家确认建议在递交前 1-2 个月预约',
        '若日语不足，确认常勤职员一方是否可满足 B2',
        '若同时置业：非居住者购房 20 天外汇法报告（2026-04 起）；经营管理签与置业双线规划'
      ];
    } else if (path === 'hsp') {
      const s = hspScore(p);
      checks = [
        { item: '积分 ≥ 70（可申请高度专门职 1 号）', passed: s >= 70, detail: '当前积分 ' + s, source: '高度人才积分制' },
        { item: '积分 ≥ 80（1 年即可申请永住）', passed: s >= 80, detail: '当前积分 ' + s, source: '高度人才 Q&A' },
        { item: '年收 ≥ 300 万日元（基准）', passed: (Number(p.annual_income_jpy) || 0) >= 3000000, detail: '年收 ' + Math.round((Number(p.annual_income_jpy) || 0) / 10000) + ' 万日元', source: '高度人才积分制' },
        { item: '更新时积分维持 70 以上', passed: null, detail: '在留期间内不要求始终维持，但更新申请时须达标', source: '高度人才积分制' }
      ];
      passed = checks.filter(c => c.passed === true).length;
      total = checks.filter(c => c.passed !== null).length;
      score = s;
      recommendations = s >= 80 ? ['80 分达标：可规划 1 年永住路径，注意双时点积分核验（申请时+1年前）']
        : (s >= 70 ? ['70 分达标：可申请 1 号，规划 3 年永住路径', '年收与职历证明是常见补正点']
        : ['未达 70 分：考虑补强年收/职历/日语加分，或转经营管理路径']);
    } else if (path === 'pr') {
      const r = checkPr(p);
      checks = r.checks; passed = r.passed; total = r.total;
      score = Math.round(passed / total * 100);
      recommendations = [
        '纳税/年金记录是永住审查最常补正项，提前取得纳税证明书',
        '素行（罚金刑/届出义务）需逐项确认',
        '高度人才路径可大幅缩短在留期间要求',
        '2027-04 起在留 3 年特例废止；2026 国益要件新增日语 B1 考虑，建议提前准备 N2 以上'
      ];
    } else if (path === 'realestate') {
      const r = checkRealestate(p);
      checks = r.checks; passed = r.passed; total = r.total;
      score = Math.round(passed / total * 100);
      recommendations = [
        '非居住者购房注意外汇法 20 天报告义务（2026-04 起）',
        '置业与签证双线规划：房产不挂钩签证',
        '资金来源证明是银行与登记实务的共同重点'
      ];
    } else {
      return { ok: false, error: '未知路径：' + path };
    }

    const similarCases = await matchCases(path, p);
    const risks = buildRisks(checks, similarCases);

    let feasibility = 'high';
    if (score >= 80) feasibility = 'high';
    else if (score >= 60) feasibility = 'medium';
    else if (score >= 40) feasibility = 'low';
    else feasibility = 'not_recommended';

    // 政策依据链：路径对应现行政策原文
    const policiesRes = await db.collection('policies')
      .where({ category: path, status: 'effective' })
      .limit(3)
      .get();

    return {
      ok: true,
      result: {
        path,
        feasibility,
        score,
        passed,
        total,
        checks,
        similarCases,
        risks,
        recommendations,
        sources: policiesRes.data.map(p => ({
          title: p.title_zh || p.title_ja,
          url: p.url,
          date: p.published_at || p.effective_at || ''
        })),
        disclaimer: '本评估基于现行政策与历史案例规则推演，仅供顾问研判参考，不构成审批承诺。'
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
