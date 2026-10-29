const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const VALID_STAGES = ['evaluating', 'confirmed', 'executing', 'landed', 'closed'];

exports.main = async (event) => {
  const { caseId, newStage } = event;
  if (!caseId || !newStage) return { ok: false, error: '参数缺失' };
  if (!VALID_STAGES.includes(newStage)) return { ok: false, error: '非法阶段' };

  const openid = cloud.getWXContext().OPENID || '';

  try {
    const doc = await db.collection('cases').doc(caseId).get();
    if (!doc.data) return { ok: false, error: '案件不存在' };
    if (doc.data.owner_openid && doc.data.owner_openid !== openid && doc.data.owner_openid !== '') {
      return { ok: false, error: '无权操作他人案件' };
    }

    await db.collection('cases').doc(caseId).update({
      data: {
        stage: newStage,
        updated_at: db.serverDate()
      }
    });

    return { ok: true, stage: newStage };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
