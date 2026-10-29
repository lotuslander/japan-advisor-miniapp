const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { name, phone, source, initial_intent, budget_jpy, timeline, note } = event;
  if (!name) return { ok: false, error: '姓名必填' };

  try {
    const openid = cloud.getWXContext().OPENID || '';

    // 1. 存入线索库
    const leadRes = await db.collection('leads').add({
      data: {
        name,
        phone: phone || '',
        source: source || '其他',
        initial_intent: initial_intent || '暂未确定',
        budget_jpy: budget_jpy || 0,
        timeline: timeline || '',
        note: note || '',
        status: 'new',
        owner_openid: openid,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });

    // 2. 同步进入客户库（线索即客户，stage=evaluating 待跟进）
    const dup = await db.collection('clients').where({ name, owner_openid: _.or([openid, _.exists(false), '']) }).count();
    if (dup.total === 0) {
      await db.collection('clients').add({
        data: {
          name,
          stage: 'evaluating',
          occupation: '',
          annual_income_jpy: budget_jpy || 0,
          tags: [initial_intent || '新线索', source || '其他'],
          source_lead_id: leadRes._id,
          owner_openid: openid,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      });
    }

    return { ok: true, id: leadRes._id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
