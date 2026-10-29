// 跨页面集成测试：验证「录入客户 → 客户列表 → 新建案件 → 客户详情 → 案件工作台」整条数据链路
// 前面几个测试都是单页逻辑，这里验证页面之间通过 storage 传递的数据契约是否真的对得上。
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const MP = path.join(ROOT, 'miniprogram');

const results = [];
let failures = 0;
function ok(name, extra) { results.push(`  PASS  ${name}${extra ? '  ' + extra : ''}`); }
function bad(name, why) { results.push(`  FAIL  ${name}  -> ${why}`); failures++; }
function assert(cond, name, extra, why) { if (cond) ok(name, extra); else bad(name, why || '断言失败'); }

// 所有页面共享同一个 storage（模拟真实小程序：storage 是全局的）
const storage = new Map();
const modals = [];

const wx = {
  getStorageSync: (k) => (storage.has(k) ? storage.get(k) : ''),
  setStorageSync: (k, v) => { storage.set(k, v); },
  removeStorageSync: (k) => { storage.delete(k); },
  getWindowInfo: () => ({ windowWidth: 375, windowHeight: 667 }),
  showToast: () => {},
  showModal: (cfg) => { modals.push(cfg && cfg.title); if (cfg && cfg.success) cfg.success({ confirm: true }); },
  showLoading: () => {},
  hideLoading: () => {},
  setClipboardData: (cfg) => { if (cfg && cfg.success) cfg.success(); },
  navigateTo: () => {},
  navigateBack: () => {},
  switchTab: () => {},
  request: (cfg) => { if (cfg && cfg.success) cfg.success({ statusCode: 200, data: { choices: [{ message: { content: '' } }] } }); }
};

global.wx = wx;
global.getApp = () => ({ globalData: {} });

function loadPage(rel) {
  const abs = path.join(MP, rel);
  const dir = path.dirname(abs);
  let captured = null;
  const sandboxRequire = (spec) => (spec.startsWith('.') ? require(path.resolve(dir, spec)) : require(spec));
  const code = fs.readFileSync(abs, 'utf8');
  const mod = { exports: {} };
  const fn = new Function('require', 'Page', 'Component', 'wx', 'getApp', 'console', 'module', 'exports', code);
  fn(sandboxRequire, (cfg) => { captured = cfg; }, () => {}, wx, global.getApp, console, mod, mod.exports);
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
        for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
        o[parts[parts.length - 1]] = patch[k];
      } else this.data[k] = patch[k];
    });
    if (typeof cb === 'function') cb.call(this);
  };
  return vm;
}

// ───────── 1. 语音录入 → 客户入库 ─────────
const intake = loadPage('pages/client-intake/client-intake.js');
const intakeVm = instantiate(intake);
intakeVm.data.transcript = '陈先生 38岁 年收1200万 IT公司总经理';
intakeVm.data.recording = false;

intake.onTranscriptInput.call(intakeVm, { detail: { value: intakeVm.data.transcript } });
intake.extractInfo.call(intakeVm);
assert(!!intakeVm.data.extracted, '录入：信息提取成功', intakeVm.data.extracted && intakeVm.data.extracted.name);

intake.saveClient.call(intakeVm);
let clients = storage.get('clients') || [];
assert(clients.length === 1, '录入：客户已入库', `${clients.length} 位`);

const created = clients[0] || {};
assert(created.name === '陈先生', '录入：姓名正确', created.name);
assert(!!created.stage, '录入：有阶段字段', created.stage);

// 关键契约：字段名必须是 annual_income_jpy（列表/详情/CSV 都读这个）
assert(typeof created.annual_income_jpy === 'number' && created.annual_income_jpy > 0,
  '录入：年收写入 annual_income_jpy（规范字段）', String(created.annual_income_jpy));
assert(created.annual_income === undefined, '录入：不再写非规范字段 annual_income');

// ───────── 2. 客户列表能显示 ─────────
const clientsList = loadPage('pages/clients/clients.js');
const clientsVm = instantiate(clientsList);
clientsList.onLoad && clientsList.onLoad.call(clientsVm, {});
clientsList.onShow.call(clientsVm);
assert(clientsVm.data.list && clientsVm.data.list.length === 1, '客户列表：读到新建客户', `${(clientsVm.data.list || []).length} 位`);
assert(clientsVm.data.list[0].annual_income_jpy > 0, '客户列表：年收不为空', String(clientsVm.data.list[0].annual_income_jpy));

// ───────── 3. 从客户详情新建案件（带 clientId） ─────────
const detail = loadPage('pages/client-detail/client-detail.js');
const detailVm = instantiate(detail);
const clientId = created.id;
detail.onLoad.call(detailVm, { id: clientId });
detail.onShow.call(detailVm);
assert(detailVm.data.client.name === '陈先生', '客户详情：载入正确客户', detailVm.data.client.name);
assert(detailVm.data.cases.length === 0, '客户详情：初始无关联案件', `${detailVm.data.cases.length}`);

detail.goNewCase.call(detailVm); // 不真正跳转，只验证参数拼装不报错

const caseNew = loadPage('pages/case-new/case-new.js');
const caseVm = instantiate(caseNew);
caseNew.onLoad.call(caseVm, { clientId: clientId, clientName: '陈先生' });
assert(caseVm.data.clientId === clientId, '新建案件：接收 clientId', caseVm.data.clientId);
assert(caseVm.data.form.client_name === '陈先生', '新建案件：预填客户名', caseVm.data.form.client_name);

caseVm.data.form.price = '200';
caseVm.data.form.expected = '2027-03';
caseNew.save.call(caseVm);

const cases = storage.get('customCases') || [];
assert(cases.length === 1, '新建案件：案件已入库', `${cases.length} 件`);
assert(cases[0].client_id === clientId, '新建案件：client_id 正确关联', cases[0].client_id);
assert(Number(cases[0].price) === 200, '新建案件：金额入库', String(cases[0].price));

// ───────── 4. 客户详情能看到刚建的案件（onShow 刷新） ─────────
detail.onShow.call(detailVm);
assert(detailVm.data.cases.length === 1, '客户详情：返回后看到新案件', `${detailVm.data.cases.length} 件`);
assert(detailVm.data.cases[0].pathLabel.indexOf('経営管理') >= 0, '客户详情：案件路径为中文标签', detailVm.data.cases[0].pathLabel);

// ───────── 5. 案件工作台：材料清单 / 任务 / 阶段 ─────────
const workbench = loadPage('pages/case-workbench/case-workbench.js');
const wbVm = instantiate(workbench);
workbench.onLoad.call(wbVm, { id: cases[0].id });
workbench.onShow.call(wbVm);

assert(!!wbVm.data.case, '案件工作台：载入案件');
assert(wbVm.data.case.client_name === '陈先生', '案件工作台：客户名一致', wbVm.data.case.client_name);
assert(wbVm.data.pathLabel.indexOf('経営管理') >= 0, '案件工作台：路径标签', wbVm.data.pathLabel);
assert(wbVm.data.documents.length > 0, '案件工作台：材料清单来自内置清单', `${wbVm.data.documents.length} 项`);
assert(wbVm.data.tasks.length === wbVm.data.documents.length, '案件工作台：任务=未就绪材料', `${wbVm.data.tasks.length} 项`);

// 勾选第一个任务 → 写回 customCases
workbench.toggleTask.call(wbVm, { currentTarget: { dataset: { id: wbVm.data.tasks[0]._id } } });
const afterToggle = (storage.get('customCases') || [])[0];
assert(afterToggle.task_done && afterToggle.task_done[wbVm.data.tasks[0]._id],
  '案件工作台：任务勾选写回 storage');

// 推进阶段 → 写回 customCases
workbench.advanceStage.call(wbVm);
const afterAdvance = (storage.get('customCases') || [])[0];
assert(afterAdvance.stage === 'confirmed', '案件工作台：阶段推进写回 storage',
  afterAdvance.stage, `实际 stage=${afterAdvance.stage}`);

// ───────── 6. 返回客户详情，数据仍然一致 ─────────
detail.onShow.call(detailVm);
assert(detailVm.data.cases.length === 1, '回到客户详情：案件数不变', `${detailVm.data.cases.length} 件`);

// ───────── 7. 数据备份能覆盖这条链路的全部数据 ─────────
const dt = require(path.join(MP, 'utils', 'data-transfer.js'));
const json = dt.exportAll();
const parsed = JSON.parse(json);
assert((parsed.keys.clients || []).length === 1, '备份：包含客户', `${(parsed.keys.clients || []).length}`);
assert((parsed.keys.customCases || []).length === 1, '备份：包含案件', `${(parsed.keys.customCases || []).length}`);
assert(parsed.keys.customCases[0].client_id === clientId, '备份：案件保留了客户关联');

// 导入到空环境校验可还原
const storage2 = new Map();
global.wx = Object.assign({}, wx, {
  getStorageSync: (k) => (storage2.has(k) ? storage2.get(k) : ''),
  setStorageSync: (k, v) => { storage2.set(k, v); }
});
const dtAbs = path.join(MP, 'utils', 'data-transfer.js');
delete require.cache[require.resolve(dtAbs)];
const dt2 = require(dtAbs);
const r = dt2.importAll(json);
assert(r.ok, '备份：可成功导入', r.message);
assert((storage2.get('clients') || []).length === 1, '备份：导入后客户还原');
assert((storage2.get('customCases') || [])[0].client_id === clientId, '备份：导入后案件关联还原');

console.log('=== 跨页面集成测试 ===');
console.log(results.join('\n'));
console.log(`\n结果: ${failures === 0 ? '全部通过' : failures + ' 项失败'}`);
process.exit(failures === 0 ? 0 : 1);
