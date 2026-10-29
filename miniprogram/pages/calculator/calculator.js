const storage = require('../../utils/storage.js');
Page({
  data: {
    totalScore: 0,
    verdict: '',
    verdictClass: '',
    form: { education: 0, experience: 0, income: '', age: '', japanese: 0, bonus: [] },
    // 同步到客户档案用
    clientList: [],
    clientNames: [],
    clientIdx: -1
  },
  onLoad() {
    this.loadClients();
    this.recalc();
  },

  /** 载入客户，供「保存到客户档案」选择 */
  loadClients() {
    const clients = storage.getList('clients');
    this.setData({
      clientList: clients.map((c, i) => ({ index: i, name: c.name || ('客户' + (i + 1)) })),
      clientNames: clients.map((c, i) => c.name || ('客户' + (i + 1))),
      clientIdx: -1
    });
  },
  onChange(e) {
    const f = e.currentTarget.dataset.field;
    this.setData({ [`form.${f}`]: Number(e.detail.value) }, () => this.recalc());
  },
  onIncome(e) { this.setData({ 'form.income': e.detail.value }, () => this.recalc()); },
  onAge(e) { this.setData({ 'form.age': e.detail.value }, () => this.recalc()); },
  onBonus(e) {
    this.setData({ 'form.bonus': e.detail.value.map(Number) }, () => this.recalc());
  },

  // 官方高度人才积分表：年收积分随年龄分档（入管厅ポイント計算表）
  incomeScore(inc, age) {
    let base;
    if (age < 30) base = 300;       // 29歳以下：300万から
    else if (age < 35) base = 400;  // 30-34歳：400万から
    else if (age < 40) base = 500;  // 35-39歳：500万から
    else base = 600;                // 40歳以上：600万から
    if (inc < base) return 0;
    // 每 100 万 +5 分
    return Math.min(Math.floor((inc - base) / 100) * 5 + 5, 50);
  },

  recalc() {
    const f = this.data.form;
    const age = Number(f.age) || 0;
    const income = Number(f.income) || 0;

    let s = (Number(f.education) || 0) + (Number(f.experience) || 0) + (Number(f.japanese) || 0);

    // 未填年龄/年收时不计分（避免空值被当成 0 岁而白送年龄分）
    if (income > 0 && age > 0) s += this.incomeScore(income, age);

    if (age > 0) {
      if (age < 30) s += 15;
      else if (age < 35) s += 10;
      else if (age < 40) s += 5;
    }

    // 加分项
    s += (Array.isArray(f.bonus) ? f.bonus : []).reduce((a, b) => a + b, 0);

    let verdict = '', verdictClass = '';
    if (income <= 0 || age <= 0) {
      verdict = '请填写年龄与年收后查看积分结果';
      verdictClass = 'below';
    } else if (s >= 80) { verdict = '80 分以上：高度专门职 1 号可申请，在留 1 年后可申请永住'; verdictClass = 'pass80'; }
    else if (s >= 70) { verdict = '70 分以上：高度专门职 1 号可申请（标准路径）'; verdictClass = 'pass70'; }
    else { verdict = '不足 70 分：暂不符合高度专门职 1 号，可评估经营管理签等其他路径'; verdictClass = 'below'; }

    this.setData({ totalScore: s, verdict, verdictClass });
  },
  // 把当前测算结果真正写入所选客户的档案（此前只弹了个 toast，什么都没存）
  saveToClient() {
    const idx = this.data.clientIdx;
    if (idx < 0) {
      wx.showToast({ title: '请先选择要同步的客户', icon: 'none' });
      return;
    }
    if (this.data.totalScore <= 0) {
      wx.showToast({ title: '请先填写年龄与年收', icon: 'none' });
      return;
    }

    const clients = storage.getList('clients');
    const client = clients[this.data.clientList[idx].index];
    if (!client) {
      wx.showToast({ title: '客户不存在，请重新选择', icon: 'none' });
      return;
    }

    const f = this.data.form;
    client.hsp = {
      score: this.data.totalScore,
      verdict: this.data.verdict,
      education: Number(f.education) || 0,
      experience: Number(f.experience) || 0,
      japanese: Number(f.japanese) || 0,
      income: Number(f.income) || 0,
      age: Number(f.age) || 0,
      bonus: (Array.isArray(f.bonus) ? f.bonus : []).slice(),
      updated_at: new Date().toISOString()
    };
    wx.setStorageSync('clients', clients);
    wx.showToast({ title: '已写入客户档案', icon: 'success' });
  },

  onPickClient(e) {
    this.setData({ clientIdx: Number(e.detail.value) });
  }
});
