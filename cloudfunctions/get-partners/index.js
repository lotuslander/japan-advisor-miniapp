const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 资源协作层：行政书士/税理士/司法书士/银行/不动产中介/律师
exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID || '';
  const ownerQuery = _.or([
    { owner_openid: openid },
    { owner_openid: _.exists(false) },
    { owner_openid: '' }
  ]);

  try {
    // 保存/更新
    if (event.mode === 'save') {
      const { _id, name, type, city, specialty, note, status } = event.partner || {};
      if (!name) return { ok: false, error: '名称必填' };
      if (_id) {
        await db.collection('partners').doc(_id).update({
          data: { name, type, city: city || '', specialty: specialty || '', note: note || '', status: status || 'active', updated_at: db.serverDate() }
        });
        return { ok: true, id: _id };
      }
      const res = await db.collection('partners').add({
        data: {
          name, type: type || 'other', city: city || '', specialty: specialty || '',
          note: note || '', status: status || 'active',
          owner_openid: openid,
          created_at: db.serverDate(), updated_at: db.serverDate()
        }
      });
      return { ok: true, id: res._id };
    }

    // 删除（仅本人可删）
    if (event.mode === 'remove' && event.id) {
      const doc = await db.collection('partners').doc(event.id).get();
      if (doc.data.owner_openid && doc.data.owner_openid !== openid && doc.data.owner_openid !== '') {
        return { ok: false, error: '无权删除该资源' };
      }
      await db.collection('partners').doc(event.id).remove();
      return { ok: true };
    }

    // 列表（按类型筛选）
    const type = event.type || 'all';
    let cond = ownerQuery;
    if (type !== 'all') cond = _.and([cond, { type }]);

    const res = await db.collection('partners')
      .where(cond)
      .orderBy('updated_at', 'desc')
      .limit(100)
      .get();

    const typeCounts = await db.collection('partners').where(ownerQuery).get();
    const counts = {};
    for (const p of typeCounts.data) { counts[p.type] = (counts[p.type] || 0) + 1; }

    return { ok: true, list: res.data, counts };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
