const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const clientId = event.clientId;
  if (!clientId) return { ok: false, error: 'clientId 必填' };

  try {
    const clientRes = await db.collection('clients').doc(clientId).get();
    const client = clientRes.data;

    // 权限校验：仅本人（或无归属的 seed 演示数据）可见
    const openid = cloud.getWXContext().OPENID || '';
    if (client.owner_openid && client.owner_openid !== openid && client.owner_openid !== '') {
      return { ok: false, error: '无权访问该客户档案' };
    }

    // 关联案件（按客户姓名匹配）
    const casesRes = await db.collection('cases')
      .where({ client_name: client.name })
      .orderBy('started_at', 'desc')
      .get();

    const caseIds = casesRes.data.map(c => c.case_id);
    let tasks = [];
    if (caseIds.length) {
      const tasksRes = await db.collection('case_tasks')
        .where({ case_id: _.in(caseIds) })
        .get();
      tasks = tasksRes.data;
    }

    // 跟进记录（数据库驱动，按时间倒序；兼容 seed 按 client_name 关联的数据）
    let notes = [];
    try {
      let notesRes = await db.collection('client_notes')
        .where({ client_id: clientId })
        .orderBy('created_at', 'desc')
        .limit(50)
        .get();
      if (!notesRes.data.length && client.name) {
        notesRes = await db.collection('client_notes')
          .where({ client_name: client.name })
          .orderBy('created_at', 'desc')
          .limit(50)
          .get();
      }
      notes = notesRes.data.map(n => ({
        _id: n._id,
        kind: n.kind || 'contact',
        content: n.content,
        date: n.created_at ? String(n.created_at).slice(0, 10) : ''
      }));
    } catch (e) { notes = []; }

    return {
      ok: true,
      client,
      cases: casesRes.data,
      tasks,
      notes
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
