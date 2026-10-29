/**
 * 端侧政策更新引擎
 *
 * 架构：纯端侧（无云函数）+ 用户自填 LLM Key。
 * 流程：取全局政策源清单 → 分批交给大模型 → 模型依据这些官网读取/梳理 → 结构化结果写回本地政策库。
 *
 * 设计要点：
 * 1. 地址清单全部来自 utils/policy-sources.js（单一事实来源），本文件不硬编码任何网址。
 * 2. **防幻觉**：明确告知模型只能引用给定 URL；若模型无联网能力，要求其返回 no_web_access，
 *    而不是编造政策。结果里的 verified 字段用于标记模型是否真的读取了原文。
 * 3. 分批请求：源清单较长，一次全给会被模型忽略，按 BATCH_SIZE 分批，逐批合并。
 * 4. 解析容错：优先 JSON，其次剥离代码块，最后回退到编号文本解析。
 * 5. 结果合并去重后写入 customPolicies，并记录 policyUpdateLog 供页面展示。
 */

const policySources = require('./policy-sources.js');

const CONFIG_KEY = 'llmConfig';
const POLICY_KEY = 'customPolicies';
const LAST_UPDATE_KEY = 'lastPolicyUpdateTime';
const LOG_KEY = 'policyUpdateLog';
const MAX_RECORDS = 200;
const BATCH_SIZE = 12;
const MAX_BATCHES = 6;

// ───────────────────────── 配置 ─────────────────────────

function getConfig() {
  const cfg = wx.getStorageSync(CONFIG_KEY) || {};
  return {
    apiBaseUrl: cfg.apiBaseUrl || 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: cfg.apiKey || '',
    model: cfg.model || 'glm-4-flash'
  };
}

function hasApiKey() {
  return !!getConfig().apiKey;
}

// ───────────────────────── 提示词 ─────────────────────────

const SYSTEM_PROMPT = [
  '你是日本出入国在留管理厅 / 法务省方向的在留政策研究员，服务对象是在中国的日本移民置业顾问。',
  '',
  '【铁律】',
  '1. 你只能依据「用户给出的 URL 清单」判断，不得引用清单以外的网址。',
  '2. 如果你没有实际联网访问这些网页的能力，必须直接返回 {"items":[],"no_web_access":true}，',
  '   绝对不要凭记忆编造政策、条文号或具体日期。',
  '3. 只输出一个 JSON 对象，不要 Markdown 代码块标记，不要任何解释性文字。',
  '',
  '【输出格式】',
  '{',
  '  "items": [',
  '    {',
  '      "title": "政策标题（中文，20字以内）",',
  '      "date": "YYYY-MM-DD（无法确定则空字符串）",',
  '      "category": "business_manager | hsp | permanent_residence | realestate | tax | other",',
  '      "summary": "3-5 句中文，必须包含关键数字与适用条件，不要空话",',
  '      "source_name": "发布机关中文名，如 出入国在留管理庁",',
  '      "source_url": "本次实际参考的 URL，必须来自用户清单",',
  '      "direction": "tighten | relax | clarify | create | info",',
  '      "verified": true',
  '    }',
  '  ],',
  '  "no_web_access": false',
  '}',
  '',
  '【字段说明】',
  '- direction：tighten=收紧、relax=放宽、clarify=明确化、create=新设制度、info=一般信息',
  '- verified：只有你真的读取了该 URL 的正文才填 true；依据推测请填 false',
  '- 每条只讲这一次批次对应来源上出现的新变化，最多 8 条；没有变化就返回空 items'
].join('\n');

function buildUserPrompt(batch, batchIndex, batchTotal, days) {
  const lines = [];
  lines.push(`本次为第 ${batchIndex + 1}/${batchTotal} 批，请核查以下 ${batch.length} 个官方来源：`);
  lines.push('');
  lines.push(policySources.formatSourcesForPrompt(batch));
  lines.push('');
  lines.push(`时间范围：截至今天，最近 ${days} 天内的新政策、修订、告示、新闻稿。`);
  lines.push('主题范围：日本在留资格、经营管理签证、高度人材积分制、永住、不动产投资、相关税制。');
  lines.push('');
  lines.push('请严格按系统提示的 JSON 格式输出。');
  return lines.join('\n');
}

// ───────────────────────── 请求 ─────────────────────────

function requestOnce(config, systemPrompt, userPrompt) {
  return new Promise((resolve) => {
    wx.request({
      url: config.apiBaseUrl + '/chat/completions',
      method: 'POST',
      timeout: 60000,
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey
      },
      data: {
        model: config.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.choices && res.data.choices[0]) {
          const msg = res.data.choices[0].message || {};
          resolve({ ok: true, content: msg.content || '' });
        } else {
          resolve({
            ok: false,
            error: 'HTTP ' + res.statusCode,
            detail: (res.data && res.data.error && res.data.error.message) || ''
          });
        }
      },
      fail: (err) => {
        resolve({ ok: false, error: (err && err.errMsg) || '网络异常' });
      }
    });
  });
}

// ───────────────────────── 解析 ─────────────────────────

function stripFence(text) {
  let t = String(text || '').trim();
  // 去掉 ```json ... ``` / ``` ... ```
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'');
  return t.trim();
}

function extractJson(text) {
  const t = stripFence(text);
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return t.slice(start, end + 1);
  }
  return t;
}

function normalizeDate(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const m = s.match(/(\d{4})[-/年.]?\s*(\d{1,2})[-/月.]?\s*(\d{1,2})/);
  if (!m) return '';
  const mm = String(m[2]).padStart(2, '0');
  const dd = String(m[3]).padStart(2, '0');
  return `${m[1]}-${mm}-${dd}`;
}

function normalizeDirection(v) {
  const s = String(v || '').toLowerCase().trim();
  const allow = ['tighten', 'relax', 'clarify', 'create', 'info'];
  return allow.indexOf(s) >= 0 ? s : 'info';
}

function normalizeCategory(v) {
  const s = String(v || '').toLowerCase().trim();
  const allow = ['business_manager', 'hsp', 'permanent_residence', 'realestate', 'tax', 'other'];
  return allow.indexOf(s) >= 0 ? s : 'other';
}

function makeId(seed, index) {
  return 'ai-' + seed + '-' + index;
}

function toRecord(raw, seedTs, index) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim();
  if (!title) return null;

  const summary = String(raw.summary || '').trim();
  const sourceUrl = String(raw.source_url || raw.url || '').trim();
  const matched = policySources.findByUrl(sourceUrl);
  const sourceName = String(raw.source_name || (matched ? matched.name : '') || 'AI 整理').trim();
  const direction = normalizeDirection(raw.direction);
  const category = normalizeCategory(raw.category || (matched ? matched.category : 'other'));

  return {
    id: makeId(seedTs, index),
    title_zh: title,
    title_ja: '',
    summary: summary,
    source: sourceName,
    source_url: sourceUrl,
    date: normalizeDate(raw.date),
    is_current: true,
    direction: direction,
    directionLabel: policySources.directionLabel(direction),
    category: category,
    verified: raw.verified === true,
    aiGenerated: true,
    fetchedAt: seedTs
  };
}

/** 编号文本回退解析：模型没按 JSON 输出时兜底 */
function parseNumberedText(text, seedTs) {
  const cleaned = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];
  const marker = /^\s*(?:\d{1,2}\s*[.、)．]|[一二三四五六七八九十]\s*[、.．])\s*/;
  const blocks = [];
  let current = null;
  cleaned.split('\n').forEach((line) => {
    if (marker.test(line)) {
      current = [line.replace(marker, '').trim()];
      blocks.push(current);
    } else if (current) {
      if (line.trim()) current.push(line.trim());
    } else {
      current = [line.trim()];
      blocks.push(current);
    }
  });

  const out = [];
  blocks.forEach((lines, i) => {
    const body = lines.filter((l) => l.length > 0);
    if (body.length === 0) return;
    const title = body[0].slice(0, 60);
    const urlLine = body.find((l) => /https?:\/\//.test(l));
    const dateLine = body.find((l) => /日期|date/i.test(l));
    const urlMatch = urlLine ? urlLine.match(/https?:\/\/[^\s)]+/) : null;
    const summary = body.slice(1).filter((l) => l !== urlLine && l !== dateLine).join('\n');
    out.push({
      title: title,
      summary: summary || title,
      source_url: urlMatch ? urlMatch[0] : '',
      source_name: '',
      date: dateLine ? normalizeDate(dateLine) : '',
      direction: 'info',
      category: 'other',
      verified: false
    });
  });
  return out.map((r, i) => toRecord(r, seedTs, i)).filter((r) => !!r).slice(0, 8);
}

/**
 * 解析模型返回，得到规范化记录数组。
 * @returns {{records: Array, noWebAccess: boolean, parseMode: string}}
 */
function parseResponse(content, seedTs) {
  const text = String(content || '').trim();
  if (!text) return { records: [], noWebAccess: false, parseMode: 'empty' };

  // 1) JSON
  try {
    const jsonText = extractJson(text);
    const obj = JSON.parse(jsonText);
    const items = Array.isArray(obj) ? obj : (obj.items || []);
    const noWeb = !!(obj && obj.no_web_access);
    const records = items
      .map((raw, i) => toRecord(raw, seedTs, i))
      .filter((r) => !!r)
      .slice(0, 8);
    return { records: records, noWebAccess: noWeb, parseMode: 'json' };
  } catch (e) {
    // 落到文本解析
  }

  // 2) 文本里的 no_web_access 关键字
  if (/no_web_access"?\s*:\s*true/i.test(text)) {
    return { records: [], noWebAccess: true, parseMode: 'flag' };
  }

  // 3) 编号文本回退
  const fallback = parseNumberedText(text, seedTs);
  return { records: fallback, noWebAccess: false, parseMode: fallback.length ? 'text' : 'unparsed' };
}

// ───────────────────────── 存储 ─────────────────────────

function readPolicies() {
  const list = wx.getStorageSync(POLICY_KEY);
  return Array.isArray(list) ? list : [];
}

/** 读取任意存储键下的列表（引擎可复用于政策 / 案例） */
function readList(key) {
  const list = wx.getStorageSync(key || POLICY_KEY);
  return Array.isArray(list) ? list : [];
}

function dedupeKey(rec) {
  const t = String(rec.title_zh || '').replace(/\s+/g, '').toLowerCase();
  const d = rec.date || '';
  return t + '|' + d;
}

function mergePolicies(existing, incoming) {
  const seen = {};
  existing.forEach((p) => { seen[dedupeKey(p)] = true; });

  const added = [];
  incoming.forEach((rec) => {
    const key = dedupeKey(rec);
    if (seen[key]) return;
    seen[key] = true;
    added.push(rec);
  });

  const merged = added.concat(existing).slice(0, MAX_RECORDS);
  return { merged: merged, added: added };
}

function writeLog(keyOrEntry, maybeEntry) {
  const key = typeof keyOrEntry === 'string' ? keyOrEntry : LOG_KEY;
  const entry = typeof keyOrEntry === 'string' ? maybeEntry : keyOrEntry;
  const log = wx.getStorageSync(key);
  const list = Array.isArray(log) ? log : [];
  list.unshift(entry);
  wx.setStorageSync(key, list.slice(0, 20));
}

// ───────────────────────── 主流程 ─────────────────────────

/**
 * 执行一次政策更新。
 *
 * @param {Object} options
 * @param {number}  [options.days=30]      回看天数
 * @param {Array}   [options.sources]      自定义源清单（默认全量）
 * @param {boolean} [options.useCaseSources=false] 是否同时跑案例源
 * @param {Function} [options.onProgress]  (text, done, total) => void
 * @param {Function} [options.onSuccess]   (result) => void
 * @param {Function} [options.onError]     (message) => void
 * @returns {Promise<Object>} 结果统计
 */
function run(options) {
  const opts = options || {};
  const days = opts.days || 30;
  const storageKey = opts.storageKey || POLICY_KEY;
  const lastUpdateKey = opts.lastUpdateKey || LAST_UPDATE_KEY;
  const logKey = opts.logKey || LOG_KEY;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
  const onSuccess = typeof opts.onSuccess === 'function' ? opts.onSuccess : function () {};
  const onError = typeof opts.onError === 'function' ? opts.onError : function () {};

  const config = getConfig();
  if (!config.apiKey) {
    const msg = '请先在「API 配置」中填写 API Key';
    onError(msg);
    return Promise.resolve({ ok: false, error: 'NO_API_KEY', message: msg, added: 0 });
  }

  const sources = Array.isArray(opts.sources) && opts.sources.length > 0
    ? opts.sources
    : policySources.allPolicySources();

  // 分批
  const batches = [];
  for (let i = 0; i < sources.length && batches.length < MAX_BATCHES; i += BATCH_SIZE) {
    batches.push(sources.slice(i, i + BATCH_SIZE));
  }

  const seedTs = Date.now();
  const startedAt = seedTs;
  const matched = [];
  let noWebAccess = false;
  let parseModes = [];
  let failed = 0;
  let globalIndex = 0;

  onProgress('准备核查 ' + sources.length + ' 个官方来源（分 ' + batches.length + ' 批）', 0, batches.length);

  // 串行执行，避免并发触发限流
  let chain = Promise.resolve();
  batches.forEach((batch, bi) => {
    chain = chain.then(() => {
      onProgress('第 ' + (bi + 1) + '/' + batches.length + ' 批：正在请求大模型…', bi, batches.length);
      const userPrompt = buildUserPrompt(batch, bi, batches.length, days);

      return requestOnce(config, SYSTEM_PROMPT, userPrompt).then((res) => {
        if (!res.ok) {
          failed++;
          onProgress('第 ' + (bi + 1) + ' 批失败：' + res.error, bi + 1, batches.length);
          return;
        }
        const parsed = parseResponse(res.content, seedTs);
        parseModes.push(parsed.parseMode);
        if (parsed.noWebAccess) noWebAccess = true;

        parsed.records.forEach((rec) => {
          rec.id = makeId(seedTs, globalIndex++);
          matched.push(rec);
        });

        onProgress(
          '第 ' + (bi + 1) + '/' + batches.length + ' 批完成，解析 ' + parsed.records.length + ' 条',
          bi + 1,
          batches.length
        );
      });
    });
  });

  return chain.then(() => {
    const existing = readList(storageKey);
    const result = mergePolicies(existing, matched);

    if (result.added.length > 0) {
      wx.setStorageSync(storageKey, result.merged);
    }
    wx.setStorageSync(lastUpdateKey, Date.now());

    const summary = {
      ok: result.added.length > 0,
      added: result.added.length,
      parsed: matched.length,
      skipped: matched.length - result.added.length,
      batches: batches.length,
      failed: failed,
      sources: sources.length,
      noWebAccess: noWebAccess,
      parseModes: parseModes,
      model: config.model,
      elapsedMs: Date.now() - startedAt,
      updatedAt: Date.now()
    };

    writeLog(logKey, {
      at: summary.updatedAt,
      added: summary.added,
      parsed: summary.parsed,
      batches: summary.batches,
      failed: summary.failed,
      noWebAccess: noWebAccess,
      model: summary.model,
      kind: storageKey
    });

    if (noWebAccess && result.added.length === 0) {
      const msg = '当前模型无法访问外部网页（或已声明 no_web_access），未获取到政策。'
        + '请改用具备联网/检索能力的大模型，或换用支持 Web 检索的接口。';
      onError(msg);
      summary.message = msg;
      return summary;
    }
    if (result.added.length === 0) {
      const msg = failed === batches.length
        ? '请求失败，请检查 API Key、Base URL 与网络'
        : '本次未发现新增政策（' + sources.length + ' 个来源已核查）';
      summary.message = msg;
      onError(msg);
      return summary;
    }

    onSuccess(summary);
    return summary;
  }).catch((err) => {
    const msg = '更新异常：' + ((err && err.message) || err);
    onError(msg);
    return { ok: false, error: 'EXCEPTION', message: msg, added: 0 };
  });
}

/**
 * 到期检查：超过 days 天未更新则弹窗提示。
 */
function checkAutoUpdate(days, onNeedUpdate) {
  const interval = (days || 7) * 24 * 60 * 60 * 1000;
  const last = wx.getStorageSync(LAST_UPDATE_KEY);
  const now = Date.now();
  if (last && now - last < interval) return false;

  wx.showModal({
    title: '政策更新提醒',
    content: '距上次政策更新已超过 ' + (days || 7) + ' 天，是否现在核查 ' +
      policySources.allPolicySources().length + ' 个官方网站的最新政策？',
    confirmText: '立即更新',
    cancelText: '稍后再说',
    success: (res) => {
      if (res.confirm) {
        wx.setStorageSync(LAST_UPDATE_KEY, now);
        if (typeof onNeedUpdate === 'function') onNeedUpdate();
      }
    }
  });
  return true;
}

/** 清空 AI 更新得到的政策（保留内置政策） */
function clearAiPolicies() {
  wx.setStorageSync(POLICY_KEY, []);
  writeLog({ at: Date.now(), added: 0, cleared: true });
}

/** 最近一次更新时间（0 表示从未更新） */
function lastUpdateTime() {
  const v = wx.getStorageSync(LAST_UPDATE_KEY);
  return typeof v === 'number' ? v : 0;
}

/** 更新日志（倒序） */
function updateLog() {
  const log = wx.getStorageSync(LOG_KEY);
  return Array.isArray(log) ? log : [];
}

module.exports = {
  getConfig,
  hasApiKey,
  run,
  checkAutoUpdate,
  lastUpdateTime,
  updateLog,
  clearAiPolicies,
  readPolicies,
  // 便于测试
  parseResponse,
  mergePolicies,
  normalizeDate,
  SYSTEM_PROMPT
};
