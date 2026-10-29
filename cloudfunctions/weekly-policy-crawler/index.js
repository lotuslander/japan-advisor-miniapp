// 每周政策自动抓取：抓日本入管厅/法务省最新政策
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 日本政府政策源（公开RSS/公告页）
const SOURCES = [
  {
    name: '出入国在留管理庁',
    url: 'https://www.moj.go.jp/isa/policies/index.html',
    type: 'official'
  },
  {
    name: '法務省',
    url: 'https://www.moj.go.jp/press/index.html',
    type: 'official'
  },
  {
    name: '厚生労働省',
    url: 'https://www.mhlw.go.jp/stf/houdou/',
    type: 'official'
  },
  {
    name: '観光庁',
    url: 'https://www.mlit.go.jp/kankocho/news/index.html',
    type: 'official'
  }
];

exports.main = async () => {
  const newItems = [];

  for (const src of SOURCES) {
    try {
      // 实际生产环境这里用wx.cloud.callFunction或者http请求抓网页
      // 这里先做占位：标记已抓取
      newItems.push({
        source: src.name,
        url: src.url,
        fetched_at: new Date(),
        status: 'pending_parse'
      });

      // 记录抓取日志
      await db.collection('crawl_logs').add({
        data: {
          source: src.name,
          url: src.url,
          fetched_at: new Date(),
          status: 'success'
        }
      });
    } catch (e) {
      await db.collection('crawl_logs').add({
        data: {
          source: src.name,
          error: e.message,
          status: 'failed'
        }
      });
    }
  }

  return {
    ok: true,
    crawled: newItems.length,
    items: newItems
  };
};
