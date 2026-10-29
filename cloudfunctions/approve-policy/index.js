const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 政策审核：顾问确认（approve=true）→ status=effective + 结构化字段；驳回 → status=rejected（留痕）
// 结构化字段设计（可选，供历史对比/积分测算/检索引用）：
//   capital_min_jpy   最低资本金/投下资金（日元）
//   japanese_level    日语能力要求（文本）
//   employee_required 是否要求常勤职员
//   expert_review     是否要求专家确认
//   transition_until  过渡期截止（YYYY-MM-DD，无则 ''）
//   impact            对顾问业务的要点提示
exports.main = async (event) => {
  const { id, approve, structured } = event;
  if (!id) return { ok: false, error: '政策 id 必填' };

  try {
    const doc = await db.collection('policies').doc(id).get();
    if (!doc.data) return { ok: false, error: '政策不存在' };
    if (doc.data.status !== 'pending_review') {
      return { ok: false, error: '该政策已处理（当前状态：' + (doc.data.status || '未知') + '）' };
    }

    const update = {
      status: approve ? 'effective' : 'rejected',
      reviewed_at: db.serverDate()
    };

    // 确认时允许写入结构化字段（仅接受合法键，防止注入无关字段）
    if (approve && structured && typeof structured === 'object') {
      const allowed = ['capital_min_jpy', 'japanese_level', 'employee_required', 'expert_review', 'transition_until', 'impact'];
      for (const k of allowed) {
        if (structured[k] !== undefined && structured[k] !== null && structured[k] !== '') {
          update[k] = structured[k];
        }
      }
    }

    await db.collection('policies').doc(id).update({ data: update });

    return { ok: true, status: approve ? 'effective' : 'rejected' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
