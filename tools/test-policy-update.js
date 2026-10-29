// 端侧政策更新引擎测试：地址清单完整性、分批、提示词包含全部 URL、解析、合并去重、异常分支
const path = require('path');

const ROOT = process.argv[2] || '.';
const MP = path.join(ROOT, 'miniprogram');

const lines = [];
let failures = 0;
function ok(name, extra) { lines.push(`  PASS  ${name}${extra ? '  ' + extra : ''}`); }
function bad(name, why) { lines.push(`  FAIL  ${name}  -> ${why}`); failures++; }
function assert(cond, name, extra, failWhy) {
  if (cond) ok(name, extra); else bad(name, failWhy || '断言失败');
}

// ───────── 构造 wx 桩 ─────────
function makeEnv(opts) {
  const o = opts || {};
  const storage = new Map();
  const requests = [];

  const wx = {
    getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
    setStorageSync: (k, v) => { storage.set(k, v); },
    removeStorageSync: (k) => { storage.delete(k); },
    showToast: () => {},
    showModal: (cfg) => {
      // 同步自动确认，便于测试后续流程
      if (cfg && typeof cfg.success === 'function') cfg.success({ confirm: true, cancel: false });
    },
    setClipboardData: () => {},
    navigateTo: () => {},
    request: (cfg) => {
      requests.push(cfg);
      const idx = requests.length - 1;
      const resp = o.responder ? o.responder(cfg, idx) : { statusCode: 200, data: { choices: [{ message: { content: '{"items":[]}' } }] } };
      setTimeout(() => {
        if (resp && resp.fail) {
          if (cfg.fail) cfg.fail(resp.fail);
          return;
        }
        if (cfg.success) cfg.success(resp);
      }, 0);
    }
  };

  return { wx, storage, requests };
}

function freshModules(env) {
  global.wx = env.wx;
  const srcPath = path.join(MP, 'utils', 'policy-sources.js');
  const updaterPath = path.join(MP, 'utils', 'ai-updater.js');
  delete require.cache[require.resolve(srcPath)];
  delete require.cache[require.resolve(updaterPath)];
  return {
    sources: require(srcPath),
    updater: require(updaterPath)
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // ───────── 1. 地址清单完整性 ─────────
  {
    const env = makeEnv();
    const { sources } = freshModules(env);

    const all = sources.allPolicySources();
    assert(all.length > 0, '政策源清单非空', `${all.length} 个`);

    const urls = all.map((s) => s.url);
    assert(new Set(urls).size === urls.length, '政策源 URL 无重复', `${new Set(urls).size}/${urls.length}`);

    const badProto = all.filter((s) => !/^https:\/\//.test(s.url));
    assert(badProto.length === 0, '全部使用 https 完整地址',
      badProto.length ? badProto.map((s) => s.url).join(',') : '');

    // 关键：20 条深链必须全部保留
    assert(sources.DEEP_SOURCES.length === 20, '深链保留 20 条', `${sources.DEEP_SOURCES.length}`);
    const deepUrls = sources.DEEP_SOURCES.map((s) => s.url);
    const missingDeep = deepUrls.filter((u) => !urls.includes(u));
    assert(missingDeep.length === 0, '深链全部进入全量清单',
      missingDeep.length ? missingDeep.join(',') : '');

    // 28 个机构官网必须全部保留
    assert(sources.ORG_SOURCES.length === 28, '机构官网保留 28 条', `${sources.ORG_SOURCES.length}`);
    const orgUrls = sources.ORG_SOURCES.map((s) => s.url);
    const missingOrg = orgUrls.filter((u) => !urls.includes(u));
    assert(missingOrg.length === 0, '机构官网全部进入全量清单',
      missingOrg.length ? missingOrg.join(',') : '');

    // 25 条历史裸域名保留
    assert(sources.LEGACY_DOMAIN_HINTS.length === 25, '历史域名提示保留 25 条',
      `${sources.LEGACY_DOMAIN_HINTS.length}`);

    // 案例源：7 条且全部是可检索的确切 https 地址
    const caseSources = sources.allCaseSources();
    assert(caseSources.length === 7, '案例源 7 条', `${caseSources.length}`);

    const badCase = caseSources.filter((s) => !/^https:\/\/.+/.test(s.url));
    assert(badCase.length === 0, '案例源全部带完整 https 地址',
      badCase.length ? badCase.map((s) => s.id + ':' + (s.url || '(空)')).join(', ') : '7/7');

    const caseUrls = caseSources.map((s) => s.url);
    assert(new Set(caseUrls).size === caseUrls.length, '案例源地址无重复', `${new Set(caseUrls).size}/${caseUrls.length}`);

    // 原先 3 条空地址必须已补齐
    const mustHave = ['case-courts', 'case-courts-search', 'case-nta-kazei', 'case-nta-shoso',
      'case-tokyo-gyosei', 'case-osaka-gyosei', 'case-soumu-fufuku'];
    const missingCase = mustHave.filter((id) => {
      const hit = caseSources.find((s) => s.id === id);
      return !hit || !hit.url;
    });
    assert(missingCase.length === 0, '7 条案例源 id 齐全且均有地址',
      missingCase.length ? missingCase.join(',') : mustHave.length + '/7');

    // 格式化文本含全部 URL
    const text = sources.formatSourcesForPrompt(all);
    const missingInText = urls.filter((u) => text.indexOf(u) < 0);
    assert(missingInText.length === 0, '提示词文本包含全部 URL',
      missingInText.length ? `缺 ${missingInText.length} 条` : `${urls.length}/${urls.length}`);
  }

  // ───────── 2. 未配置 API Key ─────────
  {
    const env = makeEnv();
    const { updater } = freshModules(env);
    let errMsg = '';
    const res = await updater.run({ onError: (m) => { errMsg = m; } });
    assert(res.ok === false && res.error === 'NO_API_KEY', '未配置 Key 时直接返回 NO_API_KEY', res.error);
    assert(errMsg.indexOf('API Key') >= 0, '未配置 Key 有可读错误提示', errMsg);
    assert(env.requests.length === 0, '未配置 Key 不发请求', `${env.requests.length}`);
  }

  // ───────── 3. 正常流程：分批 + 提示词含 URL + 写库 ─────────
  {
    const env = makeEnv({
      responder: (cfg) => {
        // 按提示词里的「第 N/M 批」生成，保证两次运行内容一致，才能测去重
        const userMsg = cfg.data.messages.find((m) => m.role === 'user').content;
        const mb = userMsg.match(/第\s*(\d+)\s*\/\s*(\d+)\s*批/);
        const n = mb ? Number(mb[1]) : 1;
        const items = [
          {
            title: `第${n}批政策`,
            date: '2026-10-' + String(10 + n).padStart(2, '0'),
            category: 'business_manager',
            summary: `第${n}批的摘要，资本金 3000 万日元。`,
            source_name: '出入国在留管理庁',
            source_url: 'https://www.moj.go.jp/isa/applications/resources/10_00237.html',
            direction: 'tighten',
            verified: true
          }
        ];
        return { statusCode: 200, data: { choices: [{ message: { content: JSON.stringify({ items, no_web_access: false }) } }] } };
      }
    });
    const { sources, updater } = freshModules(env);

    env.storage.set('llmConfig', { apiBaseUrl: 'https://api.test/v1', apiKey: 'k-test', model: 'm-test' });

    const all = sources.allPolicySources();
    const progress = [];
    const res = await updater.run({
      days: 30,
      onProgress: (t, d, total) => progress.push({ t, d, total })
    });

    assert(res.ok === true, '正常流程返回成功', `added=${res.added}`);
    assert(res.batches === Math.ceil(all.length / 12), '分批数正确',
      `${res.batches} 批 / ${all.length} 源`);

    // 每次请求的 user prompt 必须包含该批次全部 URL
    let urlCoverageOk = true;
    let coverageDetail = '';
    const seenUrls = new Set();
    env.requests.forEach((cfg, i) => {
      const userMsg = cfg.data.messages.find((m) => m.role === 'user').content;
      const batchUrls = [];
      all.forEach((s) => { if (userMsg.indexOf(s.url) >= 0) batchUrls.push(s.url); });
      batchUrls.forEach((u) => seenUrls.add(u));
      if (batchUrls.length === 0) { urlCoverageOk = false; coverageDetail = `第${i + 1}批没带任何 URL`; }
    });
    assert(urlCoverageOk, '每批提示词都携带 URL', coverageDetail);
    assert(seenUrls.size === all.length, '全部源 URL 均被覆盖发出',
      `${seenUrls.size}/${all.length}`);

    // system prompt 含防幻觉约束
    const sys = env.requests[0].data.messages.find((m) => m.role === 'system').content;
    assert(sys.indexOf('no_web_access') >= 0, '系统提示含 no_web_access 约定');
    assert(sys.indexOf('不得引用清单以外') >= 0 || sys.indexOf('清单以外') >= 0, '系统提示含来源约束');

    assert(progress.length > 0, '有进度回调', `${progress.length} 次`);
    assert(env.requests[0].header.Authorization === 'Bearer k-test', 'Authorization 头正确');

    const stored = env.storage.get('customPolicies');
    assert(Array.isArray(stored) && stored.length === res.batches, '结果写入 customPolicies',
      `${Array.isArray(stored) ? stored.length : 'not-array'} 条`);

    const first = stored[0];
    assert(first.title_zh && first.summary && first.directionLabel, '记录字段完整',
      `${first.title_zh} / ${first.directionLabel}`);
    assert(first.aiGenerated === true && first.is_current === true, '记录打上 AI 标记');
    assert(first.verified === true, 'verified 透传');
    assert(env.storage.get('lastPolicyUpdateTime') > 0, '记录上次更新时间');
    const log = env.storage.get('policyUpdateLog');
    assert(Array.isArray(log) && log.length === 1, '写入更新日志');

    // ───────── 4. 二次运行去重 ─────────
    const res2 = await updater.run({ days: 30 });
    assert(res2.added === 0, '相同内容二次运行不重复入库', `added=${res2.added}, skipped=${res2.skipped}`);
    assert(res2.skipped > 0, '重复条目被计入 skipped', `${res2.skipped}`);
    const stored2 = env.storage.get('customPolicies');
    assert(stored2.length === stored.length, '去重后总数不变', `${stored2.length}`);
  }

  // ───────── 5. no_web_access 分支 ─────────
  {
    const env = makeEnv({
      responder: () => ({
        statusCode: 200,
        data: { choices: [{ message: { content: '{"items":[],"no_web_access":true}' } }] }
      })
    });
    const { updater } = freshModules(env);
    env.storage.set('llmConfig', { apiBaseUrl: 'https://api.test/v1', apiKey: 'k', model: 'm' });

    let errMsg = '';
    const res = await updater.run({ onError: (m) => { errMsg = m; } });
    assert(res.noWebAccess === true, '识别 no_web_access 标记');
    assert(res.added === 0, 'no_web_access 时不写库', `${res.added}`);
    assert(errMsg.indexOf('联网') >= 0 || errMsg.indexOf('无法访问') >= 0,
      '给出「模型无联网能力」的明确提示', errMsg);
    assert(!env.storage.get('customPolicies'), '未产生脏数据');
  }

  // ───────── 6. 文本回退解析 ─────────
  {
    const env = makeEnv({
      responder: () => ({
        statusCode: 200,
        data: {
          choices: [{
            message: {
              content: '1. 经营管理签证资本金上调\n资本金需 3000 万日元以上。\n来源：出入国在留管理庁\n日期：2026-09-01\n\n2. 高度人材积分调整\n积分计算新增成长分野加分。\n日期：2026-08-15'
            }
          }]
        }
      })
    });
    const { updater } = freshModules(env);
    env.storage.set('llmConfig', { apiBaseUrl: 'https://api.test/v1', apiKey: 'k', model: 'm' });

    const res = await updater.run({ days: 30 });
    assert(res.added > 0, '非 JSON 输出可回退解析', `added=${res.added}`);
    const stored = env.storage.get('customPolicies') || [];
    assert(stored.length > 0 && stored[0].title_zh.length > 0, '回退解析得到标题', stored[0] && stored[0].title_zh);
    assert(typeof stored[0].date === 'string', '回退解析日期规范化为字符串', stored[0] && stored[0].date);
  }

  // ───────── 7. HTTP 失败 ─────────
  {
    const env = makeEnv({ responder: () => ({ statusCode: 401, data: { error: { message: 'invalid api key' } } }) });
    const { updater } = freshModules(env);
    env.storage.set('llmConfig', { apiBaseUrl: 'https://api.test/v1', apiKey: 'bad', model: 'm' });

    let errMsg = '';
    const res = await updater.run({ onError: (m) => { errMsg = m; } });
    assert(res.ok === false && res.added === 0, 'HTTP 401 不写库', `failed=${res.failed}`);
    assert(errMsg.length > 0, 'HTTP 失败有错误提示', errMsg);
  }

  // ───────── 8. 消费端：timeline / policy-review 能读到 ─────────
  {
    const env = makeEnv({
      responder: () => ({
        statusCode: 200,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                items: [{
                  title: '资本金要件上调至3000万',
                  date: '2026-10-01',
                  category: 'business_manager',
                  summary: '自2026年起经营管理签证资本金门槛上调。',
                  source_name: '出入国在留管理庁',
                  source_url: 'https://www.moj.go.jp/isa/applications/resources/10_00237.html',
                  direction: 'tighten',
                  verified: true
                }],
                no_web_access: false
              })
            }
          }]
        }
      })
    });
    const { updater } = freshModules(env);
    env.storage.set('llmConfig', { apiBaseUrl: 'https://api.test/v1', apiKey: 'k', model: 'm' });
    await updater.run({ days: 30 });

    // 用同一套 wx 桩加载页面
    global.wx = env.wx;
    global.getApp = () => ({ globalData: {} });

    function loadPage(rel) {
      const abs = path.join(MP, rel);
      const pageDir = path.dirname(abs);
      let captured = null;
      const code = require('fs').readFileSync(abs, 'utf8');
      const mod = { exports: {} };
      // 相对路径按页面所在目录解析（与小程序运行时的 require 基准一致）
      const sandboxRequire = (spec) => {
        if (spec.startsWith('.')) return require(path.resolve(pageDir, spec));
        return require(spec);
      };
      const fn = new Function('require', 'Page', 'Component', 'wx', 'getApp', 'console', 'module', 'exports',
        code);
      fn(sandboxRequire, (cfg) => { captured = cfg; }, () => {}, env.wx, global.getApp, console, mod, mod.exports);
      return captured;
    }

    function instantiate(cfg) {
      const vm = Object.assign({}, cfg);
      vm.data = JSON.parse(JSON.stringify(cfg.data));
      vm.setData = function (patch, cb) {
        Object.keys(patch).forEach((k) => { this.data[k] = patch[k]; });
        if (typeof cb === 'function') cb.call(this);
      };
      return vm;
    }

    // timeline
    const tl = loadPage('pages/timeline/timeline.js');
    const tlVm = instantiate(tl);
    tl.onLoad.call(tlVm);
    const aiNodes = tlVm.data.nodes.filter((n) => n.isAI);
    assert(aiNodes.length === 1, 'timeline 合并到 AI 政策', `${aiNodes.length} 条`);
    assert(tlVm.data.aiCount === 1, 'timeline aiCount 正确', `${tlVm.data.aiCount}`);
    assert(aiNodes[0].category === 'business_manager', 'timeline 使用 AI 记录的分类', aiNodes[0].category);

    // 分类筛选生效
    tl.switchCat.call(tlVm, { currentTarget: { dataset: { key: 'business_manager' } } });
    assert(tlVm.data.nodes.length >= 1, 'timeline 分类筛选后仍有该条', `${tlVm.data.nodes.length}`);
    tl.switchCat.call(tlVm, { currentTarget: { dataset: { key: 'realestate' } } });
    assert(tlVm.data.nodes.filter((n) => n.isAI).length === 0, 'timeline 切到不相关分类会过滤掉');

    // policy-review 列表
    const pr = loadPage('pages/policy-review/policy-review.js');
    const prVm = instantiate(pr);
    pr.onLoad.call(prVm, {});
    const aiInList = prVm.data.list.filter((x) => x.catLabel === 'AI 联网整理');
    assert(aiInList.length === 1, 'policy-review 列表包含 AI 条目', `${aiInList.length} 条`);
    assert(aiInList[0].statusLabel === '待核验', 'AI 条目默认待核验', aiInList[0].statusLabel);

    // policy-review 详情能打开 AI 条目
    const prVm2 = instantiate(pr);
    pr.onLoad.call(prVm2, { id: aiInList[0]._id });
    assert(!!prVm2.data.policy, 'policy-review 详情能打开 AI 条目');
    assert(prVm2.data.policy.isAI === true, '详情标记 isAI');
    assert(prVm2.data.policy.statusLabel === '待核验', '详情状态为待核验', prVm2.data.policy.statusLabel);

    // 确认生效后状态变化
    pr.doApprove.call(prVm2);
    const reviews = env.storage.get('policyReviews');
    assert(reviews && reviews[aiInList[0]._id], 'AI 条目可审核入库');
    assert(reviews[aiInList[0]._id].status === 'effective', '审核后状态为 effective');
  }

  // ───────── 9. 案例源走同一引擎：地址必须进提示词并写入 customCases ─────────
  {
    const env = makeEnv({
      responder: (cfg) => {
        const userMsg = cfg.data.messages.find((m) => m.role === 'user').content;
        return {
          statusCode: 200,
          data: {
            choices: [{
              message: {
                content: JSON.stringify({
                  items: [{
                    title: '经营管理不许可撤销诉讼判例',
                    date: '2026-09-20',
                    category: 'other',
                    summary: '东京地裁认定入管事实认定不足，撤销不许可处分。',
                    source_name: '裁判所',
                    source_url: 'https://www.courts.go.jp/hanrei/search2/index.html',
                    direction: 'clarify',
                    verified: true
                  }],
                  no_web_access: false
                })
              }
            }]
          }
        };
      }
    });
    const { sources, updater } = freshModules(env);
    env.storage.set('llmConfig', { apiBaseUrl: 'https://api.test/v1', apiKey: 'k', model: 'm' });

    const caseSources = sources.allCaseSources();
    const res = await updater.run({
      days: 90,
      sources: caseSources,
      storageKey: 'aiCases',
      lastUpdateKey: 'lastCaseUpdateTime',
      logKey: 'caseUpdateLog'
    });

    assert(res.ok === true && res.added === 1, '案例更新写入成功', `added=${res.added}`);
    assert(res.batches === 1, '7 条案例源单批完成', `${res.batches} 批`);

    // 案例源地址全部进提示词
    const userMsg = env.requests[0].data.messages.find((m) => m.role === 'user').content;
    const notInPrompt = caseSources.filter((s) => userMsg.indexOf(s.url) < 0);
    assert(notInPrompt.length === 0, '案例源地址全部进入提示词',
      notInPrompt.length ? notInPrompt.map((s) => s.id).join(',') : `7/7`);

    // 写入 aiCases（与用户自建案件 customCases 分开存）
    const cases = env.storage.get('aiCases');
    assert(Array.isArray(cases) && cases.length === 1, '结果写入 aiCases', `${Array.isArray(cases) ? cases.length : 'x'} 条`);
    assert(!env.storage.get('customPolicies'), '未污染 customPolicies');
    assert(!env.storage.get('customCases'), '未污染用户案件 customCases');
    assert(env.storage.get('lastCaseUpdateTime') > 0, '记录案例更新时间');
  }

  console.log('=== 端侧政策更新引擎测试 ===');
  console.log(lines.join('\n'));
  console.log(`\n结果: ${failures === 0 ? '全部通过' : failures + ' 项失败'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('测试脚本异常:', e);
  process.exit(1);
});
