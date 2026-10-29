const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 客户列表：仅返回当前顾问名下客户（+无归属的 seed 演示数据）
exports.main = async (event) => {
  const filter = event.filter || 'all';
  const keyword = (event.keyword || '').trim();
  const openid = cloud.getWXContext().OPENID || '';

  try {
    const ownerQuery = _.or([
      { owner_openid: openid },
      { owner_openid: _.exists(false) },
      { owner_openid: '' }
    ]);

    let cond = ownerQuery;
    if (filter === 'active') cond = _.and([cond, { stage: _.in(['evaluating', 'confirmed', 'executing', 'landed']) }]);
    if (filter === 'closed') cond = _.and([cond, { stage: 'closed' }]);

    // 关键词搜索：姓名 / 职业 / 标签（正则模糊匹配，云开发 or 语法）
    if (keyword) {
      const reg = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' });
      cond = _.and([
        cond,
        _.or([
          { name: reg },
          { occupation: reg },
          { tags: reg }
        ])
      ]);
    }

    const clientsRes = await db.collection('clients')
      .where(cond)
      .orderBy('updated_at', 'desc')
      .limit(100)
      .get();

    // 计数（同权限范围）
    const allCount = await db.collection('clients').where(ownerQuery).count();
    const activeCount = await db.collection('clients')
      .where(_.and([ownerQuery, { stage: _.in(['evaluating', 'confirmed', 'executing', 'landed']) }]))
      .count();

    return {
      ok: true,
      list: clientsRes.data,
      counts: {
        all: allCount.total,
        active: activeCount.total
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
