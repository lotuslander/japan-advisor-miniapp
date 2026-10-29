const storage = require('../../utils/storage.js');
// AI方案生成器（纯本地模式，直接调大模型API）
Page({
  data: {
    description: '',
    plan: null
  },

  onDescInput(e) {
    this.setData({ description: e.detail.value });
  },

  async generatePlan() {
    if (!this.data.description.trim()) {
      wx.showToast({ title: '请先描述客户情况', icon: 'none' });
      return;
    }
    wx.showLoading({ title: 'AI生成方案中...' });

    // 从本地storage读API配置；未配置时引导去配置，不用占位 Key 发请求
    const config = storage.getMap('llmConfig');
    if (!config.apiKey) {
      wx.hideLoading();
      wx.showModal({
        title: '需要先配置大模型',
        content: 'AI 方案生成需要使用你自己的大模型 API Key，请先在「API 配置」中填写。',
        confirmText: '去配置',
        cancelText: '取消',
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: '/pages/api-config/api-config' });
        }
      });
      return;
    }
    if (!config.apiBaseUrl) config.apiBaseUrl = 'https://open.bigmodel.cn/api/paas/v4';
    if (!config.model) config.model = 'glm-4-flash';

    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: config.apiBaseUrl + '/chat/completions',
          method: 'POST',
          header: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + config.apiKey
          },
          data: {
            model: config.model,
            messages: [
              { role: 'system', content: '你是日本移民置业顾问，根据客户描述生成申请方案，包括推荐路径、所需材料、时间线、费用估算。用中文回答，结构清晰。' },
              { role: 'user', content: this.data.description }
            ],
            temperature: 0.7
          },
          success: resolve,
          fail: reject
        });
      });

      wx.hideLoading();
      if (res.data && res.data.choices && res.data.choices[0]) {
        this.setData({
          plan: {
            raw: res.data.choices[0].message.content
          }
        });
        wx.showToast({ title: '方案已生成', icon: 'success' });
      } else {
        wx.showToast({ title: '生成失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络异常', icon: 'none' });
    }
  }
});
