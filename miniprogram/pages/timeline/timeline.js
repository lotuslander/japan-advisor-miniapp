const localData = require('../../utils/local-data.js');
const aiUpdater = require('../../utils/ai-updater.js');
const policySources = require('../../utils/policy-sources.js');

// 分类关键词：内置政策没有 category 字段，用关键词归类；AI 更新条目直接读 category
const CATEGORY_KEYWORDS = {
  business_manager: ['経営', '经营管理', '資本金', '资本金', '会社設立', '事务所'],
  hsp: ['高度', 'ポイント', '积分', 'J-Skip', 'J-Find', '高才'],
  permanent_residence: ['永住', '帰化', '归化', '定住'],
  realestate: ['不動産', '不动产', '置业', '购房', '房产', '住宅', '土地']
};

Page({
  data: {
    currentCat: 'all',
    categories: [
      { key: 'all', label: '全部' },
      { key: 'business_manager', label: '経営管理ビザ' },
      { key: 'hsp', label: '高度専門職' },
      { key: 'permanent_residence', label: '永住' },
      { key: 'realestate', label: '不動産' }
    ],
    nodes: [],
    aiCount: 0,
    versions: [],
    loading: false,
    error: false
  },

  onLoad() { this.loadTimeline(); },

  onShow() { this.loadTimeline(); },

  directionLabel(d) {
    return policySources.directionLabel(d);
  },

  /** 把一条政策记录映射成时间线节点 */
  toNode(p, isAI) {
    const cat = p.category || this.guessCategory(p);
    return Object.assign({}, p, {
      _id: p.id,
      event_date: p.date || (p.fetchedAt ? this.formatDay(p.fetchedAt) : ''),
      title: p.title_zh || p.title_ja || '',
      directionLabel: this.directionLabel(p.direction),
      category: cat,
      isAI: !!isAI,
      sourceUrl: p.source_url || '',
      url: p.source_url || '',
      expanded: false
    });
  },

  guessCategory(p) {
    const hay = (p.title_zh || '') + ' ' + (p.summary || '') + ' ' + (p.title_ja || '');
    const keys = Object.keys(CATEGORY_KEYWORDS);
    for (let i = 0; i < keys.length; i++) {
      const words = CATEGORY_KEYWORDS[keys[i]];
      for (let j = 0; j < words.length; j++) {
        if (hay.indexOf(words[j]) >= 0) return keys[i];
      }
    }
    return 'other';
  },

  formatDay(ts) {
    const d = new Date(ts);
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  loadTimeline() {
    this.setData({ loading: true, error: false });
    try {
      // 1) AI 更新的政策（优先展示）
      const aiPolicies = aiUpdater.readPolicies().map((p) => this.toNode(p, true));

      // 2) 内置政策
      const builtin = (localData.policies || []).map((p) => this.toNode(p, false));

      const all = aiPolicies.concat(builtin);
      this.setData({ aiCount: aiPolicies.length });
      this.applyFilter(all, this.data.currentCat);
      this.setData({ loading: false });
    } catch (err) {
      console.error('[timeline] load failed', err);
      this.setData({ nodes: [], loading: false, error: true });
    }
  },

  applyFilter(all, cat) {
    const list = (!cat || cat === 'all')
      ? all
      : all.filter((n) => n.category === cat);
    this.setData({ nodes: list });
  },

  switchCat(e) {
    const cat = e.currentTarget.dataset.key;
    this.setData({ currentCat: cat });
    this.loadTimeline();
  },

  toggleNode(e) {
    const id = e.currentTarget.dataset.id;
    const nodes = this.data.nodes.map((n) => (
      n.id === id ? Object.assign({}, n, { expanded: !n.expanded }) : n
    ));
    this.setData({ nodes });
  },

  openSource(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.setClipboardData({
        data: url,
        success: () => wx.showToast({ title: '原文链接已复制', icon: 'none' })
      });
      return;
    }
    wx.showToast({ title: '该条无原文链接（内置政策）', icon: 'none' });
  }
});
