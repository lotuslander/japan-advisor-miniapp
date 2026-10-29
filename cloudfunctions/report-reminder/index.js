// 档期报告定时提醒：每3天扫描进行中客户，提醒顾问该发报告了
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const _ = db.command;
  // 找进行中的客户（stage在evaluating到approved之间）
  const activeStages = ['evaluating', 'confirmed', 'documents', 'submitted', 'reviewing'];
  const res = await db.collection('clients').where({
    stage: _.in(activeStages),
    email: _.exists(true)
  }).limit(50).get();

  const now = new Date();
  const reminders = [];

  for (const c of res.data) {
    // 上次发报告时间
    const lastSent = c.last_report_sent_at ? new Date(c.last_report_sent_at) : null;
    const daysSince = lastSent ? (now - lastSent) / (1000 * 60 * 60 * 24) : 999;

    if (daysSince >= 3) {
      reminders.push({
        client_id: c._id,
        client_name: c.name,
        email: c.email,
        stage: c.stage,
        days_since_last: Math.round(daysSince),
        action: '请发送档期报告给客户'
      });
    }
  }

  // 更新提醒记录
  if (reminders.length > 0) {
    await db.collection('report_reminders').add({
      data: {
        created_at: now,
        reminders: reminders,
        count: reminders.length
      }
    });
  }

  return {
    ok: true,
    reminder_count: reminders.length,
    reminders: reminders
  };
};
