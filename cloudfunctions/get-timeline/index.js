const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 时间线：返回节点 + 最新政策 + 该主题的历史版本对比数据
exports.main = async (event) => {
  const category = event.category || 'business_manager';
  try {
    const nodesRes = await db.collection('timeline_nodes')
      .where({ category })
      .orderBy('event_date', 'asc')
      .get();

    const policiesRes = await db.collection('policies')
      .where({ category, status: _.in(['effective', 'pending_review']) })
      .orderBy('published_at', 'desc')
      .limit(3)
      .get();

    // 历史版本对比：按 category 聚合 policy_versions，取该主题全部历史版本
    // 若某版本对应政策尚未收录到 policies，则由前端以 "历史版本" 身份单独展示
    const versionsRes = await db.collection('policy_versions')
      .where({ category })
      .orderBy('version', 'asc')
      .get();

    // 整理成「从历史到现在」的可比对结构
    const versions = versionsRes.data.map(v => ({
      version_date: v.version || v.version_date,
      version_label: v.version_label || v.version || v.version_date,
      capital_min_jpy: v.capital_min_jpy,
      fulltime_employee: v.fulltime_employee,
      japanese_level: v.japanese_level,
      expert_review: v.expert_review,
      management_experience_years: v.management_experience_years,
      home_office: v.home_office,
      note: v.note
    }));

    return {
      ok: true,
      nodes: nodesRes.data,
      recentPolicies: policiesRes.data,
      versions: versions
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
