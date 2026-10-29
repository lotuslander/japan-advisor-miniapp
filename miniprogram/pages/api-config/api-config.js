const storage = require('../../utils/storage.js');
// LLM 配置页：让顾问自己填 API Key，支持13家大模型（8国内+5国外）
const PROVIDERS = [
  // ===== 国内大模型 =====
  { name: '智谱清言（智谱AI）', tag: '有免费额度', color: '#C62828', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: 'glm-4-flash / glm-4', price: 'glm-4-flash 免费', url: 'https://open.bigmodel.cn', defaultModel: 'glm-4-flash' },
  { name: 'DeepSeek', tag: '最便宜', color: '#6A1B9A', baseUrl: 'https://api.deepseek.com', models: 'deepseek-chat', price: '输入0.0001元/千token', url: 'https://platform.deepseek.com', defaultModel: 'deepseek-chat' },
  { name: '通义千问（阿里云）', tag: '稳定', color: '#1565C0', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: 'qwen-turbo / qwen-plus', price: '输入0.0003元/千token', url: 'https://dashscope.aliyun.com', defaultModel: 'qwen-turbo' },
  { name: '豆包（火山引擎）', tag: '推荐', color: '#2E7D32', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: 'doubao-pro-4k', price: '输入0.0008元/千token', url: 'https://www.volcengine.com/product/doubao', defaultModel: 'doubao-pro-4k' },
  { name: 'Kimi（月之暗面）', tag: '长文本', color: '#7B1FA2', baseUrl: 'https://api.moonshot.cn/v1', models: 'moonshot-v1-8k', price: '输入0.012元/千token', url: 'https://platform.moonshot.cn', defaultModel: 'moonshot-v1-8k' },
  { name: '文心一言（百度）', tag: '大厂', color: '#E65100', baseUrl: 'https://qianfan.baidubce.com/v2', models: 'ernie-speed', price: '输入0.0008元/千token', url: 'https://cloud.baidu.com/product/wenxinworkshop', defaultModel: 'ernie-speed' },
  { name: '腾讯混元', tag: '免费lite', color: '#0D47A1', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', models: 'hunyuan-lite', price: 'lite 免费', url: 'https://cloud.tencent.com/product/hunyuan', defaultModel: 'hunyuan-lite' },
  { name: 'MiniMax', tag: '多模态', color: '#00838F', baseUrl: 'https://api.minimax.chat/v1', models: 'abab6.5s-chat', price: '输入0.001元/千token', url: 'https://platform.minimaxi.com', defaultModel: 'abab6.5s-chat' },
  // ===== 国外大模型（在日本可用） =====
  { name: 'OpenAI (GPT-4o)', tag: '最强综合', color: '#10A37F', baseUrl: 'https://api.openai.com/v1', models: 'gpt-4o / gpt-4o-mini', price: '输入$0.0025/千token', url: 'https://platform.openai.com', defaultModel: 'gpt-4o-mini' },
  { name: 'Anthropic (Claude 3.5)', tag: '长文本推理', color: '#D97757', baseUrl: 'https://api.anthropic.com/v1', models: 'claude-3-5-sonnet-20241022', price: '输入$0.003/千token', url: 'https://console.anthropic.com', defaultModel: 'claude-3-5-sonnet-20241022' },
  { name: 'Google (Gemini)', tag: '免费额度', color: '#4285F4', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: 'gemini-1.5-flash / gemini-1.5-pro', price: 'flash 免费额度', url: 'https://aistudio.google.com', defaultModel: 'gemini-1.5-flash' },
  { name: 'Mistral AI', tag: '欧洲开源', color: '#FF7000', baseUrl: 'https://api.mistral.ai/v1', models: 'mistral-small-latest', price: '输入$0.0002/千token', url: 'https://console.mistral.ai', defaultModel: 'mistral-small-latest' },
  { name: 'Groq', tag: '极速推理', color: '#F55036', baseUrl: 'https://api.groq.com/openai/v1', models: 'llama-3.1-8b-instant', price: '免费额度', url: 'https://console.groq.com', defaultModel: 'llama-3.1-8b-instant' }
];

Page({
  data: {
    providers: PROVIDERS,
    selectedIdx: 0,
    apiKey: '',
    model: 'glm-4-flash',
    baseUrl: '',
    showKey: false,
    saving: false,
    testing: false,
    testResult: '',
    whitelistDomain: ''
  },

  onLoad() {
    const saved = storage.getMap('llmConfig');
    if (saved.apiKey) {
      // 找到匹配的provider
      const idx = PROVIDERS.findIndex(p => p.baseUrl === saved.apiBaseUrl);
      this.setData({
        selectedIdx: idx >= 0 ? idx : 0,
        apiKey: saved.apiKey,
        model: saved.model || 'glm-4-flash',
        baseUrl: saved.apiBaseUrl || PROVIDERS[0].baseUrl
      });
    } else {
      this.setData({ baseUrl: PROVIDERS[0].baseUrl, model: PROVIDERS[0].defaultModel });
    }
    this.updateWhitelistDomain();
  },

  // 更新白名单域名提示
  updateWhitelistDomain() {
    const url = this.data.baseUrl || '';
    try {
      const domain = new URL(url).hostname;
      this.setData({ whitelistDomain: domain });
    } catch (e) {
      this.setData({ whitelistDomain: '请先配置Base URL' });
    }
  },

  pickProvider(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const p = PROVIDERS[idx];
    this.setData({
      selectedIdx: idx,
      baseUrl: p.baseUrl,
      model: p.defaultModel
    });
    this.updateWhitelistDomain();
  },

  onKeyInput(e) { this.setData({ apiKey: e.detail.value }); },
  onModelInput(e) { this.setData({ model: e.detail.value }); },
  toggleShow() { this.setData({ showKey: !this.data.showKey }); },

  copyGuide() {
    const p = PROVIDERS[this.data.selectedIdx];
    wx.setClipboardData({
      data: '1. 打开 ' + p.url + '\n2. 注册/登录 → 创建API Key\n3. 复制Key回到本页粘贴\nBaseURL: ' + p.baseUrl,
      success: () => wx.showToast({ title: '指引已复制', icon: 'none' })
    });
  },

  async save() {
    if (!this.data.apiKey.trim()) {
      wx.showToast({ title: '请输入API Key', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    wx.setStorageSync('llmConfig', {
      apiBaseUrl: this.data.baseUrl,
      apiKey: this.data.apiKey.trim(),
      model: this.data.model
    });
    this.setData({ saving: false });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  async test() {
    if (!this.data.apiKey.trim()) {
      wx.showToast({ title: '请先填Key', icon: 'none' });
      return;
    }
    this.setData({ testing: true, testResult: '' });
    wx.showLoading({ title: '测试连通中...' });

    // 纯本地模式：直接测试API连接
    wx.request({
      url: this.data.baseUrl + '/chat/completions',
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.data.apiKey.trim()
      },
      data: {
        model: this.data.model,
        messages: [{ role: 'user', content: '你好' }],
        max_tokens: 10
      },
      success: (res) => {
        wx.hideLoading();
        this.setData({ testing: false });
        if (res.statusCode === 200 && res.data.choices) {
          this.setData({ testResult: '连接成功：' + res.data.choices[0].message.content });
          // 保存配置
          wx.setStorageSync('llmConfig', {
            apiBaseUrl: this.data.baseUrl,
            apiKey: this.data.apiKey.trim(),
            model: this.data.model
          });
        } else {
          this.setData({ testResult: '连接失败：HTTP ' + res.statusCode });
        }
      },
      fail: () => {
        wx.hideLoading();
        this.setData({ testing: false, testResult: '网络异常，请检查域名白名单' });
      }
    });
  },

  clear() {
    wx.showModal({
      title: '清除配置',
      content: '将删除本地保存的API Key，回到云端默认Key',
      success: (r) => {
        if (r.confirm) {
          wx.removeStorageSync('llmConfig');
          this.setData({ apiKey: '', model: PROVIDERS[0].defaultModel, baseUrl: PROVIDERS[0].baseUrl, selectedIdx: 0 });
          wx.showToast({ title: '已清除', icon: 'success' });
        }
      }
    });
  }
});
