const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  try {
    // 列表模式：按路径筛选
    if (event.mode === 'list' || !event.id) {
      const path = event.path || '';
      let query = { approved_for_publish: true };
      if (path && path !== 'all') query.path = path;

      const res = await db.collection('cases_library')
        .where(query)
        .orderBy('duration_months', 'asc')
        .limit(50)
        .get();
      return { ok: true, mode: 'list', list: res.data };
    }

    // 详情模式：按 _id 查询
    const res = await db.collection('cases_library').doc(event.id).get();
    return { ok: true, mode: 'detail', detail: res.data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
