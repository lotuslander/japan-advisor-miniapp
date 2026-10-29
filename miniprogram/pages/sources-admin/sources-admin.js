// 政策源管理
const policySources = require('../../utils/policy-sources.js');
const storage = require('../../utils/storage.js');

Page({
  data: {
    sources: [],
    builtinCount: 0,
    newName: '',
    newCat: '',
    newUrl: ''
  },

  onLoad() {
    this.loadSources();
  },

  // 返回本页时重新读，保证与 storage 一致
  onShow() {
    this.loadSources();
  },

  loadSources() {
    const saved = storage.getList('policySources');
    // 未导入过时，直接展示共享清单（不写 storage），避免页面空白
    const list = saved.length > 0 ? saved : this.builtinAsList();
    this.setData({
      sources: list,
      builtinCount: policySources.allPolicySources().length
    });
  },

  /** 共享清单 → 页面用的 {name, category, url} 结构 */
  builtinAsList() {
    return policySources.allPolicySources().map((s) => ({
      name: s.name,
      category: policySources.CATEGORY_LABELS[s.category] || s.category,
      url: s.url
    }));
  },

  // 一键导入全部官方源（含 20 条精确政策页深链 + 27 个机构官网，按 URL 去重）
  importAllSources() {
    const allSources = this.builtinAsList();

    wx.setStorageSync('policySources', allSources);
    this.setData({ sources: allSources });
    wx.showToast({ title: `已导入${allSources.length}个源`, icon: 'success' });
  },

  // 恢复为内置清单（清掉自定义增删）
  resetSources() {
    wx.showModal({
      title: '恢复内置清单',
      content: '将清除自定义增删，恢复为内置的官方源清单。',
      success: (r) => {
        if (!r.confirm) return;
        const list = this.builtinAsList();
        wx.setStorageSync('policySources', list);
        this.setData({ sources: list });
        wx.showToast({ title: '已恢复', icon: 'success' });
      }
    });
  },

  onNameInput(e) { this.setData({ newName: e.detail.value }); },
  onCatInput(e) { this.setData({ newCat: e.detail.value }); },
  onUrlInput(e) { this.setData({ newUrl: e.detail.value }); },

  addSource() {
    if (!this.data.newName || !this.data.newUrl) {
      wx.showToast({ title: '请填名称和网址', icon: 'none' });
      return;
    }
    const newSource = {
      name: this.data.newName,
      category: this.data.newCat || '自定义',
      url: this.data.newUrl
    };
    const sources = [...this.data.sources, newSource];
    wx.setStorageSync('policySources', sources);
    this.setData({
      sources,
      newName: '',
      newCat: '',
      newUrl: ''
    });
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  // 复制所有域名（不依赖 URL 构造函数，小程序环境更稳）
  copyDomains() {
    const hostOf = (url) => {
      const m = String(url || '').match(/^https?:\/\/([^/?#]+)/i);
      return m ? m[1].toLowerCase() : '';
    };
    const seen = {};
    const unique = [];
    this.data.sources.forEach((s) => {
      const h = hostOf(s.url);
      if (h && !seen[h]) {
        seen[h] = true;
        unique.push(h);
      }
    });
    if (unique.length === 0) {
      wx.showToast({ title: '没有可复制的域名', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: unique.join('\n'),
      success: () => wx.showToast({ title: `已复制${unique.length}个域名`, icon: 'none' })
    });
  }
});
