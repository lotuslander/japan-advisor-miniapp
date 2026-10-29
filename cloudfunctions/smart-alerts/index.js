const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 每天自动扫描客户库，找需要提醒顾问的风险和机会
exports.main = async () => {
  const alerts = [];
  const now = new Date();

  // 1. 超过30天没跟进的客户
  try {
    const oldClients = await db.collection('clients').where({ status: 'active' }).limit(50).get();
    oldClients.data.forEach(c => {
      if (c.last_contact) {
        const days = (now - new Date(c.last_contact)) / (1000*60*60*24);
        if (days > 30) {
          alerts.push({ level: 'warning', type: '久未跟进', message: `${c.name} 已${Math.floor(days)}天没联系，建议跟进`, client_id: c._id });
        }
      }
    });
  } catch (e) {}

  // 2. 30天内到节点的客户
  try {
    const expiring = await db.collection('clients').where({ stage: 'in_progress' }).limit(50).get();
    expiring.data.forEach(c => {
      if (c.expected_at) {
        const days = (new Date(c.expected_at) - now) / (1000*60*60*24);
        if (days > 0 && days < 30) {
          alerts.push({ level: 'info', type: '临近节点', message: `${c.name} 的节点 ${c.expected_at} 还有${Math.floor(days)}天`, client_id: c._id });
        }
      }
    });
  } catch (e) {}

  // 3. 政策窗口期提醒
  alerts.push({ level: 'opportunity', type: '政策窗口', message: '永住3年特例2027年4月废止，检查客户里有没有符合条件的', client_id: null });

  return { ok: true, alerts: alerts };
};
