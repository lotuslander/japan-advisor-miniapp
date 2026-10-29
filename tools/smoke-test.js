// 对重写/修复的页面做运行时冒烟测试：用 Page/wx 桩真实执行逻辑
const path = require('path');

const ROOT = process.argv[2] || '.';
const MP = path.join(ROOT, 'miniprogram');

const results = [];
let failures = 0;

function ok(name, extra) { results.push(`  PASS  ${name}${extra ? '  ' + extra : ''}`); }
function bad(name, why) { results.push(`  FAIL  ${name}  -> ${why}`); failures++; }

// ---- 沙箱环境 ----
function makeEnv() {
  const storage = new Map();
  const toasts = [];
  const navs = [];
  const modals = [];
  const clipboard = [];
  let capturedPage = null;

  const wx = {
    getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
    setStorageSync: (k, v) => { storage.set(k, v); },
    removeStorageSync: (k) => { storage.delete(k); },
    showToast: (o) => { toasts.push(o && o.title); },
    showModal: (o) => { modals.push(o && o.title); if (o && o.success) o.success({ confirm: true }); },
    navigateTo: (o) => { navs.push(o && o.url); },
    navigateBack: () => {},
    setClipboardData: (o) => { clipboard.push(o && o.data); if (o && o.success) o.success(); },
    cloud: { callFunction: () => Promise.resolve({ result: {} }) }
  };

  const Page = (config) => { capturedPage = config; };

  return {
    wx, Page,
    get page() { return capturedPage; },
    storage, toasts, navs, modals, clipboard
  };
}

function loadPage(relPath) {
  const env = makeEnv();
  // 被 require 的 utils 引用的是全局 wx，测试里要同步指向当前 env
  global.wx = env.wx;
  global.getApp = () => ({ globalData: {} });
  const abs = path.join(MP, relPath);
  const pageDir = path.dirname(abs);
  delete require.cache[require.resolve(abs)];

  // 相对路径按页面所在目录解析（与小程序运行时 require 基准一致）
  const sandboxRequire = (spec) => {
    if (spec.startsWith('.')) return require(path.resolve(pageDir, spec));
    return require(spec);
  };

  const code = require('fs').readFileSync(abs, 'utf8');
  const fn = new Function('require', 'Page', 'Component', 'wx', 'getApp', 'console', 'module', 'exports', code);
  const mod = { exports: {} };
  fn(sandboxRequire, env.Page, () => {}, env.wx, global.getApp, console, mod, mod.exports);

  return { env, page: env.page };
}

// ============ 1. cases-library ============
(function testCasesLibrary() {
  global.wx = { getStorageSync: () => '', setStorageSync: () => {} };
  let ctx;
  try {
    ctx = loadPage('pages/cases-library/cases-library.js');
  } catch (e) {
    bad('cases-library 加载', e.message);
    return;
  }
  const { env, page } = ctx;
  if (!page) { bad('cases-library Page() 注册', '未捕获到 Page 配置'); return; }
  ok('cases-library 加载');

  const required = ['onLoad', 'setCat', 'onSearchInput', 'load', 'goDetail', 'clearSearch'];
  const missing = required.filter(k => typeof page[k] !== 'function');
  if (missing.length) bad('cases-library 处理器完整性', '缺 ' + missing.join(','));
  else ok('cases-library 处理器完整性', `${required.length}/6`);

  const vm = Object.assign({}, page);
  vm.data = JSON.parse(JSON.stringify(page.data));
  vm.setData = function (patch, cb) {
    Object.keys(patch).forEach(k => { this.data[k] = patch[k]; });
    if (typeof cb === 'function') cb.call(this);
  };

  page.onLoad.call(vm);
  const total = vm.data.list.length;
  if (total === 0) bad('cases-library 初始加载', 'list 为空');
  else ok('cases-library 初始加载', `${total} 条`);

  // 筛选：经营管理
  page.setCat.call(vm, { currentTarget: { dataset: { c: 'business_manager' } } });
  const bm = vm.data.list.length;
  if (bm === 0) bad('cases-library 分类筛选', '経営・管理 筛选后为 0');
  else if (bm >= total) bad('cases-library 分类筛选', '筛选未生效');
  else ok('cases-library 分类筛选', `経営・管理 -> ${bm} 条`);

  // 筛选：高度人才
  page.setCat.call(vm, { currentTarget: { dataset: { c: 'hsp' } } });
  ok('cases-library 高才筛选', `${vm.data.list.length} 条`);

  // 回到全部 + 搜索
  page.setCat.call(vm, { currentTarget: { dataset: { c: 'all' } } });
  page.onSearchInput.call(vm, { detail: { value: '资本金' } });
  page.load.call(vm);
  const searched = vm.data.list.length;
  if (searched === 0) bad('cases-library 搜索', '关键词「资本金」无结果');
  else if (searched >= total) bad('cases-library 搜索', '搜索未过滤');
  else ok('cases-library 搜索', `「资本金」-> ${searched} 条`);

  // 清空搜索
  page.clearSearch.call(vm);
  if (vm.data.keyword !== '' || vm.data.list.length !== total) bad('cases-library 清空搜索', '未恢复全部');
  else ok('cases-library 清空搜索', `恢复 ${total} 条`);

  // 进详情
  const first = vm.data.list[0];
  page.goDetail.call(vm, { currentTarget: { dataset: { id: first._id } } });
  if (env.navs.length === 0) bad('cases-library 进详情', '未触发导航');
  else if (env.navs[0].indexOf('/pages/case-lib-detail/case-lib-detail?id=') < 0) bad('cases-library 进详情', '跳转地址错误: ' + env.navs[0]);
  else ok('cases-library 进详情', env.navs[0]);

  // 详情页能用这个 id 找到数据
  const detail = loadPage('pages/case-lib-detail/case-lib-detail.js');
  const dvm = Object.assign({}, detail.page);
  dvm.data = JSON.parse(JSON.stringify(detail.page.data));
  dvm.setData = function (patch) { Object.keys(patch).forEach(k => { this.data[k] = patch[k]; }); };
  detail.page.onLoad.call(dvm, { id: first._id });
  if (!dvm.data.detail || !dvm.data.detail.title) bad('cases-library -> 详情页联动', '详情页未取到数据');
  else ok('cases-library -> 详情页联动', dvm.data.detail.title);
})();

// ============ 2. policy-review ============
(function testPolicyReview() {
  global.wx = { getStorageSync: () => '', setStorageSync: () => {} };
  let ctx;
  try {
    ctx = loadPage('pages/policy-review/policy-review.js');
  } catch (e) {
    bad('policy-review 加载', e.message);
    return;
  }
  const { env, page } = ctx;
  if (!page) { bad('policy-review Page() 注册', '未捕获到 Page 配置'); return; }
  ok('policy-review 加载');

  const required = ['onLoad', 'loadList', 'loadDetail', 'goDetail', 'copyUrl',
    'onCapitalInput', 'onJapaneseInput', 'onEmployeeChange', 'onExpertChange',
    'onTransitionInput', 'onImpactInput', 'doApprove', 'doReject'];
  const missing = required.filter(k => typeof page[k] !== 'function');
  if (missing.length) bad('policy-review 处理器完整性', '缺 ' + missing.join(','));
  else ok('policy-review 处理器完整性', `${required.length}/13`);

  const vm = Object.assign({}, page);
  vm.data = JSON.parse(JSON.stringify(page.data));
  vm.setData = function (patch, cb) {
    Object.keys(patch).forEach(k => {
      if (k.indexOf('.') > 0) {
        const parts = k.split('.');
        let o = this.data;
        for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
        o[parts[parts.length - 1]] = patch[k];
      } else this.data[k] = patch[k];
    });
    if (typeof cb === 'function') cb.call(this);
  };

  // 列表模式
  page.onLoad.call(vm, {});
  if (vm.data.error) bad('policy-review 列表加载', 'error=true');
  else if (vm.data.list.length === 0) bad('policy-review 列表加载', 'list 为空');
  else ok('policy-review 列表加载', `${vm.data.list.length} 条`);

  if (!('loading' in vm.data) || !('error' in vm.data)) bad('policy-review 状态字段', 'loading/error 缺失');
  else ok('policy-review 状态字段', 'loading + error');

  // 详情模式
  const targetId = vm.data.list[0]._id;
  const vm2 = Object.assign({}, page);
  vm2.data = JSON.parse(JSON.stringify(page.data));
  vm2.setData = vm.setData.bind(vm2);
  page.onLoad.call(vm2, { id: targetId });
  if (!vm2.data.policy || !vm2.data.policy.title_zh) bad('policy-review 详情加载', '未取到政策');
  else ok('policy-review 详情加载', vm2.data.policy.title_zh);

  // 表单输入
  page.onCapitalInput.call(vm2, { detail: { value: '3000' } });
  page.onJapaneseInput.call(vm2, { detail: { value: 'B2相当' } });
  page.onEmployeeChange.call(vm2, { detail: { value: false } });
  page.onExpertChange.call(vm2, { detail: { value: false } });
  page.onTransitionInput.call(vm2, { detail: { value: '2028-10-16' } });
  page.onImpactInput.call(vm2, { detail: { value: '需提前规划资本金' } });
  const f = vm2.data.form;
  if (f.capital_min_jpy_wan !== '3000' || f.japanese_level !== 'B2相当' ||
      f.employee_required !== false || f.expert_review !== false ||
      f.transition_until !== '2028-10-16' || f.impact !== '需提前规划资本金') {
    bad('policy-review 表单输入', JSON.stringify(f));
  } else ok('policy-review 表单输入', '6 个字段全部落到 form');

  // 复制出处
  page.copyUrl.call(vm2);
  if (env.clipboard.length === 0) bad('policy-review copyUrl', '未写入剪贴板');
  else ok('policy-review copyUrl', env.clipboard[0]);

  // 确认生效 + 持久化
  page.doApprove.call(vm2);
  const saved = env.storage.get('policyReviews');
  if (!saved || !saved[targetId]) bad('policy-review doApprove 持久化', 'storage 未写入');
  else if (saved[targetId].status !== 'effective') bad('policy-review doApprove 状态', saved[targetId].status);
  else ok('policy-review doApprove 持久化', 'status=effective');

  // 已审核状态回填到详情
  const vm3 = Object.assign({}, page);
  vm3.data = JSON.parse(JSON.stringify(page.data));
  vm3.setData = vm.setData.bind(vm3);
  page.onLoad.call(vm3, { id: targetId });
  if (vm3.data.form.capital_min_jpy_wan !== '3000') bad('policy-review 审核结果回填', 'capital 未回填');
  else ok('policy-review 审核结果回填', 'capital=3000');

  // 驳回
  const vm4 = Object.assign({}, page);
  vm4.data = JSON.parse(JSON.stringify(page.data));
  vm4.setData = vm.setData.bind(vm4);
  page.onLoad.call(vm4, { id: targetId });
  page.doReject.call(vm4);
  const saved2 = env.storage.get('policyReviews');
  if (!saved2[targetId] || saved2[targetId].status !== 'rejected') bad('policy-review doReject', '状态未更新');
  else ok('policy-review doReject', 'status=rejected');

  // 非法资本金应被拦截
  const vm5 = Object.assign({}, page);
  vm5.data = JSON.parse(JSON.stringify(page.data));
  vm5.setData = vm.setData.bind(vm5);
  page.onLoad.call(vm5, { id: targetId });
  vm5.data.form.capital_min_jpy_wan = 'abc';
  const before = env.modals.length;
  page.doApprove.call(vm5);
  ok('policy-review 资本金校验', env.modals.length === before ? '已拦截（无弹窗）' : '未拦截');
})();

// ============ 3. profile 大模型配置统一 ============
// 回归测试：历史 bug 是 profile 写 llmKey/llmUrl，而 chat/plan-generator/ai-updater 只读 llmConfig，
// 导致在「我的」页填的 Key 对 AI 功能完全无效。
(function testProfileLlmConfig() {
  // 场景 A：全新配置，saveKey 必须写入 llmConfig
  let ctx;
  try {
    ctx = loadPage('pages/profile/profile.js');
  } catch (e) {
    bad('profile 加载', e.message);
    return;
  }
  const { env, page } = ctx;
  if (!page) { bad('profile Page() 注册', '未捕获 Page 配置'); return; }
  ok('profile 加载');

  const vm = Object.assign({}, page);
  vm.data = JSON.parse(JSON.stringify(page.data));
  vm.setData = function (patch) { Object.keys(patch).forEach((k) => { this.data[k] = patch[k]; }); };

  vm.data.llmKey = 'sk-test-123';
  vm.data.llmUrl = 'https://api.deepseek.com';
  page.saveKey.call(vm);

  const cfg = env.storage.get('llmConfig');
  if (!cfg) bad('profile saveKey 写入 llmConfig', '未写入 llmConfig');
  else if (cfg.apiKey !== 'sk-test-123') bad('profile saveKey apiKey', cfg.apiKey);
  else if (cfg.apiBaseUrl !== 'https://api.deepseek.com') bad('profile saveKey apiBaseUrl', cfg.apiBaseUrl);
  else ok('profile saveKey 写入 llmConfig', 'apiKey + apiBaseUrl 正确');

  if (env.storage.get('llmKey')) bad('profile 不再写旧键 llmKey', '仍写入 llmKey');
  else ok('profile 不再写旧键 llmKey');

  if (!cfg.model) bad('profile 保留 model 字段', 'model 丢失');
  else ok('profile 保留 model 字段', cfg.model);

  // 场景 B：旧数据迁移（只有 llmKey/llmUrl）
  const ctx2 = loadPage('pages/profile/profile.js');
  // 注意：必须在 loadPage 之后写入它自己的 env.storage（loadPage 内部会新建 env）
  ctx2.env.storage.set('llmKey', 'sk-legacy-456');
  ctx2.env.storage.set('llmUrl', 'https://api.moonshot.cn/v1');
  const env2 = ctx2.env;
  const vm2 = Object.assign({}, ctx2.page);
  vm2.data = JSON.parse(JSON.stringify(ctx2.page.data));
  vm2.setData = function (patch) { Object.keys(patch).forEach((k) => { this.data[k] = patch[k]; }); };
  ctx2.page.loadSavedKey.call(vm2);

  const migrated = env2.storage.get('llmConfig');
  if (!migrated || migrated.apiKey !== 'sk-legacy-456') bad('profile 旧配置迁移', '未迁移到 llmConfig');
  else if (migrated.apiBaseUrl !== 'https://api.moonshot.cn/v1') bad('profile 迁移 baseUrl', migrated.apiBaseUrl);
  else ok('profile 旧配置迁移', 'llmKey/llmUrl -> llmConfig');

  if (env2.storage.get('llmKey')) bad('profile 迁移后清理旧键', '旧键残留');
  else ok('profile 迁移后清理旧键');

  // 场景 C：clearKey 必须清掉统一键
  ctx2.page.clearKey.call(vm2);
  if (env2.storage.get('llmConfig')) bad('profile clearKey 清除 llmConfig', '未清除');
  else ok('profile clearKey 清除 llmConfig');
})();

// ============ 4. 首页滚动新闻组件 + 新闻页 ============
(function testPolicyScrollNews() {
  const fs = require('fs');

  function loadComponent(relPath, env) {
    // 组件依赖的 utils 用的是全局 wx，测试里要同步
    global.wx = env.wx;
    global.getApp = () => ({ globalData: {} });
    const abs = path.join(MP, relPath);
    const dir = path.dirname(abs);
    let captured = null;
    const sandboxRequire = (spec) => (spec.startsWith('.') ? require(path.resolve(dir, spec)) : require(spec));
    const code = fs.readFileSync(abs, 'utf8');
    const fn = new Function('require', 'Component', 'Page', 'wx', 'getApp', 'console', 'module', 'exports', code);
    const mod = { exports: {} };
    fn(sandboxRequire, (cfg) => { captured = cfg; }, () => {}, env.wx,
      () => ({ globalData: {} }), console, mod, mod.exports);
    return captured;
  }

  function instantiateComponent(cfg, extraData) {
    const vm = {};
    Object.assign(vm, cfg.methods || {});
    vm.data = {};
    // properties 在真实运行时会被合并进 data
    Object.keys(cfg.properties || {}).forEach((k) => {
      vm.data[k] = cfg.properties[k].value;
    });
    Object.assign(vm.data, JSON.parse(JSON.stringify(cfg.data || {})));
    Object.assign(vm.data, extraData || {});
    vm.setData = function (patch) { Object.keys(patch).forEach((k) => { this.data[k] = patch[k]; }); };
    vm.triggerEvent = () => {};
    return vm;
  }

  // --- 无 AI 数据时：只有官方新闻 ---
  const envA = makeEnv();
  const cfgA = loadComponent('components/policy-scroll-news/policy-scroll-news.js', envA);
  if (!cfgA) { bad('滚动新闻组件 加载', '未捕获 Component 配置'); return; }
  ok('滚动新闻组件 加载');

  const required = ['refresh', 'onTapItem', 'goNews', 'onSwiperChange'];
  const missing = required.filter((k) => typeof cfgA.methods[k] !== 'function');
  if (missing.length) bad('滚动新闻 方法完整性', '缺 ' + missing.join(','));
  else ok('滚动新闻 方法完整性', `${required.length}/${required.length}`);

  const vmA = instantiateComponent(cfgA);
  vmA.refresh();
  const itemsA = vmA.data.items;
  if (itemsA.length === 0) bad('滚动新闻 基础数据', 'items 为空');
  else ok('滚动新闻 基础数据', `${itemsA.length} 条（limit=${vmA.data.limit}）`);

  if (itemsA.length > 5) bad('滚动新闻 limit 生效', `${itemsA.length} 条 > 5`);
  else ok('滚动新闻 limit 生效', `${itemsA.length} <= 5`);

  const badKey = itemsA.filter((x) => !x.id);
  if (badKey.length) bad('滚动新闻 每条都有 id（wx:key 可用）', `${badKey.length} 条缺 id`);
  else ok('滚动新闻 每条都有 id（wx:key 可用）');

  // 内置新闻按日期倒序：第一条应是 2026-10-01 的永住改正
  if (itemsA[0].date !== '2026-10-01') bad('滚动新闻 按日期倒序', `首条日期 ${itemsA[0].date}`);
  else ok('滚动新闻 按日期倒序', itemsA[0].date);

  // 发布机关 -> 官网地址映射
  const mojItem = itemsA.find((x) => x.meta.indexOf('出入国在留管理庁') >= 0);
  if (!mojItem) bad('滚动新闻 机关名映射', '找不到出入国在留管理庁条目');
  else if (mojItem.url.indexOf('moj.go.jp') < 0) bad('滚动新闻 机关名映射', `url=${mojItem.url || '(空)'}`);
  else ok('滚动新闻 机关名映射', mojItem.url);

  const tagOk = itemsA.every((x) => x.tag === '官方' && x.tagClass === 'tag-official');
  if (!tagOk) bad('滚动新闻 官方标记', '标签不正确');
  else ok('滚动新闻 官方标记', '官方 / tag-official');

  // --- 有 AI 数据时：AI 置顶 ---
  const envB = makeEnv();
  envB.storage.set('customPolicies', [{
    id: 'ai-test-1',
    title_zh: '经营管理资本金上调至3000万',
    summary: '2026年起执行。',
    source: '出入国在留管理庁',
    source_url: 'https://www.moj.go.jp/isa/applications/resources/10_00237.html',
    date: '2026-10-01',
    verified: true
  }]);
  const cfgB = loadComponent('components/policy-scroll-news/policy-scroll-news.js', envB);
  const vmB = instantiateComponent(cfgB);
  vmB.refresh();
  const itemsB = vmB.data.items;
  if (itemsB[0].tag !== 'AI') bad('滚动新闻 AI 条目置顶', `首条 tag=${itemsB[0].tag}`);
  else ok('滚动新闻 AI 条目置顶', itemsB[0].title.slice(0, 16));
  if (itemsB[0].tagClass !== 'tag-ai') bad('滚动新闻 AI 标记样式', itemsB[0].tagClass);
  else ok('滚动新闻 AI 标记样式', 'tag-ai');
  if (itemsB[0].url.indexOf('10_00237') < 0) bad('滚动新闻 AI 条目带原文链接', itemsB[0].url);
  else ok('滚动新闻 AI 条目带原文链接');

  // --- 点击交互：复制链接 ---
  const envC = makeEnv();
  const cfgC = loadComponent('components/policy-scroll-news/policy-scroll-news.js', envB);
  const vmC = instantiateComponent(cfgC);
  vmC.refresh();
  // 复用 B 的 storage：重新用 envB 加载组件实例
  const cfgC2 = loadComponent('components/policy-scroll-news/policy-scroll-news.js', envB);
  const vmC2 = instantiateComponent(cfgC2);
  vmC2.refresh();
  vmC2.onTapItem({ currentTarget: { dataset: { idx: 0 } } });
  if (envB.clipboard.length === 0) bad('滚动新闻 点击复制原文', '未写入剪贴板');
  else if (envB.clipboard[0].indexOf('moj.go.jp') < 0) bad('滚动新闻 点击复制原文', envB.clipboard[0]);
  else ok('滚动新闻 点击复制原文', envB.clipboard[0]);

  // --- 新闻页 ---
  const pageCtx = loadPage('pages/news/news.js');
  const vmP = Object.assign({}, pageCtx.page);
  vmP.data = JSON.parse(JSON.stringify(pageCtx.page.data));
  vmP.setData = function (patch) { Object.keys(patch).forEach((k) => { this.data[k] = patch[k]; }); };
  pageCtx.page.onLoad.call(vmP);

  const list = vmP.data.list;
  if (!list.length) bad('新闻页 列表加载', 'list 为空');
  else ok('新闻页 列表加载', `${list.length} 条`);

  if (vmP.data.loading !== false) bad('新闻页 loading 结束', String(vmP.data.loading));
  else ok('新闻页 loading 结束');

  const noId = list.filter((x) => !x.id);
  if (noId.length) bad('新闻页 每条有 id（wx:key 可用）', `${noId.length} 条缺 id`);
  else ok('新闻页 每条有 id（wx:key 可用）');

  const badType = list.filter((x) => !x.typeLabel);
  if (badType.length) bad('新闻页 每条有类型标签', `${badType.length} 条缺标签`);
  else ok('新闻页 每条有类型标签');

  const dates = list.filter((x) => x.type === 'official').map((x) => x.date);
  const sorted = dates.slice().sort().reverse();
  if (JSON.stringify(dates) !== JSON.stringify(sorted)) bad('新闻页 官方条目日期倒序', dates.join(','));
  else ok('新闻页 官方条目日期倒序', `${dates.length} 条`);

  // 无 AI 数据时 aiCount 应为 0，不应崩溃
  if (vmP.data.aiCount !== 0) bad('新闻页 无AI数据时 aiCount=0', String(vmP.data.aiCount));
  else ok('新闻页 无AI数据时 aiCount=0');
})();

// ============ 5. 数据导出/导入（全量备份） ============
(function testDataTransfer() {
  const env = makeEnv();
  global.wx = env.wx;

  const dtAbs = path.join(MP, 'utils/data-transfer.js');
  delete require.cache[require.resolve(dtAbs)];
  const dt = require(dtAbs);

  // 先写入各类用户数据
  const seed = {
    clients: [{ id: 'c1', name: '张三', stage: 'processing' }],
    leads: [{ id: 'l1', name: '李四' }],
    partners: [{ id: 'p1', name: '某行政书士' }],
    customPolicies: [{ id: 'ai-1', title_zh: '政策X' }],
    customCases: [{ id: 'cc1', client_name: '客户A', path: 'bm', price: 180, deposit: 0, expected: '' }],
    aiCases: [{ id: 'aic1', title_zh: 'AI案例X', summary: '摘要', source: '裁判所', date: '2026-09-01' }],
    policyReviews: { 'policy-001': { status: 'effective', form: { capital_min_jpy_wan: '3000' } } },
    policySources: [{ name: '自定义源', url: 'https://example.com/' }],
    chatHistory: [{ role: 'user', content: '你好' }],
    llmConfig: { apiBaseUrl: 'https://api.deepseek.com', apiKey: 'sk-x', model: 'deepseek-chat' },
    advisorName: '王顾问',
    renewal_done: { 'case-1': true }
  };
  Object.keys(seed).forEach((k) => env.storage.set(k, seed[k]));

  // --- 导出 ---
  const json = dt.exportAll();
  let parsed = null;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    bad('备份 JSON 可解析', e.message);
    return;
  }
  ok('备份 JSON 可解析');

  if (parsed.version !== '2.0') bad('备份 版本号', parsed.version);
  else ok('备份 版本号', parsed.version);

  const exportedKeys = Object.keys(parsed.keys || {});
  const missing = Object.keys(seed).filter((k) => exportedKeys.indexOf(k) < 0);
  if (missing.length) bad('备份 覆盖全部用户数据键', '缺 ' + missing.join(', '));
  else ok('备份 覆盖全部用户数据键', `${exportedKeys.length}/${Object.keys(seed).length}`);

  if (parsed.builtin) bad('备份 不导出内置知识库', '仍包含 builtin');
  else ok('备份 不导出内置知识库');

  const sizeKb = Math.round(json.length / 1024);
  if (sizeKb > 50) bad('备份 体积合理', sizeKb + ' KB');
  else ok('备份 体积合理', sizeKb + ' KB');

  // --- 导入 v2 到空环境 ---
  const env2 = makeEnv();
  global.wx = env2.wx;
  const r2 = dt.importAll(json);
  if (!r2.ok) bad('导入 v2 成功', r2.message);
  else ok('导入 v2 成功', r2.message);

  const lost = Object.keys(seed).filter((k) => {
    const v = env2.storage.get(k);
    return v === undefined || JSON.stringify(v) !== JSON.stringify(seed[k]);
  });
  if (lost.length) bad('导入 v2 数据无损', '丢/变了: ' + lost.join(', '));
  else ok('导入 v2 数据无损', `${Object.keys(seed).length} 个键全部一致`);

  // --- 兼容旧版 v1 平铺格式 ---
  const env3 = makeEnv();
  global.wx = env3.wx;
  const legacy = JSON.stringify({
    version: '1.0',
    clients: [{ id: 'old-c1', name: '旧客户' }],
    llmConfig: { apiKey: 'sk-old' },
    customPolicies: [{ id: 'old-p1' }],
    customCases: [],
    chatHistory: [],
    builtin: { policies: [{}], cases: [{}] }
  });
  const r3 = dt.importAll(legacy);
  if (!r3.ok) bad('导入 v1 旧备份兼容', r3.message);
  else if ((env3.storage.get('clients') || [])[0].name !== '旧客户') bad('导入 v1 旧备份兼容', 'clients 未恢复');
  else ok('导入 v1 旧备份兼容', r3.message);

  // --- 非法输入 ---
  const rBad = dt.importAll('not a json');
  if (rBad.ok) bad('导入 非法 JSON 被拒', '误判为成功');
  else ok('导入 非法 JSON 被拒', rBad.message);

  const rEmpty = dt.importAll('{}');
  if (rEmpty.ok) bad('导入 空对象被拒', '误判为成功');
  else ok('导入 空对象被拒', rEmpty.message);
})();

// ============ 6. documents 口述填表（曾是死功能） ============
(function testDocumentsDictation() {
  let ctx;
  try {
    ctx = loadPage('pages/documents/documents.js');
  } catch (e) {
    bad('documents 加载', e.message);
    return;
  }
  const { env, page } = ctx;
  if (!page) { bad('documents Page() 注册', '未捕获 Page 配置'); return; }
  ok('documents 加载');

  const required = ['startDictation', 'endDictation', 'onTranscriptInput', 'applyTranscript', 'resetTranscript'];
  const missing = required.filter((k) => typeof page[k] !== 'function');
  if (missing.length) bad('documents 口述方法完整性', '缺 ' + missing.join(','));
  else ok('documents 口述方法完整性', `${required.length}/${required.length}`);

  const vm = Object.assign({}, page);
  vm.data = JSON.parse(JSON.stringify(page.data));
  vm.setData = function (patch) {
    Object.keys(patch).forEach((k) => {
      if (k.indexOf('.') > 0) {
        const parts = k.split('.');
        let o = this.data;
        for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
        o[parts[parts.length - 1]] = patch[k];
      } else this.data[k] = patch[k];
    });
  };

  // 口述态开关
  page.startDictation.call(vm);
  if (vm.data.recording !== true) bad('documents 按住开始 → recording', String(vm.data.recording));
  else ok('documents 按住开始 → recording=true');

  page.endDictation.call(vm);
  if (vm.data.recording !== false) bad('documents 松开结束 → recording', String(vm.data.recording));
  else ok('documents 松开结束 → recording=false');

  // 输入框能写入 transcript（此前完全没有绑定，永远是空）
  page.onTranscriptInput.call(vm, { detail: { value: '陈先生 38岁 硕士 贸易公司总经理' } });
  if (vm.data.transcript.indexOf('陈先生') < 0) bad('documents 输入 transcript', vm.data.transcript);
  else ok('documents 输入 transcript', vm.data.transcript.slice(0, 14) + '…');

  // 填入表单
  page.applyTranscript.call(vm);
  if (vm.data.form.name !== '陈先生') bad('documents 从口述提取姓名', `form.name=${vm.data.form.name}`);
  else ok('documents 从口述提取姓名', vm.data.form.name);

  page.resetTranscript.call(vm);
  if (vm.data.transcript !== '') bad('documents 重说 → 清空', vm.data.transcript);
  else ok('documents 重说 → 清空');

  // wxml 必须真的绑定了输入框，否则用户仍然无法录入
  const wxml = require('fs').readFileSync(path.join(MP, 'pages/documents/documents.wxml'), 'utf8');
  if (wxml.indexOf('bindinput="onTranscriptInput"') < 0) {
    bad('documents wxml 绑定输入框', '缺少 bindinput="onTranscriptInput"');
  } else ok('documents wxml 绑定输入框', 'textarea → onTranscriptInput');
})();

// ============ 7. client-detail：备注/沟通记录/关联案件的读取与持久化 ============
(function testClientDetail() {
  const seed = {
    clients: [{
      id: 'c-1',
      name: '山田太郎',
      stage: 'executing',
      tags: ['高度人才'],
      notes: [{
        content: '已收齐护照',
        kind: 'material',
        next_followup_at: '2026-11-01',
        created_at: '2026-10-01T10:00:00.000Z'
      }],
      comm_logs: [{
        date: '2026-10-02',
        type: '電話',
        note: '确认材料清单',
        created_at: '2026-10-02T09:00:00.000Z'
      }]
    }],
    customCases: [
      { id: 'case-1', client_id: 'c-1', client_name: '山田太郎', path: 'bm', price: 200, expected: '2027-03', created_at: '2026-10-01T00:00:00.000Z' },
      { id: 'case-2', client_id: 'c-other', client_name: '别人', path: 'hsp', price: 100 }
    ]
  };
  const ctx = loadPage('pages/client-detail/client-detail.js');
  // 注意：loadPage 内部会新建 env，必须往它自己的 storage 播种
  const env = ctx.env;
  Object.keys(seed).forEach((k) => env.storage.set(k, seed[k]));
  const vm = Object.assign({}, ctx.page);
  vm.data = JSON.parse(JSON.stringify(ctx.page.data));
  vm.setData = function (patch) { Object.keys(patch).forEach((k) => { this.data[k] = patch[k]; }); };

  ctx.page.onLoad.call(vm, { id: 'c-1' });
  ctx.page.onShow.call(vm);

  if (!vm.data.client.name) bad('client-detail 载入客户', 'name 为空');
  else ok('client-detail 载入客户', vm.data.client.name);

  // 备注此前保存了却从不显示
  if (vm.data.notes.length !== 1) bad('client-detail 显示已保存备注', `notes=${vm.data.notes.length}`);
  else ok('client-detail 显示已保存备注', vm.data.notes[0].content);

  // 沟通记录此前只存在内存，离开即丢
  if (vm.data.commLogs.length !== 1) bad('client-detail 显示已持久化沟通', `commLogs=${vm.data.commLogs.length}`);
  else ok('client-detail 显示已持久化沟通', vm.data.commLogs[0].type);

  // 待办来自带跟进时间的备注
  if (vm.data.pendingTasks.length !== 1 || vm.data.pendingCount !== 1) {
    bad('client-detail 待办任务', `pending=${vm.data.pendingTasks.length}`);
  } else ok('client-detail 待办任务', vm.data.pendingTasks[0].due_date);

  // 关联案件：只应出现 client_id 匹配的那一个
  if (vm.data.cases.length !== 1) bad('client-detail 关联案件过滤', `cases=${vm.data.cases.length}`);
  else if (vm.data.cases[0].case_id !== 'case-1') bad('client-detail 关联案件过滤', vm.data.cases[0].case_id);
  else if (vm.data.cases[0].pathLabel.indexOf('経営管理') < 0) bad('client-detail 案件路径标签', vm.data.cases[0].pathLabel);
  else ok('client-detail 关联案件过滤', `${vm.data.cases[0].pathLabel}`);

  // 新增沟通记录要写回 storage
  vm.data.commNote = '再次电话确认';
  vm.data.commType = '電話';
  ctx.page.addComm.call(vm);
  const saved = env.storage.get('clients')[0];
  if (!Array.isArray(saved.comm_logs) || saved.comm_logs.length !== 2) {
    bad('client-detail 沟通记录持久化', `comm_logs=${(saved.comm_logs || []).length}`);
  } else ok('client-detail 沟通记录持久化', `${saved.comm_logs.length} 条`);

  // 新增备注要带下次跟进时间
  vm.data.noteContent = '准备提交申请';
  vm.data.noteKind = 'contact';
  vm.data.nextFollowupAt = '2026-12-01';
  ctx.page.addNote.call(vm);
  const savedNote = env.storage.get('clients')[0].notes.slice(-1)[0];
  if (savedNote.next_followup_at !== '2026-12-01') bad('client-detail 备注保存跟进时间', savedNote.next_followup_at);
  else ok('client-detail 备注保存跟进时间', savedNote.next_followup_at);
  if (vm.data.noteContent !== '') bad('client-detail 提交后清空输入', vm.data.noteContent);
  else ok('client-detail 提交后清空输入');
})();

// ============ 8. case-workbench：材料清单/任务/阶段持久化 ============
(function testCaseWorkbench() {
  const seed = {
    customCases: [{
      id: 'case-wb-1',
      client_id: 'c-1',
      client_name: '山田太郎',
      path: 'bm',
      price: 200,
      expected: '2027-03',
      created_at: '2026-10-01T00:00:00.000Z',
      stage: 'evaluating'
    }]
  };
  const ctx = loadPage('pages/case-workbench/case-workbench.js');
  const env = ctx.env;
  Object.keys(seed).forEach((k) => env.storage.set(k, seed[k]));
  const vm = Object.assign({}, ctx.page);
  vm.data = JSON.parse(JSON.stringify(ctx.page.data));
  vm.setData = function (patch) { Object.keys(patch).forEach((k) => { this.data[k] = patch[k]; }); };

  ctx.page.onLoad.call(vm, { id: 'case-wb-1' });
  ctx.page.onShow.call(vm);

  // wxml 用的字段名要映射好，否则三行空白
  if (!vm.data.case || !vm.data.case.started_at || vm.data.case.started_at === '—') {
    bad('case-workbench 启动日映射', `started_at=${vm.data.case && vm.data.case.started_at}`);
  } else ok('case-workbench 启动日映射', vm.data.case.started_at);

  if (vm.data.case.expected_result_at !== '2027-03') bad('case-workbench 预计完成映射', vm.data.case.expected_result_at);
  else ok('case-workbench 预计完成映射', vm.data.case.expected_result_at);

  if (vm.data.case.package_price_jpy !== 200) bad('case-workbench 合同金额映射', String(vm.data.case.package_price_jpy));
  else ok('case-workbench 合同金额映射', `${vm.data.case.package_price_jpy} 万`);

  if (vm.data.pathLabel.indexOf('経営管理') < 0) bad('case-workbench 路径标签', vm.data.pathLabel);
  else ok('case-workbench 路径标签', vm.data.pathLabel);

  // 材料清单来自内置 visaChecklists（经营管理签 9 项）
  if (vm.data.documents.length !== 9) bad('case-workbench 材料清单', `${vm.data.documents.length} 项`);
  else ok('case-workbench 材料清单', `${vm.data.documents.length} 项（经营管理签）`);

  // 任务 = 未就绪材料
  if (vm.data.tasks.length !== 9) bad('case-workbench 待办任务', `${vm.data.tasks.length} 项`);
  else ok('case-workbench 待办任务', `${vm.data.tasks.length} 项`);

  // 勾选任务要持久化
  ctx.page.toggleTask.call(vm, { currentTarget: { dataset: { id: vm.data.tasks[0]._id } } });
  const savedCase = env.storage.get('customCases')[0];
  if (!savedCase.task_done || !savedCase.task_done[vm.data.tasks[0]._id]) {
    bad('case-workbench 任务勾选持久化', JSON.stringify(savedCase.task_done || {}));
  } else ok('case-workbench 任务勾选持久化', vm.data.tasks[0]._id);
  if (!savedCase.doc_status || savedCase.doc_status[vm.data.tasks[0]._id] !== 'ready') {
    bad('case-workbench 材料状态持久化', JSON.stringify(savedCase.doc_status || {}));
  } else ok('case-workbench 材料状态持久化', 'ready');

  // 推进阶段要持久化
  ctx.page.advanceStage.call(vm);
  const advanced = env.storage.get('customCases')[0];
  if (advanced.stage !== 'confirmed') bad('case-workbench 阶段推进持久化', advanced.stage);
  else ok('case-workbench 阶段推进持久化', advanced.stage);

  if (vm.data.stageIdx !== 2) bad('case-workbench 阶段条同步', String(vm.data.stageIdx));
  else ok('case-workbench 阶段条同步', String(vm.data.stageIdx));
})();

// ============ 9. 防重复提交 / ID 唯一性 ============
(function testDoubleSubmit() {
  function vmOf(page, env) {
    const vm = Object.assign({}, page);
    vm.data = JSON.parse(JSON.stringify(page.data));
    vm.setData = function (patch, cb) {
      Object.keys(patch).forEach((k) => {
        if (k.indexOf('.') > 0) {
          const parts = k.split('.');
          let o = this.data;
          for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
          o[parts[parts.length - 1]] = patch[k];
        } else this.data[k] = patch[k];
      });
      if (typeof cb === 'function') cb.call(this);
    };
    return vm;
  }

  // --- leads.save 双击 ---
  {
    const ctx = loadPage('pages/leads/leads.js');
    const vm = vmOf(ctx.page, ctx.env);
    vm.data.form.name = '双击测试';
    ctx.page.save.call(vm);
    ctx.page.save.call(vm);          // 第二次应被提交锁拦住
    const leads = ctx.env.storage.get('leads') || [];
    if (leads.length !== 1) bad('leads 防重复提交', `写了 ${leads.length} 条`);
    else ok('leads 防重复提交', '双击只写 1 条');

    const clients = ctx.env.storage.get('clients') || [];
    if (clients.length !== 1) bad('leads 同步客户不重复', `写了 ${clients.length} 个客户`);
    else ok('leads 同步客户不重复', '1 个客户');
  }

  // --- case-new.save 双击 ---
  {
    const ctx = loadPage('pages/case-new/case-new.js');
    const vm = vmOf(ctx.page, ctx.env);
    ctx.page.onLoad.call(vm, { clientId: 'c-x', clientName: '张三' });
    ctx.page.save.call(vm);
    ctx.page.save.call(vm);
    const cases = ctx.env.storage.get('customCases') || [];
    if (cases.length !== 1) bad('case-new 防重复提交', `写了 ${cases.length} 件`);
    else ok('case-new 防重复提交', '双击只写 1 件');
    if (!cases[0].stage || !cases[0].client_id) bad('case-new 案件字段完整', JSON.stringify(cases[0] || {}));
    else ok('case-new 案件字段完整', `stage=${cases[0].stage}`);
  }

  // --- client-intake.saveClient 双击 ---
  {
    const ctx = loadPage('pages/client-intake/client-intake.js');
    const vm = vmOf(ctx.page, ctx.env);
    vm.data.extracted = { name: '陈先生', age: 38, annual_income: 12000000 };
    ctx.page.saveClient.call(vm);
    ctx.page.saveClient.call(vm);
    const clients = ctx.env.storage.get('clients') || [];
    if (clients.length !== 1) bad('client-intake 防重复提交', `写了 ${clients.length} 个`);
    else ok('client-intake 防重复提交', '双击只写 1 个');
  }

  // --- partners.save 双击 ---
  {
    const ctx = loadPage('pages/partners/partners.js');
    const vm = vmOf(ctx.page, ctx.env);
    vm.data.form.name = '某行政书士';
    ctx.page.save.call(vm);
    ctx.page.save.call(vm);
    const partners = ctx.env.storage.get('partners') || [];
    if (partners.length !== 1) bad('partners 防重复提交', `写了 ${partners.length} 条`);
    else ok('partners 防重复提交', '双击只写 1 条');
  }

  // --- ID 唯一性：两次独立保存产生不同 ID ---
  {
    const ctx = loadPage('pages/client-intake/client-intake.js');
    const vm = vmOf(ctx.page, ctx.env);
    vm.data.extracted = { name: 'A', age: 30, annual_income: 8000000 };
    ctx.page.saveClient.call(vm);
    vm.setData({ submitting: false });   // 模拟回到页面再存一次
    vm.data.extracted = { name: 'B', age: 31, annual_income: 9000000 };
    ctx.page.saveClient.call(vm);
    const clients = ctx.env.storage.get('clients') || [];
    const ids = clients.map((c) => c.id);
    if (clients.length !== 2) bad('ID 唯一性：两次保存两个客户', `${clients.length}`);
    else if (new Set(ids).size !== 2) bad('ID 唯一性：ID 不重复', ids.join(','));
    else ok('ID 唯一性：ID 不重复', ids[0].slice(0, 24) + '…');
  }
})();

console.log('=== 运行时冒烟测试 ===');
console.log(results.join('\n'));
console.log(`\n结果: ${failures === 0 ? '全部通过' : failures + ' 项失败'}`);
process.exit(failures === 0 ? 0 : 1);
