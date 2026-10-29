const localData = require('../../utils/local-data.js');

Page({
  data: {
    detail: {}
  },

  onLoad(options) {
    const id = options.id || '';
    // 纯本地模式：从内置案例库找
    const caseItem = localData.cases.find(c => c.id === id);
    if (caseItem) {
      this.setData({
        detail: {
          title: caseItem.title,
          tags: [caseItem.path, caseItem.type === 'success' ? '成功' : '不许可'],
          result: caseItem.result,
          profile: { tags: caseItem.client_profile },
          challenge: caseItem.key_risk || caseItem.key_success || '暂无记录',
          solution: caseItem.lessons ? [caseItem.lessons] : [],
          disclaimer: '本案例已脱敏。个案获批不构成对任何新案件的承诺，实际结果以入管厅审查为准。'
        }
      });
    } else {
      wx.showToast({ title: '案例不存在', icon: 'none' });
    }
  },

  openSource() {
    wx.showToast({ title: '纯本地模式暂无原文链接', icon: 'none' });
  }
});
