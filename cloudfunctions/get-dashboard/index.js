const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 工作台统计：案件/线索/客户/任务按顾问归属过滤；案例库与待审政策全局共享
exports.main = async () => {
  try {
    const openid = cloud.getWXContext().OPENID || '';
    const ownerQuery = _.or([
      { owner_openid: openid },
      { owner_openid: _.exists(false) },
      { owner_openid: '' }
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const [active, closed, evaluating, leads, lib, pendingTasks, clients, pendingPolicies,
      allLeads, bmCases, hspCases, prCases, reCases, todayFollowups] = await Promise.all([
      db.collection('cases').where(_.and([ownerQuery, { stage: _.in(['confirmed', 'executing', 'landed']) }])).count(),
      db.collection('cases').where(_.and([ownerQuery, { stage: 'closed' }])).count(),
      db.collection('cases').where(_.and([ownerQuery, { stage: 'evaluating' }])).count(),
      db.collection('leads').where(_.and([ownerQuery, { status: 'new' }])).count(),
      db.collection('cases_library').count(),
      db.collection('case_tasks').where(_.and([ownerQuery, { done: false }])).count(),
      db.collection('clients').where(ownerQuery).count(),
      db.collection('policies').where({ status: 'pending_review' }).count(),
      db.collection('leads').where(ownerQuery).count(),
      db.collection('cases').where(_.and([ownerQuery, { path: 'business_manager' }])).count(),
      db.collection('cases').where(_.and([ownerQuery, { path: 'hsp' }])).count(),
      db.collection('cases').where(_.and([ownerQuery, { path: 'pr' }])).count(),
      db.collection('cases').where(_.and([ownerQuery, { path: 'realestate' }])).count(),
      db.collection('clients').where(_.and([ownerQuery, { next_followup_at: _.lte(today) }])).count()
    ]);

    return {
      ok: true,
      advisorId: openid ? openid.slice(-6) : 'seed',
      stats: {
        activeCases: active.total,
        closedCases: closed.total,
        evaluating: evaluating.total,
        pendingLeads: leads.total,
        caseLibrary: lib.total,
        pendingTasks: pendingTasks.total,
        clients: clients.total,
        pendingPolicies: pendingPolicies.total,
        totalLeads: allLeads.total,
        leadConv: allLeads.total > 0 ? Math.round(clients.total / allLeads.total * 100) : 0,
        pathDist: {
          business_manager: bmCases.total,
          hsp: hspCases.total,
          pr: prCases.total,
          realestate: reCases.total
        },
        todayFollowups: todayFollowups.total
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
