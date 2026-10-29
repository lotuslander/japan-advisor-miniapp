// 检查器有效性验证（mutation test）
//
// 目的：验证「13 个检查器真的能发现问题」，而不是只会打印 0 项。
// 做法：
//   1. 把 miniprogram/ + cloudfunctions/ + project.config.json 复制到临时目录（不动真实工程）
//   2. 对每个检查器：复制一份干净副本 → 注入一个**已知缺陷** → 运行该检查器
//   3. 断言检查器确实报了问题；若仍报 0，说明该检查器失效（比漏检更危险）
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const ROOT = process.argv[2] || '.';
const NODE = process.execPath;
const TMP = path.join(os.tmpdir(), 'ja-mutation-' + Date.now());
const PRISTINE = path.join(TMP, 'pristine');

const results = [];
let failures = 0;
function pass(name, extra) { results.push('  PASS  ' + name + (extra ? '  ' + extra : '')); }
function fail(name, why) { results.push('  FAIL  ' + name + '  -> ' + why); failures++; }

// ───────── 准备干净副本 ─────────
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (['node_modules', 'miniprogram_npm'].includes(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.mkdirSync(PRISTINE, { recursive: true });
copyDir(path.join(ROOT, 'miniprogram'), path.join(PRISTINE, 'miniprogram'));
copyDir(path.join(ROOT, 'cloudfunctions'), path.join(PRISTINE, 'cloudfunctions'));
fs.copyFileSync(path.join(ROOT, 'project.config.json'), path.join(PRISTINE, 'project.config.json'));

let caseSeq = 0;
/** 为每个用例准备一份独立工作副本（从 pristine 复制） */
function freshWorkspace() {
  const dir = path.join(TMP, 'ws' + (++caseSeq));
  copyDir(PRISTINE, dir);
  return dir;
}

function readFile(p) { return fs.readFileSync(p, 'utf8'); }
function writeFile(p, s) { fs.writeFileSync(p, s, 'utf8'); }

/** 运行检查器，返回 { exit, out } */
function runChecker(ws, checker) {
  const checkerPath = path.join(ROOT, 'tools', checker + '.js');
  try {
    const out = cp.execFileSync(NODE, [checkerPath, ws], { encoding: 'utf8', stdio: 'pipe', timeout: 120000 });
    return { exit: 0, out: out };
  } catch (e) {
    return {
      exit: typeof e.status === 'number' ? e.status : 1,
      out: String(e.stdout || '') + String(e.stderr || '')
    };
  }
}

/** 断言检查器检出了缺陷 */
function expectDetected(name, checker, mutate, signal) {
  const ws = freshWorkspace();
  try {
    mutate(ws);
  } catch (e) {
    fail(name, '注入缺陷失败: ' + e.message);
    return;
  }
  const r = runChecker(ws, checker);
  const detected = signal ? signal(r) : (r.exit !== 0);
  if (detected) {
    pass(name, checker + ' 检出');
  } else {
    fail(name, checker + ' 未检出（exit=' + r.exit + '，输出片段：'
      + r.out.replace(/\s+/g, ' ').slice(0, 160) + '）');
  }
}

// ───────── 逐个检查器注入缺陷 ─────────

// 1. check-miniprogram：删掉页面必需的 js（.wxss 是可选文件，删了只应报 WARN，不算缺陷）
expectDetected('结构完整性：缺必需文件 js', 'check-miniprogram', (ws) => {
  fs.unlinkSync(path.join(ws, 'miniprogram/pages/news/news.js'));
}, (r) => /问题 [1-9]/.test(r.out) || r.exit !== 0);

// 1b. check-miniprogram：JSON 语法错误
expectDetected('结构完整性：JSON 损坏', 'check-miniprogram', (ws) => {
  const p = path.join(ws, 'miniprogram/pages/news/news.json');
  writeFile(p, '{ "navigationBarTitleText": "x",, }');
}, (r) => /问题 [1-9]/.test(r.out) || r.exit !== 0);

// 2. check-bindings：绑定一个不存在的处理器
expectDetected('绑定一致性：处理器不存在', 'check-bindings', (ws) => {
  const p = path.join(ws, 'miniprogram/pages/news/news.wxml');
  writeFile(p, readFile(p).replace('<view class="page">', '<view class="page">\n  <view bindtap="__no_such_handler__">x</view>'));
}, (r) => /ERROR\]\s*[1-9]/.test(r.out) || r.exit !== 0);

// 3. check-reachability：注册一个没有任何入口的新页面
expectDetected('页面可达性：孤立页', 'check-reachability', (ws) => {
  const srcDir = path.join(ws, 'miniprogram/pages/news');
  const dstDir = path.join(ws, 'miniprogram/pages/orphan-demo');
  fs.mkdirSync(dstDir, { recursive: true });
  ['news.js', 'news.wxml', 'news.wxss', 'news.json'].forEach((f) => {
    const dst = path.join(dstDir, 'orphan-demo' + path.extname(f));
    fs.copyFileSync(path.join(srcDir, f), dst);
  });
  const appJsonPath = path.join(ws, 'miniprogram/app.json');
  const appJson = JSON.parse(readFile(appJsonPath));
  appJson.pages.push('pages/orphan-demo/orphan-demo');
  writeFile(appJsonPath, JSON.stringify(appJson, null, 2));
}, (r) => /无任何入口的页面 \([1-9]/.test(r.out) || r.exit !== 0);

// 4. check-contracts：把 data-id 改成别的键名（处理器读 dataset.id 就取不到）
expectDetected('契约一致性：dataset 错配', 'check-contracts', (ws) => {
  const p = path.join(ws, 'miniprogram/pages/client-detail/client-detail.wxml');
  writeFile(p, readFile(p).replace('data-id="{{item.case_id}}"', 'data-zzz="{{item.case_id}}"'));
}, (r) => /\[问题\]\s*[1-9]/.test(r.out) || r.exit !== 0);

// 5. check-cloudfunctions：注入语法错误
expectDetected('云函数：语法错误', 'check-cloudfunctions', (ws) => {
  const p = path.join(ws, 'cloudfunctions/ai-chat/index.js');
  writeFile(p, readFile(p) + '\nconst = ;\n');
}, (r) => /ERROR\]\s*[1-9]/.test(r.out) || r.exit !== 0);

// 6. audit-completeness：新增一个从未被引用的 utils 文件
expectDetected('完备性审计：死文件', 'audit-completeness', (ws) => {
  writeFile(path.join(ws, 'miniprogram/utils/zzz-unused.js'), 'module.exports = {};\n');
}, (r) => /未被引用的文件 \([1-9]/.test(r.out));

// 7. check-release：wx:key="index"（微信不允许）
expectDetected('发布就绪：wx:key=index', 'check-release', (ws) => {
  const p = path.join(ws, 'miniprogram/pages/clients/clients.wxml');
  writeFile(p, readFile(p).replace(/wx:for="\{\{([^}]+)\}\}"/, 'wx:for="{{$1}}" wx:key="index"'));
}, (r) => /ERROR\]\s*[1-9]/.test(r.out) || r.exit !== 0);

// 8. check-interaction：假成功提示（弹"已保存"但不写数据）
expectDetected('交互完备性：假成功', 'check-interaction', (ws) => {
  const p = path.join(ws, 'miniprogram/pages/news/news.js');
  writeFile(p, readFile(p).replace(/\n\}\);\s*$/, '\n  ,fakeSave() { wx.showToast({ title: \'已保存\' }); }\n});\n'));
}, (r) => /WARN\]\s*[1-9]/.test(r.out) || r.exit !== 0);

// 9. check-integrity：去掉 case-new 的防重复提交锁
expectDetected('数据完整性：重复提交', 'check-integrity', (ws) => {
  const p = path.join(ws, 'miniprogram/pages/case-new/case-new.js');
  writeFile(p, readFile(p).replace('// 防重复提交：快速双击只允许写入一次\n    if (this.data.submitting) return;\n', ''));
}, (r) => /WARN\]\s*[1-9]/.test(r.out) || r.exit !== 0);

// 10. test-robustness：让 storage.getList 不再做类型归一
expectDetected('健壮性：storage 不再兜底', 'test-robustness', (ws) => {
  const p = path.join(ws, 'miniprogram/utils/storage.js');
  writeFile(p, readFile(p).replace('return Array.isArray(v) ? v : [];', 'return v || [];'));
}, (r) => /FAIL/.test(r.out) || r.exit !== 0);

// ───────── 汇总 ─────────
console.log('=== 检查器有效性验证（mutation test）===');
console.log(results.join('\n'));
console.log('\n结果: ' + (failures === 0 ? '全部检查器均能检出注入的缺陷' : failures + ' 个检查器失效'));
console.log('临时目录: ' + TMP);

// 清理临时目录
try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch (e) { /* 忽略 */ }

process.exit(failures === 0 ? 0 : 1);
