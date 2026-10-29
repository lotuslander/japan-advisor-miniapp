// 首页政策·新闻滚动条（纯端侧）
//
// 数据来源（两路合并，AI 更新优先）：
//   1) wx.getStorageSync('customPolicies') —— 用户用大模型抓取到的政策更新
//   2) utils/local-data.js 的 news —— 内置官方动态
//
// 交互：
//   - 点击条目 → 弹窗展示摘要 + 来源，有原文链接时可一键复制
//   - 点击「全部」→ 跳转 news 页
//
// 说明：news 数据里没有 url 字段，这里用 policy-sources 的名称匹配把「发布机关」
// 映射回官网地址，匹配不到则不显示链接（不编造地址）。
const localData = require('../../utils/local-data.js');
const policySources = require('../../utils/policy-sources.js');
const storage = require('../../utils/storage.js');

/** 日期字符串比较（YYYY-MM-DD），空值排后 */
function dateRank(d) {
  const s = String(d || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '0000-00-00';
}

Component({
  properties: {
    limit: { type: Number, value: 5 },
    showAI: { type: Boolean, value: true }
  },

  data: {
    items: [],
    current: 0
  },

  lifetimes: {
    attached() { this.refresh(); }
  },

  // AI 更新完回到首页时也能刷新
  pageLifetimes: {
    show() { this.refresh(); }
  },

  methods: {
    refresh() {
      const list = [];

      // 1) AI 更新的政策（最新成果，置顶）
      if (this.data.showAI) {
        let ai = [];
        try {
          ai = storage.getList('customPolicies');
        } catch (e) {
          ai = [];
        }
        (Array.isArray(ai) ? ai : []).slice(0, 3).forEach((p) => {
          list.push({
            id: p.id || ('ai-' + list.length),
            tag: 'AI',
            tagClass: 'tag-ai',
            title: p.title_zh || p.title_ja || '',
            summary: p.summary || '',
            meta: [p.source, p.date].filter(Boolean).join(' · '),
            url: p.source_url || '',
            order: 1,
            date: p.date || ''
          });
        });
      }

      // 2) 内置官方动态（按日期倒序）
      const news = (localData.news || []).slice().sort((a, b) => {
        return dateRank(b.published_at).localeCompare(dateRank(a.published_at));
      });
      news.forEach((n) => {
        list.push({
          id: n.id,
          tag: '官方',
          tagClass: 'tag-official',
          title: n.title_ja || n.title_zh || '',
          summary: n.summary_zh || '',
          meta: [n.source, n.published_at].filter(Boolean).join(' · '),
          url: policySources.resolveSourceUrl(n.source),
          order: 2,
          date: n.published_at || ''
        });
      });

      // AI 条目优先，其余保持日期倒序
      list.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return 0;
      });

      const limit = this.data.limit > 0 ? this.data.limit : 5;
      this.setData({ items: list.slice(0, limit), current: 0 });
    },

    onSwiperChange(e) {
      this.setData({ current: e.detail.current });
    },

    onTapItem(e) {
      const idx = Number(e.currentTarget.dataset.idx);
      const item = this.data.items[idx];
      if (!item) return;

      const content = (item.summary || item.title)
        + (item.meta ? '\n\n来源：' + item.meta : '')
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

    goNews() {
      wx.navigateTo({ url: '/pages/news/news' });
    }
  }
});
