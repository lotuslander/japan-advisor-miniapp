const storage = require('../../utils/storage.js');
Page({
  data: {
    filter: 'all',
    keyword: '',
    counts: { all: 0, active: 0 },
    list: [],
    loading: false,
    error: false
  },

  onShow() { this.loadClients(); },

  loadClients() {
    this.setData({ loading: true, error: false });
    // 纯本地模式：从storage读
    let clients = storage.getList('clients');

    // 搜索过滤
    if (this.data.keyword) {
      const kw = this.data.keyword.toLowerCase();
      clients = clients.filter(c =>
        (c.name && c.name.toLowerCase().includes(kw)) ||
        (c.occupation && c.occupation.toLowerCase().includes(kw))
      );
    }

    // 状态过滤
    if (this.data.filter === 'active') {
      clients = clients.filter(c => c.stage !== 'closed');
    }

    const list = clients.map(c => ({
      ...c,
      stageLabel: this.stageLabel(c.stage),
      overdue: this.isOverdue(c)
    }));

    const allClients = storage.getList('clients');
    this.setData({
      list,
      counts: {
        all: allClients.length,
        active: allClients.filter(c => c.stage !== 'closed').length
      },
      loading: false
    });
  },

  stageLabel(stage) {
    const map = { evaluating: '評価中', confirmed: '契約済', executing: '執行中', landed: '落地中', closed: '完了' };
    return map[stage] || stage || '新規';
  },

  isOverdue(c) {
    if (c.stage !== 'evaluating') return false;
    if (!c.created_at) return false;
    const created = new Date(c.created_at);
    const days = (Date.now() - created.getTime()) / 86400000;
    return days > 7;
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm() {
    this.loadClients();
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.loadClients();
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.f });
    this.loadClients();
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/client-detail/client-detail?id=' + e.currentTarget.dataset.id });
  },

  goNewLead() {
    wx.navigateTo({ url: '/pages/leads/leads' });
  },

  // 导出：复制JSON到剪贴板
  exportCsv() {
    const clients = storage.getList('clients');
    const json = JSON.stringify(clients, null, 2);
    wx.setClipboardData({
      data: json,
      success: () => wx.showToast({ title: '已复制' + clients.length + '条数据', icon: 'none' })
    });
  },

  // 导入：从文件读取JSON
  importCsv() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (fres) => {
        if (!fres.tempFiles || !fres.tempFiles.length) return;
        const fp = fres.tempFiles[0].path;
        wx.getFileSystemManager().readFile({
          filePath: fp,
          encoding: 'utf8',
          success: (dres) => this.doImport(dres.data),
          fail: () => wx.showToast({ title: '文件读取失败', icon: 'none' })
        });
      }
    });
  },

  doImport(text) {
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        wx.setStorageSync('clients', data);
        wx.showToast({ title: '导入成功' + data.length + '条', icon: 'success' });
        this.loadClients();
      } else {
        wx.showToast({ title: '文件格式不对', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '解析失败', icon: 'none' });
    }
  }
});
