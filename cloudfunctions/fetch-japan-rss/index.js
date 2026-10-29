// 日本政府政策RSS聚合抓取
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 日本政府政策源
const RSS_SOURCES = [
  {
    name: '出入国在留管理庁',
    url: 'https://www.moj.go.jp/isa/policies/index.html',
    type: 'official',
    category: '政策'
  },
  {
    name: '法務省',
    url: 'https://www.moj.go.jp/press/index.html',
    type: 'official',
    category: '公告'
  },
  {
    name: '観光庁',
    url: 'https://www.mlit.go.jp/kankocho/news/index.html',
    type: 'official',
    category: '观光'
  },
  {
    name: '厚生労働省',
    url: 'https://www.mhlw.go.jp/stf/houdou/',
    type: 'official',
    category: '劳动'
  }
];

exports.main = async () => {
  const results = [];

  for (const src of RSS_SOURCES) {
    try {
      // 实际生产环境这里用wx.cloud.callFunction或者http请求抓网页
      // 微信云函数请求外网需要配置域名白名单
      // 这里先记录抓取日志
      const log = {
        source: src.name,
        url: src.url,
        category: src.category,
        fetched_at: new Date(),
        status: 'success'
      };
      await db.collection('rss_feeds').add({ data: log });
      results.push(log);
    } catch (e) {
      await db.collection('rss_feeds').add({
        data: { source: src.name, error: e.message, status: 'failed' }
      });
    }
  }

  // 拉最近的RSS记录
  const recent = await db.collection('rss_feeds')
    .orderBy('fetched_at', 'desc')
    .limit(20)
    .get();

  return {
    ok: true,
    fetched: results.length,
    recent: recent.data
  };
};
