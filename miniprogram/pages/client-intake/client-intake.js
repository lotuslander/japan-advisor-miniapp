const storage = require('../../utils/storage.js');
// 客户画像语音录入向导（纯本地模式）
Page({
  data: {
    recording: false,
    transcript: '',
    extracted: null,
    missing: [],
    matchScore: 0,
    matchLevel: '',
    matchSuggestion: '',
    submitting: false
  },

  onLoad() {},

  // 开始录音 - 提示用微信原生
  startRecord() {
    this.setData({ recording: true });
  },

  endRecord() {
    this.setData({ recording: false });
    if (!this.data.transcript) {
      wx.showModal({
        title: '语音输入',
        content: '请使用微信键盘的语音输入功能，说完后文字会自动填入下方输入框；也可以直接手动输入客户情况。',
        showCancel: false
      });
    }
  },

  onTranscriptInput(e) {
    this.setData({ transcript: e.detail.value });
  },

  // 提取客户信息（本地简单规则）
  extractInfo() {
    const text = this.data.transcript;
    if (!text) {
      wx.showToast({ title: '请先输入文字', icon: 'none' });
      return;
    }

    // 简单正则提取
    // 1) 姓氏可能只有 1 个字（「陈先生」）；
    // 2) 连称谓一起捕获，客户列表显示「陈先生」比只显示「陈」更好用。
    const nameMatch = text.match(/([\u4e00-\u9fa5]{1,4}(?:先生|女士|小姐))/);
    const ageMatch = text.match(/(\d{2})\s*岁/);
    const incomeMatch = text.match(/年收?(\d+)\s*万/);

    const extracted = {
      name: nameMatch ? nameMatch[1] : '',
      age: ageMatch ? Number(ageMatch[1]) : 0,
      annual_income: incomeMatch ? Number(incomeMatch[1]) * 10000 : 0,
      raw_text: text
    };

    const missing = [];
    if (!extracted.name) missing.push('姓名');
    if (!extracted.age) missing.push('年龄');
    if (!extracted.annual_income) missing.push('年收');

    // 简单匹配评分
    let score = 0;
    if (extracted.age >= 30 && extracted.age <= 45) score += 30;
    if (extracted.annual_income >= 8000000) score += 40;
    if (score >= 70) {
      this.setData({
        extracted, missing, matchScore: score,
        matchLevel: '高度匹配',
        matchSuggestion: '建议走高度人才签证路线'
      });
    } else if (score >= 40) {
      this.setData({
        extracted, missing, matchScore: score,
        matchLevel: '中等匹配',
        matchSuggestion: '建议走经营管理签证路线'
      });
    } else {
      this.setData({
        extracted, missing, matchScore: score,
        matchLevel: '需要补充信息',
        matchSuggestion: '请补充更多客户信息'
      });
    }
  },

  // 保存客户到本地
  saveClient() {
    // 防重复提交：快速双击只允许写入一次
    if (this.data.submitting) return;
    if (!this.data.extracted) {
      wx.showToast({ title: '请先提取信息', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });

    const clients = storage.getList('clients');
    clients.push({
      // Date.now() 同毫秒可能重复，追加随机后缀保证 ID 唯一
      id: 'client-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      name: this.data.extracted.name || '未命名客户',
      age: this.data.extracted.age,
      // 全项目规范字段名是 annual_income_jpy（clients 列表 / 客户详情 / CSV 导入都用它），
      // 之前这里写成 annual_income，导致新建客户后年收一直显示为空
      annual_income_jpy: this.data.extracted.annual_income || 0,
      tags: ['新客户'],
      stage: 'evaluating',
      created_at: new Date().toISOString()
    });
    wx.setStorageSync('clients', clients);
    wx.showToast({ title: '客户已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 1500);
  }
});
