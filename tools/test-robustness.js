// 健壮性测试
//
// 前面所有测试都在「数据完全正确」的前提下跑。真实环境不是这样：
//   - 旧版本遗留的数据结构、用户导入的畸形备份 → storage 里可能是对象/null/字符串
//   - 分享卡片、页面栈恢复 → 路由参数可能缺失或非法
//   - 用户输入 → 数值可能是空、负数、超大值、非数字
// 本测试专门用「脏数据」去撞每个页面，验证不会崩。
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const MP = path.join(ROOT, 'miniprogram');

const results = [];
let failures = 0;
function ok(name, extra) { results.push(`  PASS  ${name}${extra ? '  ' + extra : ''}`); }
function bad(name, why) { results.push(`  FAIL  ${name}  -> ${why}`); failures++; }

// ───────── 页面加载沙箱（storage 可按用例定制） ─────────
function makeEnv(initialStorage) {
  const storage = new Map();
  if (initialStorage) {
    Object.keys(initialStorage).forEach((k) => storage.set(k, initialStorage[k]));
  }
  const env = {
    storage,
    toasts: [],
    throws: [],
    wx: {
      getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
      setStorageSync: (k, v) => { storage.set(k, v); },
      removeStorageSync: (k) => { storage.delete(k); },
      getWindowInfo: () => ({ windowWidth: 375, windowHeight: 667 }),
      showToast: (o) => { env.toasts.push(o && o.title); },
      showModal: (o) => { if (o && o.success) o.success({ confirm: true, cancel: false }); },
      showLoading: () => {},
      hideLoading: () => {},
      showShareMenu: () => {},
      setClipboardData: (o) => { if (o && o.success) o.success(); },
      navigateTo: () => {},
      navigateBack: () => {},
      switchTab: () => {},
      request: (o) => { if (o && o.success) o.success({ statusCode: 200, data: { choices: [{ message: { content: '{}' } }] } }); }
    }
  };
  return env;
}

function loadPage(rel, env) {
  const abs = path.join(MP, rel);
  const dir = path.dirname(abs);
  let captured = null;
  const sandboxRequire = (spec) => (spec.startsWith('.') ? require(path.resolve(dir, spec)) : require(spec));
  const code = fs.readFileSync(abs, 'utf8');
  const mod = { exports: {} };
  const fn = new Function('require', 'Page', 'Component', 'wx', 'getApp', 'console', 'module', 'exports', code);
  fn(sandboxRequire, (cfg) => { captured = cfg; }, () => {}, env.wx,
    () => ({ globalData: {} }), { log() {}, error() {}, warn() {} }, mod, mod.exports);
  return captured;
}

function instantiate(cfg) {
  const vm = Object.assign({}, cfg);
  vm.data = JSON.parse(JSON.stringify(cfg.data || {}));
  vm.setData = function (patch, cb) {
    Object.keys(patch).forEach((k) => {
      if (k.indexOf('.') > 0) {
        const parts = k.split('.');
        let o = this.data;
        for (let i = 0; i < parts.length - 1; i++) {
          if (o[parts[i]] === undefined || o[parts[i]] === null) o[parts[i]] = {};
          o = o[parts[i]];
        }
        o[parts[parts.length - 1]] = patch[k];
      } else this.data[k] = patch[k];
    });
    if (typeof cb === 'function') cb.call(this);
  };
  return vm;
}

/** 跑一个页面生命周期，捕获异常 */
function tryLifecycle(rel, storage, run) {
  const env = makeEnv(storage);
  // 被 require 的 utils 里引用的是全局 wx（真实小程序里 wx 是全局对象）
  global.wx = env.wx;
  global.getApp = () => ({ globalData: {} });
  let page;
  try {
    page = loadPage(rel, env);
    if (!page) return { error: '未注册 Page' };
    const vm = instantiate(page);
    run(page, vm, env);
    return { error: null, env, vm };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}

// ───────── 1. storage 数据损坏（类型错误）─────────
// 旧版本/畸形备份可能把数组写成对象、null、字符串，页面应当容错而不是崩
const LIST_PAGES = [
  { rel: 'pages/clients/clients.js', key: 'clients' },
  { rel: 'pages/leads/leads.js', key: 'leads' },
  { rel: 'pages/partners/partners.js', key: 'partners' },
  { rel: 'pages/workbench/workbench.js', key: 'clients' },
  { rel: 'pages/dashboard/dashboard.js', key: 'clients' },
  { rel: 'pages/client-detail/client-detail.js', key: 'clients' },
  { rel: 'pages/case-workbench/case-workbench.js', key: 'customCases' },
  { rel: 'pages/knowledge-admin/knowledge-admin.js', key: 'customPolicies' },
  { rel: 'pages/news/news.js', key: 'customPolicies' },
  { rel: 'pages/policy-review/policy-review.js', key: 'policyReviews' }
];

const CORRUPTS = [
  { label: '对象', value: { a: 1 } },
  { label: 'null', value: null },
  { label: '字符串', value: 'oops' },
  { label: '数字', value: 123 }
];

// 各页面对应的「打开方式」（有的需要路由参数）
const OPENERS = {
  'pages/client-detail/client-detail.js': (page, vm) => { page.onLoad.call(vm, { id: 'c-1' }); page.onShow && page.onShow.call(vm); },
  'pages/case-workbench/case-workbench.js': (page, vm) => { page.onLoad.call(vm, { id: 'case-1' }); page.onShow && page.onShow.call(vm); },
  'pages/knowledge-admin/knowledge-admin.js': (page, vm) => { page.onShow && page.onShow.call(vm); },
  'pages/policy-review/policy-review.js': (page, vm) => { page.onLoad.call(vm, {}); }
};

CORRUPTS.forEach((c) => {
  LIST_PAGES.forEach((spec) => {
    const opener = OPENERS[spec.rel] || ((page, vm) => {
      page.onLoad && page.onLoad.call(vm, {});
      page.onShow && page.onShow.call(vm);
    });
    const storage = {};
    storage[spec.key] = c.value;
    const r = tryLifecycle(spec.rel, storage, opener);
    const shortName = spec.rel.replace('pages/', '').replace('.js', '');
    if (r.error) bad(`脏数据容错：${shortName}（${spec.key}=${c.label}）`, r.error);
    else ok(`脏数据容错：${shortName}（${c.label}）`);
  });
});

// ───────── 2. storage 缺失（全新安装）─────────
LIST_PAGES.forEach((spec) => {
  const opener = OPENERS[spec.rel] || ((page, vm) => {
    page.onLoad && page.onLoad.call(vm, {});
    page.onShow && page.onShow.call(vm);
  });
  const shortName = spec.rel.replace('pages/', '').replace('.js', '');
  const r = tryLifecycle(spec.rel, {}, opener);
  if (r.error) bad(`空存储容错：${shortName}`, r.error);
  else ok(`空存储容错：${shortName}`);
});

// ───────── 3. 路由参数缺失 / 非法 ─────────
const PARAM_PAGES = [
  { rel: 'pages/client-detail/client-detail.js', params: [{}, { id: '' }, { id: '不存在' }, { id: 123 }] },
  { rel: 'pages/case-workbench/case-workbench.js', params: [{}, { id: '' }, { id: '不存在' }] },
  { rel: 'pages/case-lib-detail/case-lib-detail.js', params: [{}, { id: '不存在' }] },
  { rel: 'pages/policy-review/policy-review.js', params: [{}, { id: '不存在' }] },
  { rel: 'pages/case-new/case-new.js', params: [{}] },
  { rel: 'pages/leads/leads.js', params: [{}] }
];

PARAM_PAGES.forEach((spec) => {
  spec.params.forEach((params, i) => {
    const shortName = spec.rel.replace('pages/', '').replace('.js', '');
    const label = JSON.stringify(params);
    const r = tryLifecycle(spec.rel, {}, (page, vm) => {
      page.onLoad && page.onLoad.call(vm, params);
      page.onShow && page.onShow.call(vm);
    });
    if (r.error) bad(`参数容错：${shortName} ${label}`, r.error);
    else ok(`参数容错：${shortName} ${label}`);
  });
});

// ───────── 4. 数值边界（NaN / 负数 / 超大值）─────────
const NUMERIC_CASES = [
  { rel: 'pages/calculator/calculator.js', run: (page, vm) => { page.recalc && page.recalc.call(vm); } },
  { rel: 'pages/rei-calc/rei-calc.js', run: (page, vm) => { page.calc && page.calc.call(vm); } },
  { rel: 'pages/fees/fees.js', run: (page, vm) => { page.calc && page.calc.call(vm); } }
];

const BAD_NUMBERS = ['', 'abc', '-100', '999999999999999', null, undefined];

NUMERIC_CASES.forEach((spec) => {
  BAD_NUMBERS.forEach((badVal) => {
    const shortName = spec.rel.replace('pages/', '').replace('.js', '');
    const r = tryLifecycle(spec.rel, {}, (page, vm) => {
      // 把表单里所有字段都塞成脏值
      const form = vm.data.form || {};
      Object.keys(form).forEach((k) => { form[k] = badVal; });
      page.onLoad && page.onLoad.call(vm, {});
      spec.run(page, vm);
      // 结果里不应出现 NaN / Infinity
      const dump = JSON.stringify(vm.data.result || {}) + JSON.stringify(vm.data.verdict || '')
        + JSON.stringify(vm.data.rows || []);
      if (/NaN|Infinity/.test(dump)) {
        throw new Error('输出包含 NaN/Infinity：' + dump.slice(0, 120));
      }
    });
    const label = String(badVal);
    if (r.error) bad(`数值边界：${shortName}（${label}）`, r.error);
    else ok(`数值边界：${shortName}（${label}）`);
  });
});

// ───────── 4.5 畸形备份导入不应污染 storage ─────────
const dtPath = path.join(MP, 'utils', 'data-transfer.js');
delete require.cache[require.resolve(dtPath)];
const dt = require(dtPath);
const badBackup = JSON.stringify({ version: '2.0', keys: { clients: { a: 1 }, customCases: 'oops', policyReviews: [1,2], leads: ['ok'] } });
try {
  const r = dt.importAll(badBackup);
  const after = global.wx.getStorageSync('clients');
  if (Array.isArray(after)) bad('畸形备份：clients 被写成对象', '仍写入了非数组');
  else ok('畸形备份：错误类型被拒收', (r.skipped || []).join(','));
  const leads = global.wx.getStorageSync('leads');
  if (!Array.isArray(leads) || leads.length !== 1) bad('畸形备份：合法部分仍可导入', JSON.stringify(leads));
  else ok('畸形备份：合法部分仍可导入');
} catch (e) { bad('畸形备份导入不崩', e.message); }

// ───────── 5. wx.request 是否都有 fail 分支 ─────────
const jsFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'miniprogram_npm'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full); else if (full.endsWith('.js')) jsFiles.push(full);
  }
})(MP);

jsFiles.forEach((f) => {
  const src = fs.readFileSync(f, 'utf8');
  const count = (src.match(/wx\.request\s*\(/g) || []).length;
  if (count === 0) return;
  const fails = (src.match(/fail\s*:/g) || []).length;
  const shortName = path.relative(MP, f).replace(/\\/g, '/');
  if (fails < count) bad(`网络异常分支：${shortName}`, `${count} 处 request 但只有 ${fails} 个 fail 分支`);
  else ok(`网络异常分支：${shortName}`, `${count} 处均有 fail`);
});

// ───────── 输出 ─────────
console.log('=== 健壮性测试（脏数据 / 参数 / 数值边界）===');
console.log(results.join('\n'));
console.log(`\n结果: ${failures === 0 ? '全部通过' : failures + ' 项失败'}`);
process.exit(failures === 0 ? 0 : 1);
