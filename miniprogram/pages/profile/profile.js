const storage = require('../../utils/storage.js');
Page({
  data: {
    advisorId: '',
    llmKey: '',
    llmUrl: 'https://open.bigmodel.cn/api/paas/v4',
    hideKey: true,
    // 顾问档案：不再内置示例资料，全部来自本地真实数据（advisorName + clients）
    profile: {
      name: '',
      org: '',
      role: '',
      years: '',
      specialties: [],
      certs: [],
      records: []
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.loadIdentity();
    this.loadSavedKey();
  },

  /**
   * 读取大模型配置。
   *
   * 统一使用 llmConfig（与 api-config / chat / plan-generator / ai-updater 一致）。
   * 历史版本曾写入独立的 llmKey / llmUrl，此处做一次性迁移，避免「我的」页填了 Key
   * 但 AI 功能读不到。
   */
  loadSavedKey() {
    const config = storage.getMap('llmConfig');
    let llmKey = config.apiKey || '';
    let llmUrl = config.apiBaseUrl || 'https://open.bigmodel.cn/api/paas/v4';

    if (!llmKey) {
      const legacyKey = wx.getStorageSync('llmKey') || '';
      const legacyUrl = wx.getStorageSync('llmUrl') || '';
      if (legacyKey) {
        llmKey = legacyKey;
        llmUrl = legacyUrl || llmUrl;
        // 迁移到统一配置
        wx.setStorageSync('llmConfig', {
          apiBaseUrl: llmUrl,
          apiKey: llmKey,
          model: config.model || 'glm-4-flash'
        });
        wx.removeStorageSync('llmKey');
        wx.removeStorageSync('llmUrl');
      }
    }
    this.setData({ llmKey, llmUrl });
  },

  onLlmKeyInput(e) { this.setData({ llmKey: e.detail.value }); },  saveKey() {
    const config = storage.getMap('llmConfig');
    wx.setStorageSync('llmConfig', {
      apiBaseUrl: this.data.llmUrl || 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: (this.data.llmKey || '').trim(),
      model: config.model || 'glm-4-flash'
    });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  clearKey() {
    wx.removeStorageSync('llmConfig');
    wx.removeStorageSync('llmKey');
    wx.removeStorageSync('llmUrl');
    this.setData({ llmKey: '' });
    wx.showToast({ title: '已清空', icon: 'none' });
  },

  goApiConfig() {
    wx.navigateTo({ url: '/pages/api-config/api-config' });
  },

  goKnowledgeAdmin() {
    wx.navigateTo({ url: '/pages/knowledge-admin/knowledge-admin' });
  },

  testConnect() {
    if (!this.data.llmKey) {
      wx.showToast({ title: '请先填写Key', icon: 'none' });
      return;
    }
    // 纯本地模式：直接测试API连接（读写统一走 llmConfig）
    wx.showLoading({ title: '测试中...' });
    const config = storage.getMap('llmConfig');
    const testUrl = (config.apiBaseUrl || this.data.llmUrl || 'https://open.bigmodel.cn/api/paas/v4');
    const testKey = (config.apiKey || this.data.llmKey || '').trim();
    wx.request({
      url: testUrl + '/chat/completions',
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + testKey
      },
      data: {
        model: config.model || 'glm-4-flash',
        messages: [{ role: 'user', content: '你好' }],
        max_tokens: 10
      },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data.choices) {
          wx.showToast({ title: '连接成功', icon: 'success' });
        } else {
          wx.showToast({ title: '连接失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  loadIdentity() {
    const advisorName = wx.getStorageSync('advisorName') || '';

    // 执业记录由真实客户数据统计，不再使用内置示例数字
    let clients = [];
    try {
      clients = storage.getList('clients');
    } catch (e) {
      clients = [];
    }
    const CLOSED = ['closed', 'done', 'rejected', 'failed'];
    const withStage = clients.filter((c) => c && c.stage);
    const closed = withStage.filter((c) => CLOSED.indexOf(c.stage) >= 0).length;
    const active = withStage.length - closed;

    const records = [];
    if (clients.length > 0) {
      records.push({ label: '累计客户', value: clients.length });
      records.push({ label: '进行中', value: active });
      records.push({ label: '已结案', value: closed });
    }

    this.setData({
      profile: Object.assign({}, this.data.profile, {
        name: advisorName,
        records
      })
    });
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  goSourcesAdmin() {
    wx.navigateTo({ url: '/pages/sources-admin/sources-admin' });
  },

  // 导出数据
  exportData() {
    const dataTransfer = require('../../utils/data-transfer.js');
    const json = dataTransfer.exportAll();
    // 保存到本地文件
    const fs = wx.getFileSystemManager();
    const path = `${wx.env.USER_DATA_PATH}/japan-advisor-backup-${Date.now()}.json`;
    fs.writeFile({
      filePath: path,
      data: json,
      encoding: 'utf8',
      success: () => {
        wx.showModal({
          title: '导出成功',
          content: '文件已保存到：' + path + '\n\n您可以分享到微信/网盘备份',
          showCancel: true,
          confirmText: '分享',
          success: (r) => {
            if (r.confirm) {
              wx.shareFileMessage({ filePath: path });
            }
          }
        });
      },
      fail: () => wx.showToast({ title: '导出失败', icon: 'none' })
    });
  },

  // 导入数据
  importData() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].path;
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: tempFilePath,
          encoding: 'utf8',
          success: (readRes) => {
            const dataTransfer = require('../../utils/data-transfer.js');
            const result = dataTransfer.importAll(readRes.data);
            if (result.ok) {
              wx.showModal({
                title: '导入成功',
                content: result.message + (result.skipped && result.skipped.length
                  ? '\n\n跳过：' + result.skipped.join('、')
                  : ''),
                showCancel: false
              });
            } else {
              wx.showToast({ title: result.message, icon: 'none' });
            }
          }
        });
      }
    });
  }
});
