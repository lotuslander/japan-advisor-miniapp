const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { taskId, done } = event;
  if (!taskId) return { ok: false, error: 'taskId 必填' };

  try {
    await db.collection('case_tasks').doc(taskId).update({
      data: { done: !!done, updated_at: db.serverDate() }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
