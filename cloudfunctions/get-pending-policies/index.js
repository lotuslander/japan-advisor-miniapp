const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 待审政策：fetch-policies 抓取入库后 status=pending_review 的政策
// 顾问审核确认（approve-policy）后转 effective，驳回后转 rejected
exports.main = async (event) => {
  try {
    // 详情模式
    if (event.id) {
      const res = await db.collection('policies').doc(event.id).get();
      return { ok: true, mode: 'detail', policy: res.data };
    }

    // 列表模式：全部待审 + 已驳回（留痕）按抓取时间倒序
    const _ = db.command;
    const res = await db.collection('policies')
      .where({ status: _.in(['pending_review', 'rejected']) })
      .orderBy('published_at', 'desc')
      .limit(50)
      .get();

    return {
      ok: true,
      mode: 'list',
      list: res.data.map(p => ({
        _id: p._id,
        title_zh: p.title_zh,
        title_ja: p.title_ja,
        summary: p.summary,
        source_name_zh: p.source_name_zh,
        published_at: p.published_at,
        category: p.category,
        status: p.status,
        has_ai: !!p.ai_summary
      }))
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
