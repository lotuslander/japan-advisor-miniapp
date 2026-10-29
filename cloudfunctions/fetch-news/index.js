const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const https = require('https');
const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = 'glm-4-flash';

function translateToZh(jaTitle) {
  return new Promise((resolve) => {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) return resolve('');
    const payload = JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: '你是日中翻译。把下面这条日本政府新闻标题翻译成 1-2 句中文概要，说明它对在日中国人/经营管理签/高度人才/永住/不动产的潜在影响。只输出中文，不要输出原文。' },
        { role: 'user', content: jaTitle }
      ],
      temperature: 0.3
    });
    const req = https.request(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve((j.choices && j.choices[0] && j.choices[0].message.content) || '');
        } catch (e) { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.write(payload);
    req.end();
  });
}

// 新闻/风声源：正式法规落地前的吹风、记者会、审议会资料、行业动向
const NEWS_SOURCES = [
  {
    name: 'isa_press',
    url: 'https://www.moj.go.jp/isa/publications/press/index.html',
    source_name_zh: '出入国在留管理厅 记者发表',
    type: 'official'
  },
  {
    name: 'moj_kisha',
    url: 'https://www.moj.go.jp/hisho/kouhou/',
    source_name_zh: '法务省 记者会见',
    type: 'official'
  },
  {
    name: 'isa_news',
    url: 'https://www.moj.go.jp/isa/publications/news/index.html',
    source_name_zh: '出入国在留管理厅 新闻',
    type: 'official'
  },
  {
    name: 'kisei_kaikaku',
    url: 'https://www8.cao.go.jp/kisei-kaikaku/kisei/index.html',
    source_name_zh: '内阁府 规制改革会议',
    type: 'rumor'
  },
  {
    name: 'mlit_news',
    url: 'https://www.mlit.go.jp/totikensangyo/totikensangyo_tk2_000008.html',
    source_name_zh: '国交省 不动产新闻',
    type: 'official'
  }
];

function fetchPage(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 3) return reject(new Error('redirect limit'));
    const req = https.get(url, { headers: { 'User-Agent': 'AdvisorNewsBot/1.0' } }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve(fetchPage(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

// 从列表页提取标题+链接+日期（日本政府网站常用 <li><a> 列表结构）
function parseList(html, baseUrl) {
  const items = [];
  const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  const dateRe = /(令和\d+年\d+月\d+日|\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/g;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1];
    const title = m[2].trim();
    if (!title || title.length < 8) continue;
    if (title.includes('English') || title.includes('PDF')) continue;
    const absUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
    // 取链接前后 200 字符找日期
    const ctx = html.slice(Math.max(0, m.index - 200), m.index + m[0].length + 50);
    const dates = ctx.match(dateRe);
    items.push({ title, url: absUrl, date: dates ? dates[0] : '' });
  }
  return items;
}

exports.main = async () => {
  const results = { fetched: 0, new: 0, errors: [] };

  for (const src of NEWS_SOURCES) {
    try {
      const html = await fetchPage(src.url);
      const items = parseList(html, src.url).slice(0, 10);
      for (const it of items) {
        // 去重：同 URL 不重复入库
        const exist = await db.collection('news_feed').where({ url: it.url }).count();
        if (exist.total > 0) continue;
        const summary_zh = await translateToZh(it.title);
        await db.collection('news_feed').add({
          data: {
            title_ja: it.title,
            url: it.url,
            source: src.source_name_zh,
            source_type: src.type,
            published_at: it.date,
            summary_zh: summary_zh,
            fetched_at: db.serverDate(),
            read: false
          }
        });
        results.new++;
      }
      results.fetched += items.length;
    } catch (e) {
      results.errors.push(src.name + ': ' + e.message);
    }
  }

  return { ok: true, ...results };
};

