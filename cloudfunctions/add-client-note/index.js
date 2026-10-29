const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 客户跟进记录：client_notes 集合
// kind: contact(沟通) / note(备注) / material(材料进展) / decision(决策) / followup(下次跟进)
exports.main = async (event) => {
  const { client_id, content, kind, next_followup_at } = event;
  if (!client_id) return { ok: false, error: 'clientId 必填' };
  if (!content || !content.trim()) return { ok: false, error: '记录内容不能为空' };

  try {
    let clientName = '';
    try {
      const cRes = await db.collection('clients').doc(client_id).get();
      clientName = cRes.data.name || '';
    } catch (e) { clientName = ''; }

    const res = await db.collection('client_notes').add({
      data: {
        client_id,
        client_name: clientName,
        content: content.trim(),
        kind: kind || 'contact',
        owner_openid: cloud.getWXContext().OPENID || '',
        created_at: db.serverDate()
      }
    });

    const update = { last_follow_at: db.serverDate(), updated_at: db.serverDate() };
    if (next_followup_at) update.next_followup_at = next_followup_at;
    await db.collection('clients').doc(client_id).update({ data: update }).catch(() => {});

    return { ok: true, id: res._id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
