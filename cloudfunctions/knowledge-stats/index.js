const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const cols = ['policies', 'rejection_cases', 'doc_templates', 'compliance_rules', 'knowledge_vectors'];
  const stats = {};
  for (const c of cols) {
    try {
      const r = await db.collection(c).count();
      stats[c] = r.total;
    } catch (e) { stats[c] = 0; }
  }
  return {
    ok: true,
    stats: {
      vectorsCount: stats.knowledge_vectors || 0,
      policiesCount: stats.policies || 0,
      casesCount: stats.rejection_cases || 0,
      templatesCount: stats.doc_templates || 0,
      complianceCount: stats.compliance_rules || 0
    }
  };
};
