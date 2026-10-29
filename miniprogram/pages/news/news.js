// 政策·新闻列表页（纯端侧）
//
// 数据来源与首页滚动条一致：
//   1) wx.getStorageSync('customPolicies') —— 大模型更新得到的政策
//   2) utils/local-data.js 的 news —— 内置官方动态
//
// 原文链接：内置 news 只有机关名称没有 URL，用 policy-sources 的名称映射还原官网地址，
// 匹配不到则不显示链接（不编造）。
const localData = require('../../utils/local-data.js');
const policySources = require('../../utils/policy-sources.js');
const storage = require('../../utils/storage.js');

function dateRank(d) {
  const s = String(d || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '0000-00-00';
}

Page({
  data: {
    list: [],
    loading: true,
    aiCount: 0,
    newsCount: 0
  },

  onLoad() { this.load(); },

  // 从别处返回时也能看到新的 AI 更新
  onShow() { this.load(); },

  load() {
    const list = [];

    // 1) AI 更新的政策（置顶）
    let ai = [];
    try {
      ai = storage.getList('customPolicies');
    } catch (e) {
      ai = [];
    }
    (Array.isArray(ai) ? ai : []).forEach((p) => {
      list.push({
        id: p.id,
        type: 'ai',
        typeLabel: 'AI',
        title: p.title_zh || p.title_ja || '',
        summary: p.summary || '',
        source: p.source || 'AI 整理',
        date: p.date || '',
        url: p.source_url || '',
        verified: p.verified === true
      });
    });

    // 2) 内置官方动态（按日期倒序）
    const news = (localData.news || []).slice().sort((a, b) => {
      return dateRank(b.published_at).localeCompare(dateRank(a.published_at));
    });
    news.forEach((n) => {
      list.push({
        id: n.id,
        type: 'official',
        typeLabel: '官方',
        title: n.title_ja || n.title_zh || '',
        summary: n.summary_zh || '',
        source: n.source || '',
        date: n.published_at || '',
        url: policySources.resolveSourceUrl(n.source),
        verified: true
      });
    });

    this.setData({
      list,
      loading: false,
      aiCount: ai.length,
      newsCount: news.length
    });
  },

  openNews(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const item = this.data.list[idx];
    if (!item) return;

    const content = (item.summary || item.title)
      + (item.source ? '\n\n来源：' + item.source : '')
      + (item.date ? '\n日期：' + item.date : '')
      + (item.url ? '\n' + item.url : '');

    wx.showModal({
      title: item.title || '动态详情',
      content,
      confirmText: item.url ? '复制链接' : '知道了',
      cancelText: '关闭',
      success: (r) => {
        if (r.confirm && item.url) {
          wx.setClipboardData({
            data: item.url,
            success: () => wx.showToast({ title: '原文链接已复制', icon: 'none' })
          });
        }
      }
    });
  },

  goUpdatePolicy() {
    wx.navigateTo({ url: '/pages/policy-review/policy-review' });
  }
});
