const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { caseId, result, memo, toLibrary } = event;
  if (!caseId) return { ok: false, error: 'caseId 必填' };

  try {
    await db.collection('cases').where({ case_id: caseId }).update({
      data: {
        stage: 'closed',
        close_result: result || 'approved',
        close_memo: memo || '',
        closed_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });

    if (toLibrary) {
      const caseRes = await db.collection('cases').where({ case_id: caseId }).get();
      if (caseRes.data.length) {
        const c = caseRes.data[0];

        // 从客户档案提取画像标签
        let profileTags = [];
        try {
          const clientRes = await db.collection('clients').where({ name: c.client_name }).get();
          if (clientRes.data.length) profileTags = clientRes.data[0].tags || [];
        } catch (e) { profileTags = []; }

        // 从已完成任务提炼解决方案
        let solution = [];
        try {
          const tasksRes = await db.collection('case_tasks')
            .where({ case_id: caseId, done: true })
            .orderBy('sort', 'asc')
            .get();
          solution = tasksRes.data.map(t => t.title).slice(0, 5);
        } catch (e) { solution = []; }

        await db.collection('cases_library').add({
          data: {
            title: c.client_name + '案例（已脱敏）',
            path: c.path,
            profile_tags: profileTags,
            key_challenge: c.close_memo || '',
            solution,
            result: 'approved',
            duration_months: Math.max(1, Math.round((Date.now() - new Date(c.started_at)) / (30 * 24 * 3600 * 1000))),
            approved_for_publish: true,
            source_case_id: caseId,
            created_at: db.serverDate()
          }
        });
      }
    }

    // ── 老带新：结案后自动给推荐人发奖励 ──
    let referralReward = null;
    try {
      const caseRes2 = await db.collection('cases').where({ case_id: caseId }).get();
      if (caseRes2.data.length) {
        const cc = caseRes2.data[0];
        // 查这个客户是被谁推荐来的
        const leadRes = await db.collection('leads').where({ client_name: cc.client_name }).get();
        if (leadRes.data.length && leadRes.data[0].referral_code) {
          const rc = leadRes.data[0].referral_code;
          // 找推荐人
          const refRes = await db.collection('clients').where({ referral_code: rc }).get();
          if (refRes.data.length) {
            const referrer = refRes.data[0];
            // 每成功一个被推荐客户，奖励5万円抵扣券
            const reward = 5;
            await db.collection('clients').doc(referrer._id).update({
              data: {
                referred_count: (referrer.referred_count || 0) + 1,
                reward_earned: (referrer.reward_earned || 0) + reward,
                updated_at: db.serverDate()
              }
            });
            // 记一笔奖励流水
            await db.collection('referral_rewards').add({
              data: {
                referrer_id: referrer._id,
                referrer_name: referrer.name,
                referred_client: cc.client_name,
                case_id: caseId,
                reward_amount_jpy_wan: reward,
                status: 'issued',
                created_at: db.serverDate()
              }
            });
            referralReward = { to: referrer.name, amount: reward };
          }
        }
      }
    } catch (e) { referralReward = { error: e.message }; }

    return { ok: true, referral_reward: referralReward };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
