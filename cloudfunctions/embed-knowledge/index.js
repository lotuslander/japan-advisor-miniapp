const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const EMBED_URL = 'https://open.bigmodel.cn/api/paas/v4/embeddings';
const EMBED_MODEL = 'embedding-3';

// ============ 配置区域（云端直存） ============
const CONFIG = {
  api_key: process.env.ZHIPU_API_KEY
};
// ============ 配置结束 ============

function postJson(url, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(bodyObj);
    const req = https.request(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers) }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function embedText(apiKey, text) {
  const d = await postJson(EMBED_URL, { 'Authorization': 'Bearer ' + apiKey }, { model: EMBED_MODEL, input: [text] });
  return d.data[0].embedding;
}

exports.main = async (event) => {
  const apiKey = process.env.ZHIPU_API_KEY || CONFIG.api_key;
  if (!apiKey) return { ok: false, error: '未配置 API Key' };

  const collections = ['policies', 'rejection_cases', 'doc_templates', 'compliance_rules', 'business_rules', 'partners'];
  let total = 0, skipped = 0, failed = 0;
  const progress = [];

  for (const col of collections) {
    try {
      const res = await db.collection(col).limit(200).get();
      let colCount = 0;
      for (const doc of res.data) {
        // 去重：已经embed过的跳过
        const exist = await db.collection('knowledge_vectors')
          .where({ source_collection: col, source_id: doc._id }).count();
        if (exist.total > 0) { skipped++; continue; }

        const text = (doc.title_zh || doc.title || '') + ' ' + (doc.summary || doc.text || doc.description || doc.question || '');
        if (!text.trim()) continue;
        try {
          const vec = await embedText(apiKey, text.slice(0, 800));
          await db.collection('knowledge_vectors').add({
            data: {
              title: doc.title_zh || doc.title || '',
              text: text.slice(0, 500),
              source_collection: col,
              source_id: doc._id,
              url: doc.url || '',
              embedding: vec,
              created_at: new Date()
            }
          });
          total++; colCount++;
        } catch (e) { failed++; }
      }
      progress.push({ collection: col, embedded: colCount });
    } catch (e) {
      progress.push({ collection: col, error: e.message });
    }
  }

  return { ok: true, embedded: total, skipped: skipped, failed: failed, progress: progress };
};
