const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 政策源：日本官方机构，覆盖移民（入管）、不动产（国交省）、税制（国税厅）
// 所有 URL 均已人工核验（2026-09-27）；hsp.html / eijyuu.html 会被安全策略拦截，改用已验证的官方页面
const SOURCES = [
  {
    name: 'isa_bm_reform',
    url: 'https://www.moj.go.jp/isa/applications/resources/10_00237.html',
    category: 'business_manager',
    source_name_zh: '出入国在留管理庁｜経営管理（2025改正）'
  },
  {
    name: 'isa_business_manager',
    url: 'https://www.moj.go.jp/isa/applications/status/businessmanager.html',
    category: 'business_manager',
    source_name_zh: '出入国在留管理庁｜経営管理'
  },
  {
    name: 'isa_kanri_qa',
    url: 'https://www.moj.go.jp/isa/applications/guide/kanri_qa.html',
    category: 'business_manager',
    source_name_zh: '出入国在留管理庁｜経営管理 Q&A'
  },
  {
    name: 'isa_hsp',
    url: 'https://www.moj.go.jp/isa/applications/status/designatedactivities02_00004.html',
    category: 'hsp',
    source_name_zh: '出入国在留管理庁｜高度人材（ポイント制）'
  },
  {
    name: 'isa_jskip',
    url: 'https://www.moj.go.jp/isa/applications/resources/nyuukokukanri01_00009.html',
    category: 'hsp',
    source_name_zh: '出入国在留管理庁｜特別高度人材（J-Skip）'
  },
  {
    name: 'isa_eijyu',
    url: 'https://www.moj.go.jp/isa/applications/resources/nyukan_nyukan50.html',
    category: 'permanent_residence',
    source_name_zh: '出入国在留管理庁｜永住許可ガイドライン'
  },
  {
    name: 'isa_pr_procedure',
    url: 'https://www.moj.go.jp/isa/applications/procedures/16-4.html',
    category: 'permanent_residence',
    source_name_zh: '出入国在留管理庁｜永住許可申請'
  },
  {
    name: 'isa_teiju',
    url: 'https://www.moj.go.jp/isa/applications/status/teijyu.html',
    category: 'long_term_residence',
    source_name_zh: '出入国在留管理庁｜定住'
  },
  {
    name: 'isa_gijinkoku',
    url: 'https://www.moj.go.jp/isa/applications/status/gijinkoku.html',
    category: 'work_visa',
    source_name_zh: '出入国在留管理庁｜技術・人文知識・国際業務'
  },
  {
    name: 'moj_law_immigration',
    url: 'https://www.moj.go.jp/nyuukokukanri/kouhou/nyukan_nyukan06.html',
    category: 'law_immigration',
    source_name_zh: '法務省｜出入国管理政策'
  },
  {
    name: 'moj_press_202510',
    url: 'https://www.moj.go.jp/hisho/kouhou/hisho08_00656.html',
    category: 'law_immigration',
    source_name_zh: '法務省｜記者会見（2025-10-10）'
  },
  {
    name: 'isa_press',
    url: 'https://www.moj.go.jp/isa/publications/press/index.html',
    category: 'law_immigration',
    source_name_zh: '出入国在留管理庁｜プレスリリース'
  },
  {
    name: 'isa_status_index',
    url: 'https://www.moj.go.jp/isa/applications/status/index.html',
    category: 'law_immigration',
    source_name_zh: '出入国在留管理庁｜在留資格一覧'
  },
  {
    name: 'mlit_realestate',
    url: 'https://www.mlit.go.jp/totikensangyo/totikensangyo_tk2_000008.html',
    category: 'realestate',
    source_name_zh: '国土交通省｜不動産取引'
  },
  {
    name: 'nta_individual',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm',
    category: 'tax',
    source_name_zh: '国税庁｜所得税の税率'
  },
  {
    name: 'isa_eizyu_procedure',
    url: 'https://www.moj.go.jp/isa/applications/procedures/eizyuu_00001.html',
    category: 'permanent_residence',
    source_name_zh: '出入国在留管理庁｜永住許可申請（手続）'
  },
  {
    name: 'isa_sousei_taisaku',
    url: 'https://www.moj.go.jp/isa/11_00112.html',
    category: 'permanent_residence',
    source_name_zh: '出入国在留管理庁｜共生総合対応策'
  },
  {
    name: 'isa_bm_online',
    url: 'https://www.moj.go.jp/isa/11_00066.html',
    category: 'business_manager',
    source_name_zh: '出入国在留管理庁｜経営管理オンライン申請新様式'
  },
  {
    name: 'isa_hsp_eval',
    url: 'https://www.moj.go.jp/isa/publications/materials/newimmiact_3_evaluate_index.html',
    category: 'hsp',
    source_name_zh: '出入国在留管理庁｜高度人材ポイント評価'
  },
  {
    name: 'nta_resident_tax',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2392.htm',
    category: 'tax',
    source_name_zh: '国税庁｜居住者・非居住者の課税'
  }
];

const UA = 'AdvisorBot/1.0 (policy monitor)';

// 支持跟随 301/302 重定向（最多 3 跳）
function fetchPage(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 3) return reject(new Error('redirect limit exceeded'));

    const req = https.get(url, {
      headers: { 'User-Agent': UA }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        return resolve(fetchPage(next, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
  });
}

// 提取标题 + 正文摘要，并做简单日期识别
function extractMeta(html, url, category, sourceName, sourceNameZh) {
  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || url;
  const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 优先取正文核心：从 <h1> 或 <title> 文本之后截取，避开顶部导航
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
  let startIdx = 0;
  if (h1) {
    const h1Text = h1.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    startIdx = text.indexOf(h1Text);
    if (startIdx >= 0) startIdx += h1Text.length;
  }
  const bodyStart = startIdx >= 0 ? startIdx : 0;
  const snippet = text.slice(bodyStart, bodyStart + 800);
  const dateMatch = text.match(/(?:最終更新|更新日|最終改定)[：:]?\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);

  return {
    title_ja: title,
    title_zh: '',
    summary: snippet,
    url,
    category,
    source: sourceName,
    source_name_zh: sourceNameZh,
    published_at: dateMatch ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}` : new Date().toISOString().slice(0, 10),
    effective_at: '',
    status: 'pending_review'
  };
}

// 可选 AI 摘要：配置了 ZHIPU_API_KEY 时对抓取内容生成结构化摘要，供顾问审核参考
// 失败不影响主流程（摘要字段留空，人工在审核页自行判断）
function genAiSummary(meta) {
  return new Promise((resolve) => {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) return resolve('');

    const payload = JSON.stringify({
      model: 'glm-4-flash',
      messages: [
        { role: 'system', content: '你是日本移民政策摘要助手。根据给定日本官方政策网页标题与正文片段，输出 120 字以内的中文摘要，格式：\n【要点】…\n【生效/更新】YYYY-MM-DD 或"未注明"\n【对顾问的影响】…\n若信息不足，对应项写"待核验"。不要编造。' },
        { role: 'user', content: '标题：' + meta.title_ja + '\n正文片段：' + meta.summary }
      ],
      temperature: 0.2
    });

    const req = https.request('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices && parsed.choices[0]) resolve(parsed.choices[0].message.content);
          else resolve('');
        } catch (e) { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.setTimeout(15000, () => { req.destroy(); resolve(''); });
    req.write(payload);
    req.end();
  });
}

exports.main = async () => {
  const results = { fetched: 0, new: 0, skipped: 0, errors: [] };

  for (const src of SOURCES) {
    try {
      const html = await fetchPage(src.url);
      results.fetched++;
      const meta = extractMeta(html, src.url, src.category, src.name, src.source_name_zh);

      const dup = await db.collection('policies').where({ url: src.url }).count();
      if (dup.total > 0) {
        results.skipped++;
        continue;
      }
      meta.ai_summary = await genAiSummary(meta);
      await db.collection('policies').add({ data: meta });
      results.new++;
    } catch (e) {
      results.errors.push({ url: src.url, error: e.message });
    }
  }

  return { ok: true, results };
};

