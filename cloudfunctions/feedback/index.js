const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { chatId, useful } = event;
  if (!chatId) return { ok: false, error: 'chatId 必填' };

  try {
    await db.collection('chat_logs').doc(chatId).update({
      data: { useful: useful, feedback_at: new Date() }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
