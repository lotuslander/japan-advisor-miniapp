// 知识库管理（纯本地模式）
const localData = require('../../utils/local-data.js');
const storage = require('../../utils/storage.js');

Page({
  data: {
    // 添加自定义政策
    showAddPolicy: false,
    newPolicyTitle: '',
    newPolicySummary: '',
    newPolicySource: '',
    customPolicies: [],
    customCases: [],
    // 内置数据展开
    builtinPolicies: [],
    builtinCases: [],
    builtinAreas: [],
    expandedPolicyId: null,
    expandedCaseId: null,
    submitting: false
  },

  onShow() {
    this.loadCustomPolicies();
    this.loadCustomCases();
    this.loadBuiltinData();
  },

  onLoad(options) {
    // 支持从AI政策更新自动跳转过来，自动填充
    if (options.autoFill === '1' && options.content) {
      const content = decodeURIComponent(options.content);
      this.setData({
        showAddPolicy: true,
        newPolicySummary: content,
        newPolicyTitle: '【AI更新】' + new Date().toLocaleDateString() + ' 政策动态'
      });
      wx.showToast({ title: '已自动填充，点保存即可', icon: 'success' });
    }
  },

  loadCustomPolicies() {
    const custom = storage.getList('customPolicies');
    this.setData({ customPolicies: custom });
  },

  loadCustomCases() {
    // AI 更新的案例存在 aiCases；customCases 是用户自建案件（结构不同，不可混读）
    const custom = storage.getList('aiCases');
    this.setData({ customCases: custom });
  },

  loadBuiltinData() {
    this.setData({
      builtinPolicies: localData.policies,
      builtinCases: localData.cases,
      builtinAreas: (localData.coreAreas || []).concat(localData.moreCoreAreas || [])
    });
  },

  toggleCaseDetail(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      expandedCaseId: this.data.expandedCaseId === id ? null : id
    });
  },

  togglePolicyDetail(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      expandedPolicyId: this.data.expandedPolicyId === id ? null : id
    });
  },  // 显示添加政策表单
  showAddPolicyForm() {
    // 打开新表单 → 解除上一次保存的提交锁
    this.setData({ showAddPolicy: true, submitting: false });
  },

  onPolicyTitleInput(e) { this.setData({ newPolicyTitle: e.detail.value }); },
  onPolicySummaryInput(e) { this.setData({ newPolicySummary: e.detail.value }); },
  onPolicySourceInput(e) { this.setData({ newPolicySource: e.detail.value }); },

  // 保存自定义政策
  saveCustomPolicy() {
    // 防重复提交：快速双击只允许写入一次
    if (this.data.submitting) return;
    if (!this.data.newPolicyTitle || !this.data.newPolicySummary) {
      wx.showToast({ title: '请填标题和内容', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });

    const custom = storage.getList('customPolicies');
    custom.push({
      id: 'custom-policy-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      title_zh: this.data.newPolicyTitle,
      summary: this.data.newPolicySummary,
      source: this.data.newPolicySource || '用户自定义',
      date: new Date().toISOString().slice(0, 10),
      is_current: true,
      direction: 'info',
      directionLabel: '自定义'
    });

    wx.setStorageSync('customPolicies', custom);
    this.setData({
      showAddPolicy: false,
      newPolicyTitle: '',
      newPolicySummary: '',
      newPolicySource: '',
      customPolicies: custom,
      // 成功不释放提交锁；下次打开表单时再解锁
      submitting: true
    });
    wx.showToast({ title: '政策已保存', icon: 'success' });
  },

  // 删除自定义政策
  deleteCustomPolicy(e) {
    const id = e.currentTarget.dataset.id;
    const custom = (storage.getList('customPolicies')).filter(p => p.id !== id);
    wx.setStorageSync('customPolicies', custom);
    this.setData({ customPolicies: custom });
    wx.showToast({ title: '已删除', icon: 'success' });
  }
});
