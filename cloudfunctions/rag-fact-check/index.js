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

// RAG事实校验：把AI回答的关键断言和原始资料做交叉比对
exports.main = async (event) => {
  const { answer, references } = event;
  if (!answer) return { ok: false, error: 'answer 必填' };
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) return { ok: false, error: '未配置 ZHIPU_API_KEY' };

  const refText = (references || []).map(r => r.title + ': ' + (r.summary || '')).join('\n');

  const d = await postJson(CHAT_URL, { 'Authorization': 'Bearer ' + apiKey }, {
    model: MODEL,
    messages: [
      { role: 'system', content: '你是事实核查员。把下面AI回答里的关键断言（数字、年限、条件、法条）提取出来，和参考资料比对，判定每条是【匹配】【部分偏差】【冲突】。输出JSON数组。' },
      { role: 'user', content: `AI回答：\n${answer}\n\n参考资料：\n${refText}\n\n请输出JSON：[{claim:"断言", verdict:"匹配/部分偏差/冲突", note:"说明"}]` }
    ],
    temperature: 0.1
  });

  let checks = [];
  try {
    const m = d.choices[0].message.content.match(/\[[\s\S]*\]/);
    if (m) checks = JSON.parse(m[0]);
  } catch (e) { checks = []; }

  const conflictCount = checks.filter(c => c.verdict === '冲突').length;
  return {
    ok: true,
    checks: checks,
    has_conflict: conflictCount > 0,
    summary: conflictCount > 0 ? `发现${conflictCount}处与资料冲突，建议人工复核` : '未发现明显冲突'
  };
};

