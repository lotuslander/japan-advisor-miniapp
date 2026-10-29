// 个案评估：客户画像 × 政策 × 案例 → 可行性分级
Page({
  data: {
    path: 'business_manager',
    paths: [
      { key: 'business_manager', label: '経営管理' },
      { key: 'hsp', label: '高度人材' },
      { key: 'pr', label: '永住' },
      { key: 'realestate', label: '不動産' }
    ],
    checkResult: null,
    form: {
      age: '',
      education: '',
      japanese_level: '',
      annual_income_jpy: '',
      years_experience: '',
      budget_jpy: '',
      business_type: '',
      residence_years: '',
      fulltime_employee: false,
      expert_review: false,
      tax_ok: false,
      non_resident: true,
      fund_ok: true
    },
    result: null,
    submitting: false,
    error: false,
    // HSP积分计算器
    eduOptions: [{label:'博士',value:'doctor'},{label:'硕士',value:'master'},{label:'本科',value:'bachelor'}],
    careerOptions: [{label:'不满3年',value:'lt3'},{label:'3年',value:'y3'},{label:'5年',value:'y5'},{label:'7年',value:'y7'},{label:'10年',value:'y10'},{label:'15年以上',value:'y15'}],
    ageOptions: [{label:'30岁以下',value:'lt30'},{label:'30-34岁',value:'y30_34'},{label:'35-39岁',value:'y35_39'},{label:'40-44岁',value:'y40_44'},{label:'45岁以上',value:'y45'}],
    jpOptions: [{label:'N1',value:'n1'},{label:'N2/BJT480',value:'n2'},{label:'无',value:'none'}],
    hsp: { income_wan: '' },
    hspResult: null,
    re: { price_wan: '', down_pct: 30, interest_rate: 2, rent_wan: '', mgmt_wan: 20, tax_wan: 10 },
    reResult: null,
    timeline: null
  },

  pickEdu(e) { const o = this.data.eduOptions[e.detail.value]; this.setData({ 'hsp.edu': o.value, 'hsp.eduLabel': o.label }); },
  pickCareer(e) { const o = this.data.careerOptions[e.detail.value]; this.setData({ 'hsp.career': o.value, 'hsp.careerLabel': o.label }); },
  pickAge(e) { const o = this.data.ageOptions[e.detail.value]; this.setData({ 'hsp.age': o.value, 'hsp.ageLabel': o.label }); },
  pickJp(e) { const o = this.data.jpOptions[e.detail.value]; this.setData({ 'hsp.jp': o.value, 'hsp.jpLabel': o.label }); },
  onHspInput(e) { this.setData({ [`hsp.${e.currentTarget.dataset.k}`]: e.detail.value }); },

  runHspCalc() {
    const h = this.data.hsp;
    if (!h.edu || !h.career || !h.age || !h.jp || !h.income_wan) {
      wx.showToast({ title: '请完整填写', icon: 'none' });
      return;
    }
    // 纯本地模式：本地计算HSP积分
    const eduMap = { doctor: 30, master: 20, bachelor: 10 };
    const careerMap = { lt3: 0, y3: 5, y5: 10, y7: 15, y10: 20, y15: 25 };
    const ageMap = { lt30: 15, y30_34: 10, y35_39: 5, y40_44: 0, y45: 0 };
    const jpMap = { n1: 15, n2: 10, none: 0 };
    const income = Number(h.income_wan);
    let incomeScore = 0;
    if (income >= 1000) incomeScore = 40;
    else if (income >= 700) incomeScore = 30;
    else if (income >= 500) incomeScore = 20;
    else incomeScore = 10;

    const total = (eduMap[h.edu] || 0) + (careerMap[h.career] || 0) +
                  (ageMap[h.age] || 0) + (jpMap[h.jp] || 0) + incomeScore;

    this.setData({
      hspResult: {
        total_score: total,
        pass_70: total >= 70,
        pass_80: total >= 80,
        breakdown: {
          education: eduMap[h.edu] || 0,
          career: careerMap[h.career] || 0,
          age: ageMap[h.age] || 0,
          japanese: jpMap[h.jp] || 0,
          income: incomeScore
        }
      }
    });
  },

  onReInput(e) { this.setData({ [`re.${e.currentTarget.dataset.k}`]: e.detail.value }); },

  async runReCalc() {
    const r = this.data.re;
    if (!r.price_wan || !r.rent_wan) {
      wx.showToast({ title: '请填房价和租金', icon: 'none' });
      return;
    }
    // 纯本地模式：本地简单计算
    const price = Number(r.price_wan) * 10000;
    const rent = Number(r.rent_wan) * 10000;
    const down = price * (r.down_pct || 30) / 100;
    const loan = price - down;
    const monthlyRent = rent;
    const monthlyMortgage = loan * (r.interest_rate || 2) / 100 / 12;
    const monthlyExpense = monthlyMortgage + (Number(r.mgmt_wan) || 20) * 10000 / 12 + (Number(r.tax_wan) || 10) * 10000 / 12;
    const monthlyProfit = monthlyRent - monthlyExpense;
    const annualYield = (rent * 12 / price * 100).toFixed(2);

    this.setData({
      reResult: {
        gross_yield: annualYield + '%',
        monthly_rent: '¥' + monthlyRent.toLocaleString(),
        monthly_mortgage: '¥' + monthlyMortgage.toLocaleString(),
        monthly_profit: '¥' + monthlyProfit.toLocaleString(),
        down_payment: '¥' + down.toLocaleString()
      }
    });
  },

  loadTimeline(path) {
    // 纯本地模式：内置时间线
    const timelines = {
      business_manager: ['准备材料1个月', '申请在留资格认定2-3个月', '申请签证1周', '总共约4-6个月'],
      hsp: ['准备材料2周', '申请在留资格认定1-2个月', '申请签证1周', '总共约2-3个月'],
      pr: ['准备材料1个月', '提交申请4-6个月', '总共约5-7个月']
    };
    this.setData({ timeline: timelines[path] || [] });
  },

  onLoad(options) {
    if (options.path) this.setData({ path: options.path });
    if (options.name) this.setData({ 'form.name': decodeURIComponent(options.name) });
    if (options.income) this.setData({ 'form.annual_income_jpy': options.income });
    this.loadTimeline(this.data.path);
  },

  autoCheck() {
    // 纯本地模式：本地简单合规检查
    const f = this.data.form;
    const checks = [];
    if (!f.fund_ok) checks.push({ level: 'red', msg: '资金来源不明确，风险高' });
    if (!f.tax_ok) checks.push({ level: 'yellow', msg: '纳税记录可能有问题' });
    if (f.fulltime_employee) checks.push({ level: 'green', msg: '有常勤员工' });
    if (checks.length === 0) checks.push({ level: 'green', msg: '基础合规检查通过' });
    this.setData({ checkResult: { checks: checks } });
    wx.showToast({ title: '自检完成', icon: 'success' });
  },

  setPath(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ path: key, result: null, timeline: null });
    this.loadTimeline(key);
  },

  onInput(e) {
    const key = e.currentTarget.dataset.k;
    this.setData({ ['form.' + key]: e.detail.value });
  },

  onSwitch(e) {
    const key = e.currentTarget.dataset.k;
    this.setData({ ['form.' + key]: e.detail.value });
  },

  onRadio(e) {
    const key = e.currentTarget.dataset.k;
    this.setData({ ['form.' + key]: e.detail.value });
  },

  runAssess() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    // 纯本地模式：本地简单规则评估
    const f = this.data.form;
    const path = this.data.path;
    let score = 0;
    const risks = [];
    const advantages = [];

    // 经营管理签评估
    if (path === 'business_manager') {
      const capital = Number(f.budget_jpy || 0) / 10000;
      if (capital >= 500) { score += 30; advantages.push('资本金满足500万日元要求'); }
      else { risks.push('资本金不足500万日元'); }
      if (f.fulltime_employee) { score += 20; advantages.push('有常勤员工'); }
      else { risks.push('无常勤员工'); }
      if (f.expert_review) { score += 15; advantages.push('有专家确认事业计划'); }
      else { risks.push('无专家确认'); }
    }

    // 高度人才评估
    if (path === 'hsp') {
      if (Number(f.annual_income_jpy) >= 8000000) { score += 30; advantages.push('年收800万以上'); }
      else { risks.push('年收不足800万'); }
      if (f.japanese_level === 'n1') { score += 20; advantages.push('日语N1'); }
      else if (f.japanese_level === 'n2') { score += 15; advantages.push('日语N2'); }
      else { risks.push('日语能力不足'); }
    }

    // 永住评估
    if (path === 'pr') {
      const years = Number(f.residence_years || 0);
      if (years >= 10) { score += 40; advantages.push('居住10年以上'); }
      else { risks.push('居住不足10年'); }
      if (f.tax_ok) { score += 20; advantages.push('纳税记录完整'); }
      else { risks.push('纳税记录有问题'); }
    }

    // 最优路径推荐
    const recommendations = [];
    const income = Number(f.annual_income_jpy || 0);
    const budget = Number(f.budget_jpy || 0);
    const years = Number(f.residence_years || 0);
    
    if (income >= 20000000) {
      recommendations.push('J-Skip特别高度人才：年收2000万以上可1年申请永住，最快路径');
    } else if (income >= 8000000 && f.japanese_level !== 'none') {
      recommendations.push('高度人才签证：年收800万以上+日语N2/N1，积分70以上3年永住，80以上1年永住');
    }
    if (budget >= 30000000 && f.fulltime_employee) {
      recommendations.push('经营管理签：资本金3000万+有常勤员工+真实事业，适合想在日本创业的客户');
    }
    if (years >= 10 && f.tax_ok) {
      recommendations.push('永住申请：居住10年以上+纳税完整，最稳定的路径');
    }
    if (recommendations.length === 0) {
      recommendations.push('建议先留学或工作签证在日本积累经验，再转其他路径');
    }

    this.setData({
      result: {
        score: score,
        level: score >= 70 ? '高可行性' : (score >= 40 ? '中可行性' : '低可行性'),
        risks: risks,
        advantages: advantages,
        recommendations: recommendations,
        suggestion: '纯本地模式评估结果仅供参考，实际请以入管厅审查为准。'
      },
      submitting: false
    });
  },

  reset() {
    this.setData({ result: null });
  },

  feLabel(f) {
    const map = { high: '可行性高', medium: '可行性中', low: '可行性低', not_recommended: '不建议当前推进' };
    return map[f] || f;
  },

  copySource(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '链接已复制', icon: 'none' }) });
    }
  }
});

