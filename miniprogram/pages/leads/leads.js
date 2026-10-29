const storage = require('../../utils/storage.js');
Page({
  data: {
    sources: ['转介绍', '微信公众号', '展会', '线上广告', '老客户复购', '其他'],
    intents: ['经营管理签', '高度人才签', '永驻申请', '房产投资', '家庭移民', '暂未确定'],
    timelines: ['3 个月内', '半年内', '1 年内', '2-3 年', '观望中'],
    form: { name: '', phone: '', source: 0, intent: 0, budget_jpy: '', timeline: 0, note: '' },
    referralCode: '',
    submitting: false
  },

  onLoad(options) {
    if (options.ref) {
      this.setData({ referralCode: options.ref });
      // 自动选中"转介绍"
      this.setData({ 'form.source': 0 });
    }
  },

  onName(e) { this.setData({ 'form.name': e.detail.value }); },
  onPhone(e) { this.setData({ 'form.phone': e.detail.value }); },
  onBudget(e) { this.setData({ 'form.budget_jpy': Number(e.detail.value) }); },
  onNote(e) { this.setData({ 'form.note': e.detail.value }); },
  onSource(e) { this.setData({ 'form.source': Number(e.detail.value) }); },
  onIntent(e) { this.setData({ 'form.intent': Number(e.detail.value) }); },
  onTimeline(e) { this.setData({ 'form.timeline': Number(e.detail.value) }); },

  save() {
    // 防重复提交：快速双击只允许写入一次
    if (this.data.submitting) return;
    if (!this.data.form.name) {
      wx.showToast({ title: '姓名必填', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });

    // 纯本地模式：保存到storage
    const leads = storage.getList('leads');
    leads.push({
      id: 'lead-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      name: this.data.form.name,
      phone: this.data.form.phone,
      source: this.data.sources[this.data.form.source],
      initial_intent: this.data.intents[this.data.form.intent],
      budget_jpy: this.data.form.budget_jpy,
      timeline: this.data.timelines[this.data.form.timeline],
      note: this.data.form.note,
      referral_code: this.data.referralCode,
      created_at: new Date().toISOString()
    });
    wx.setStorageSync('leads', leads);

    // 同时创建一个客户记录
    const clients = storage.getList('clients');
    clients.push({
      // 与客户录入页共用 'client-' 前缀，加随机后缀避免同毫秒重复
      id: 'client-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      name: this.data.form.name,
      phone: this.data.form.phone,
      tags: [this.data.intents[this.data.form.intent]],
      stage: 'evaluating',
      created_at: new Date().toISOString()
    });
    wx.setStorageSync('clients', clients);

    // 成功后不释放提交锁：页面即将返回，释放反而会让同一 tick 的第二次点击写重复数据
    wx.showToast({ title: '線索を保存しました', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 1500);
  }
});
