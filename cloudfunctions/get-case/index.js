const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const caseId = event.caseId || 'seed_bm_1';
  try {
    const caseRes = await db.collection('cases').where({ case_id: caseId }).get();
    if (!caseRes.data.length) {
      return { ok: false, error: '案件不存在' };
    }

    // 权限校验：仅本人（或无归属的 seed 演示数据）可见
    const openid = cloud.getWXContext().OPENID || '';
    const c = caseRes.data[0];
    if (c.owner_openid && c.owner_openid !== openid && c.owner_openid !== '') {
      return { ok: false, error: '无权访问该案件' };
    }

    const tasksRes = await db.collection('case_tasks')
      .where({ case_id: caseId })
      .orderBy('sort', 'asc')
      .get();
    const docsRes = await db.collection('case_documents')
      .where({ case_id: caseId })
      .get();

    return {
      ok: true,
      case: c,
      tasks: tasksRes.data,
      documents: docsRes.data
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
