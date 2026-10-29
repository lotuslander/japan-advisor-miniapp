const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const CHAT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = 'glm-4-flash';

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

exports.main = async (event) => {
  const { policyText, policyTitle } = event;
  if (!policyText) return { ok: false, error: 'policyText 必填' };
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) return { ok: false, error: '未配置 ZHIPU_API_KEY' };

  const d = await postJson(CHAT_URL, { 'Authorization': 'Bearer ' + apiKey }, {
    model: MODEL,
    messages: [
      { role: 'system', content: '你是日本移民政策研究员。把政策原文提炼成顾问能快速看懂的摘要，分四段：【变化要点】【影响谁】【什么时候生效】【顾问要做什么】。要具体。' },
      { role: 'user', content: `政策标题：${policyTitle || ''}\n政策原文：${policyText}` }
    ],
    temperature: 0.3
  });

  return { ok: true, summary: d.choices[0].message.content };
};

