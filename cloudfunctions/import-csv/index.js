const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// CSV 导入客户：接收 CSV 文本（UTF-8），表头固定
// name,phone,occupation,annual_income_jpy,tags,initial_intent
// tags 用中文分号「；」或英文分号分隔；年收为数字（日元）
// 仅导入姓名必填的行；已存在同名客户跳过（防止重复）
exports.main = async (event) => {
  const text = (event.text || '').trim();
  if (!text) return { ok: false, error: 'CSV 内容为空' };

  try {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return { ok: false, error: '至少需要表头 + 1 行数据' };

    // 表头解析：容错逗号/全角逗号
    const header = lines[0].split(/[,，]/).map(h => h.trim());
    const idx = {};
    ['name', 'phone', 'occupation', 'annual_income_jpy', 'tags', 'initial_intent'].forEach((k, i) => {
      const hit = header.findIndex(h => h.toLowerCase() === k);
      idx[k] = hit >= 0 ? hit : i;
    });

    const openid = cloud.getWXContext().OPENID || '';
    let imported = 0, skipped = 0, errors = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(/[,，]/).map(c => c.trim());
      const name = cells[idx.name] || '';
      if (!name) { skipped++; continue; }

      const income = parseInt(cells[idx.annual_income_jpy] || '0', 10);
      const tags = (cells[idx.tags] || '').split(/[；;]/).map(t => t.trim()).filter(Boolean);
      const intent = cells[idx.initial_intent] || '';

      const dup = await db.collection('clients').where({ name }).count();
      if (dup.total > 0) { skipped++; continue; }

      await db.collection('clients').add({
        data: {
          name,
          stage: 'evaluating',
          occupation: cells[idx.occupation] || '',
          annual_income_jpy: isNaN(income) ? 0 : income,
          tags: tags.length ? tags : (intent ? [intent] : ['导入客户']),
          source_lead_id: '',
          owner_openid: openid,
          imported_from_csv: true,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      });
      imported++;
    }

    return { ok: true, imported, skipped, errors };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
