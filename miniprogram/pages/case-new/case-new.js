const storage = require('../../utils/storage.js');
Page({
  data: {
    form: { path: 'bm', client_name: '', price: '', deposit: '', expected: '' },
    // 从「客户详情」新建案件时带过来的客户 ID，保存时写入案件，便于回溯
    clientId: '',
    submitting: false
  },

  onLoad(options) {
    if (options.clientId) {
      this.setData({ clientId: options.clientId });
    }
    if (options.clientName) {
      this.setData({ 'form.client_name': options.clientName });
    }
  },

  setPath(e) { this.setData({ 'form.path': e.currentTarget.dataset.p }); },
  onClientName(e) { this.setData({ 'form.client_name': e.detail.value }); },
  onPrice(e) { this.setData({ 'form.price': e.detail.value }); },
  onDeposit(e) { this.setData({ 'form.deposit': e.detail.value }); },
  onExpected(e) { this.setData({ 'form.expected': e.detail.value }); },

  save() {
    // 防重复提交：快速双击只允许写入一次
    if (this.data.submitting) return;
    const f = this.data.form;
    if (!f.client_name) {
      wx.showToast({ title: '客户姓名必填', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });

    // 纯本地模式：保存到storage
    const cases = storage.getList('customCases');
    cases.push({
      id: 'case-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      client_id: this.data.clientId || '',
      client_name: f.client_name,
      path: f.path,
      // 新案件从「评估中」开始；不写的话案件工作台拿不到当前阶段，会直接跳到结案
      stage: 'evaluating',
      stage_idx: 1,
      price: Number(f.price),
      deposit: Number(f.deposit),
      expected: f.expected,
      created_at: new Date().toISOString()
    });
    wx.setStorageSync('customCases', cases);
    // 成功后不释放提交锁（页面即将返回）
    wx.showToast({ title: '案件已啟動', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 1500);
  }
});
