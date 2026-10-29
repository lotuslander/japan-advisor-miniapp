const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 政策快照：小程序启动时全量拉取，缓存到本地 storage，离线可看
exports.main = async () => {
  try {
    const [polRes, verRes] = await Promise.all([
      db.collection('policies').orderBy('published_at', 'desc').limit(200).get(),
      db.collection('policy_versions').orderBy('version_date', 'desc').limit(50).get()
    ]);

    return {
      ok: true,
      snapshot_at: new Date().toISOString(),
      policies: polRes.data,
      versions: verRes.data,
      count: polRes.data.length
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
