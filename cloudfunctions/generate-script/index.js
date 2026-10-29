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
  const { stage, clientName, path } = event;
  if (!stage) return { ok: false, error: 'stage 必填' };
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) return { ok: false, error: '未配置 ZHIPU_API_KEY' };

  const d = await postJson(CHAT_URL, { 'Authorization': 'Bearer ' + apiKey }, {
    model: MODEL,
    messages: [
      { role: 'system', content: '你是资深移民顾问，擅长写客户沟通话术。亲切、不施压、说人话，200字左右。' },
      { role: 'user', content: `客户：${clientName || '某先生'}\n路径：${path || '经营管理签'}\n阶段：${stage}\n\n请写一段微信跟进话术，告诉客户现在进展、下一步做什么、大概时间。` }
    ],
    temperature: 0.7
  });

  return { ok: true, script: d.choices[0].message.content };
};

