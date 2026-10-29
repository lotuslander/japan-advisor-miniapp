// 费用报价计算器：官方费用 + 行政书士报酬市场区间 + 诸费用
Page({
  data: {
    path: 'business_manager',
    paths: [
      { key: 'business_manager', label: '経営管理' },
      { key: 'hsp', label: '高度人材' },
      { key: 'pr', label: '永住' },
      { key: 'realestate', label: '不動産取得' }
    ],
    form: {
      capital_wan: ''   // 万日元
    },
    rows: [],
    totalLow: 0,
    totalHigh: 0
  },

  onLoad() { this.calc(); },

  setPath(e) {
    this.setData({ path: e.currentTarget.dataset.key });
    this.calc();
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value });
    this.calc();
  },

  calc() {
    const cap = Number(this.data.form.capital_wan) || 0;
    const rows = [];
    let low = 0, high = 0;
    const add = (item, l, h, note) => {
      rows.push({ item, low: l.toLocaleString(), high: h.toLocaleString(), note });
      low += l; high += h;
    };

    if (this.data.path === 'business_manager') {
      // 公司设立登录免许税 = 资本金 × 0.7%，最低 6 万
      const reg = Math.max(cap * 10000 * 0.007, 60000);
      add('公司设立登录免许税', reg, reg, '资本金×0.7%（最低6万日元）');
      add('株式会社设立诸费用', 200000, 280000, '定款认证/登记/印章/印纸');
      add('在留资格认定（COE）申请', 0, 0, '入管厅无申请费');
      add('签证取得（在外公馆）印纸', 3000, 4000, '大使馆/总领事馆手续费');
      add('行政书士报酬（初次申请）', 1500000, 2500000, '事业计划书+申请书类制作+提交代理');
      add('首年事务所租金（参考）', 1200000, 2400000, '东京/大阪小型事务所 1-2 万日元/月起，另计押金礼金');
    } else if (this.data.path === 'hsp') {
      add('在留资格变更/更新印纸', 4000, 4000, '入管厅収入印紙');
      add('行政书士报酬（高度专门职）', 800000, 1500000, '积分计算+材料整合+申请代理');
      add('学历/职历证明翻译认证', 50000, 150000, '如非日/英文需翻译认证');
    } else if (this.data.path === 'pr') {
      add('永住许可申请印纸', 8000, 8000, '入管厅収入印紙');
      add('住民税/课税/纳税证明取得', 300, 600, '各市町村发行手数料');
      add('行政书士报酬（永住申请）', 1000000, 2000000, '理由书+纳税/年金材料整合');
    } else if (this.data.path === 'realestate') {
      const price = cap * 10000; // 万→日元
      add('不动产中介手数料', Math.round(price * 0.03 + 60000), Math.round(price * 0.03 + 60000), '（3%+6万日元）×消费税');
      add('登录免许税（所有权移转）', Math.round(price * 0.2), Math.round(price * 2.0), '评价额×0.2-2.0%（住宅减免后约0.3%）');
      add('不动产取得税', Math.round(price * 0.1), Math.round(price * 3), '评价额×3-4%（住宅减免后）');
      add('印花税（买卖契约）', 10000, 60000, '按合同金额分档');
      add('行政书士/司法书士报酬', 100000, 300000, '登记申请代理');
    }

    this.setData({ rows, totalLow: low, totalHigh: high });
  },

  copyQuote() {
    const pathLabel = { business_manager: '经营管理签', hsp: '高度人才', pr: '永住', realestate: '不动产取得' }[this.data.path];
    let text = pathLabel + ' 报价单（万日元）' + '\n';
    for (const r of this.data.rows) {
      text += r.label + '：' + r.low + ' - ' + r.high + '\n';
    }
    text += '合计：' + this.data.totalLow + ' - ' + this.data.totalHigh;
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '报价单已复制', icon: 'none' }) });
  }
});
