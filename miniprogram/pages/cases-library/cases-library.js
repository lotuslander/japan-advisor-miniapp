/**
 * 案例库（純本地モード）
 *
 * 数据源：utils/local-data.js 的 cases（15 个脱敏案例）
 * 原始字段：{ id, type, title, client_profile, path, result, key_success?, key_risk?, lessons }
 * 视图字段：{ _id, title, pathLabel, profile_tags, resultLabel, result, isSuccess }
 *
 * 原实现只有 onLoad 直接透传原始字段，导致 wxml 里的筛选（setCat）、搜索（onSearchInput）、
 * 刷新（load）、进详情（goDetail）全部绑定断裂。此版本补全全部交互与字段映射。
 */

var localData = require('../../utils/local-data.js');

// 签证路径 → 分类键，用于顶部筛选
var PATH_CATEGORY = [
  { key: 'hsp', match: ['高度専門職'] },
  { key: 'business_manager', match: ['経営・管理'] },
  { key: 'pr', match: ['永住', '帰化'] }
];

// 不动产相关：本地数据里没有独立 path，用关键词兜底
var REALESTATE_KEYWORDS = ['不動産', '不动产', '置业', '買楼', '买楼', '房产'];

function categoryOf(item) {
  var path = item.path || '';
  for (var i = 0; i < PATH_CATEGORY.length; i++) {
    var rule = PATH_CATEGORY[i];
    for (var j = 0; j < rule.match.length; j++) {
      if (path.indexOf(rule.match[j]) >= 0) return rule.key;
    }
  }
  var haystack = (item.title || '') + (item.client_profile || '');
  for (var k = 0; k < REALESTATE_KEYWORDS.length; k++) {
    if (haystack.indexOf(REALESTATE_KEYWORDS[k]) >= 0) return 'realestate';
  }
  return 'other';
}

function toViewModel(item) {
  var profile = item.client_profile || '';
  var tags = profile.split('/').map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });

  return {
    _id: item.id,
    title: item.title,
    pathLabel: item.path || '',
    profile_tags: tags,
    resultLabel: item.result || '',
    result: item.result || '',
    isSuccess: item.type === 'success',
    // 详情用
    brand: item.type === 'success' ? '成功' : '不許可',
    source_url: item.source_url || '',
    category: categoryOf(item)
  };
}

Page({
  data: {
    cat: 'all',
    keyword: '',
    all: [],
    list: []
  },

  onLoad: function () {
    var cases = localData.cases || [];
    var all = cases.map(toViewModel);
    this.setData({ all: all, list: all });
  },

  onShow: function () {
    // 允许其它页面改数据后回到本页时刷新
    if (this.data.all.length === 0) this.onLoad();
  },

  /** 顶部分类筛选 */
  setCat: function (e) {
    var cat = e.currentTarget.dataset.c;
    this.setData({ cat: cat }, this.load);
  },

  /** 搜索框输入 */
  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value });
  },

  /** 搜索框回车 / 「重新加载」按钮 */
  load: function () {
    var cat = this.data.cat || 'all';
    var kw = (this.data.keyword || '').trim().toLowerCase();
    var src = this.data.all || [];

    var list = src.filter(function (item) {
      if (cat !== 'all' && item.category !== cat) return false;
      if (!kw) return true;
      var haystack = [
        item.title,
        item.pathLabel,
        item.resultLabel,
        (item.profile_tags || []).join(' ')
      ].join(' ').toLowerCase();
      return haystack.indexOf(kw) >= 0;
    });

    this.setData({ list: list });
  },

  /** 进入案例详情 */
  goDetail: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/case-lib-detail/case-lib-detail?id=' + id });
  },

  /** 清空搜索 */
  clearSearch: function () {
    this.setData({ keyword: '' }, this.load);
  }
});
