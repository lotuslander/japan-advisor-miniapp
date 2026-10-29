const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 工作台滚动新闻：最近 5 条
exports.main = async (event) => {
  const limit = event.limit || 5;
  try {
    const res = await db.collection('news_feed')
      .orderBy('fetched_at', 'desc')
      .limit(limit)
      .get();
    return { ok: true, list: res.data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
