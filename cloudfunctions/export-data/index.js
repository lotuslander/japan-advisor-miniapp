const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 导出客户为 CSV：仅导出当前顾问名下客户（含无归属的 seed 演示数据）
// 手机号/敏感字段不导出；年收为日元数字
function csvCell(v) {
  const s = String(v === undefined || v === null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

exports.main = async () => {
  try {
    const openid = cloud.getWXContext().OPENID || '';
    const query = _.or([
      { owner_openid: openid },
      { owner_openid: _.exists(false) },
      { owner_openid: '' }
    ]);

    const res = await db.collection('clients')
      .where(query)
      .orderBy('updated_at', 'desc')
      .limit(200)
      .get();

    const header = ['name', 'occupation', 'annual_income_jpy', 'tags', 'stage', 'updated_at'];
    const rows = res.data.map(c => [
      c.name || '',
      c.occupation || '',
      c.annual_income_jpy || 0,
      (c.tags || []).join('；'),
      c.stage || '',
      c.updated_at ? String(c.updated_at).slice(0, 10) : ''
    ]);

    const csv = [header.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n');
    return { ok: true, csv, count: res.data.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
