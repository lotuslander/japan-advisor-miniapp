// 交互完备性检查
//
// 关注点：前面几个脚本查「代码能否运行」，本脚本查「交互是否真的有效果」。
//   1. 假成功提示：按钮弹「已保存/已同步」但实际没写任何数据
//   2. 空态缺失：用 wx:for 渲染列表，但列表为空时页面一片空白
//   3. 死样式：wxss 里定义但 wxml 从未使用的类（清理信号）
//   4. 无上限增长：往 storage 数组里 push 却从不裁剪（长期会撑爆 10MB 配额）
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const MP = path.join(ROOT, 'miniprogram');

const errors = [];
const warnings = [];
const infos = [];

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const rel = (p) => path.relative(MP, p).replace(/\\/g, '/');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'miniprogram_npm', '.git'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}

function stripComments(src) {
  let out = '';
  let i = 0;
  let state = 'code';
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') state = c;
      out += c; i++; continue;
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; out += c; } i++; continue; }
    if (state === 'block') { if (c === '*' && c2 === '/') { state = 'code'; i += 2; } else i++; continue; }
    out += c;
    if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; }
    if (c === state) state = 'code';
    i++;
  }
  return out;
}

/** 从对象的 '{' 开始取完整对象体（花括号配平，跳过字符串/注释） */
function objectBodyAt(src, openIdx) {
  const start = src.indexOf('{', openIdx);
  if (start < 0) return null;
  let depth = 0;
  let state = 'code';
  for (let i = start; i < src.length; i++) {
    const c = src[i], c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; i++; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { state = c; continue; }
      if (c === '{') { depth++; continue; }
      if (c === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
      continue;
    }
    if (state === 'line') { if (c === '\n') state = 'code'; continue; }
    if (state === 'block') { if (c === '*' && c2 === '/') { state = 'code'; i++; } continue; }
    if (c === '\\') { i++; continue; }
    if (c === state) state = 'code';
  }
  return null;
}

/** 把对象体按深度 0 的逗号切成顶层片段 */
function topLevelSegments(body) {
  const segs = [];
  let d = 0, segStart = 0, quote = null;
  for (let i = 0; i <= body.length; i++) {
    const c = body[i];
    if (quote) { if (c === '\\') { i++; continue; } if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{' || c === '[' || c === '(') { d++; continue; }
    if (c === '}' || c === ']' || c === ')') { d--; continue; }
    if ((c === ',' && d === 0) || i === body.length) {
      const seg = body.slice(segStart, i).trim();
      if (seg) segs.push(seg);
      segStart = i + 1;
    }
  }
  return segs;
}

const appJson = JSON.parse(read(path.join(MP, 'app.json')));
const pages = appJson.pages || [];
const pageJs = pages.map((p) => path.join(MP, p + '.js')).filter(exists);

// ───────── 1. 假成功提示 ─────────
// 处理器里弹了「已保存/已同步/已生成/已记录/已添加/已删除」，但没有任何写入/跳转/复制动作。
const SUCCESS_WORDS = /title:\s*['"][^'"]*(已保存|已同步|已写入|已生成|已记录|已添加|已删除|已启动|保存成功)[^'"]*['"]/;
// 真正产生副作用的调用
const SIDE_EFFECT = /setStorageSync|removeStorageSync|navigateTo|navigateBack|switchTab|setClipboardData|shareFileMessage|callFunction|request\s*\(|triggerEvent/;

for (const f of pageJs) {
  const src = stripComments(read(f));
  const pIdx = src.search(/\bPage\s*\(\s*\{/);
  if (pIdx < 0) continue;
  const body = objectBodyAt(src, pIdx);
  if (!body) continue;

  topLevelSegments(body).forEach((seg) => {
    const m = seg.match(/^(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*(?=\(|:)/);
    if (!m) return;
    const name = m[1] || m[2] || m[3];
    if (!name || name === 'data') return;

    if (!SUCCESS_WORDS.test(seg)) return;
    if (SIDE_EFFECT.test(seg)) return;

    warnings.push(`${rel(f)} 的 ${name}() 弹出「已完成」提示，但没有任何写入/跳转动作 —— 可能是假成功`);
  });
}

// ───────── 2. 列表空态缺失 ─────────
// 只针对「从 storage 读出来的业务列表」；items/rows 之类多为静态或计算结果，不误报。
const BUSINESS_LISTS = /^(clients?|cases?|aiCases|customCases|customPolicies|leads|partners|sources|notes|commLogs)$/;
for (const p of pages) {
  const wxmlPath = path.join(MP, p + '.wxml');
  if (!exists(wxmlPath)) continue;
  const wxml = read(wxmlPath);

  const loops = [];
  const re = /wx:for\s*=\s*"\{\{\s*([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(wxml)) !== null) loops.push(m[1]);

  loops.forEach((varName) => {
    if (!BUSINESS_LISTS.test(varName)) return;
    const hasEmpty = new RegExp('!\\s*' + varName + '\\s*\\.\\s*length').test(wxml)
      || new RegExp(varName + '\\s*\\.\\s*length\\s*===?\\s*0').test(wxml)
      || new RegExp(varName + '\\s*\\.\\s*length\\s*[<>]').test(wxml)
      || /wx:else/.test(wxml);
    if (!hasEmpty) {
      infos.push(`${p}.wxml 渲染列表 ${varName} 但没有空态提示（列表为空时页面会一片空白）`);
    }
  });
}

// ───────── 3. 死样式（定义但从未使用） ─────────
// 注意：很多类名是通过 {{变量}} 动态拼出来的（如 class="verdict {{verdictClass}}"），
// 因此只要类名在 JS 里以字符串字面量出现过，就认为它是"动态使用"，不算死样式。
const appWxss = exists(path.join(MP, 'app.wxss')) ? read(path.join(MP, 'app.wxss')) : '';
const allJsText = walk(MP).filter((x) => x.endsWith('.js')).map((f) => read(f)).join('\n');

for (const p of pages) {
  const wxssPath = path.join(MP, p + '.wxss');
  const wxmlPath = path.join(MP, p + '.wxml');
  if (!exists(wxssPath) || !exists(wxmlPath)) continue;

  const wxss = read(wxssPath);
  const wxml = read(wxmlPath);

  const defined = new Set();
  const defRe = /\.([A-Za-z_][\w-]*)/g;
  let dm;
  while ((dm = defRe.exec(wxss)) !== null) defined.add(dm[1]);

  const unused = [];
  defined.forEach((cls) => {
    if (appWxss.indexOf('.' + cls) >= 0) return;              // 全局也定义
    if (new RegExp('\\b' + cls + '\\b').test(wxml)) return;    // wxml 静态使用
    // JS 里作为字符串出现 → 通过 {{}} 动态绑定
    if (new RegExp("['\"`]" + cls + "['\"`]").test(allJsText)) return;
    // 动态类名前缀：wxml 里存在 "前缀{{" 形式，如 stage-{{x}} / s-{{x}} / p{{x}}
    let prefix = null;
    if (cls.indexOf('-') > 0) prefix = cls.slice(0, cls.lastIndexOf('-') + 1); // 保留结尾 '-'
    if (prefix && wxml.indexOf(prefix + '{{') >= 0) return;
    // 更短前缀（p3 → p{{ }}）
    const short = cls.replace(/\d+$/, '');
    if (short !== cls && wxml.indexOf(short + '{{') >= 0) return;

    // 只以「复合选择器」形式出现（如 .todo-priority.low / .btn.disabled）时，
    // 它属于状态修饰类，可能被动态切换，只要同一条规则里另一个类在用就不算死样式。
    const compoundRe = new RegExp('\\.' + cls + '\\b[^{]*\\{', 'g');
    let cm;
    let onlyCompound = true;
    let baseUsed = false;
    while ((cm = compoundRe.exec(wxss)) !== null) {
      const ruleStart = wxss.lastIndexOf('\n', cm.index) + 1;
      const selector = wxss.slice(ruleStart, cm.index + cm[0].length - 1);
      const tokens = selector.match(/\.[A-Za-z_][\w-]*/g) || [];
      if (tokens.length <= 1) { onlyCompound = false; break; }
      tokens.forEach((tk) => {
        const other = tk.slice(1);
        if (other !== cls && new RegExp('\\b' + other + '\\b').test(wxml)) baseUsed = true;
      });
    }
    if (onlyCompound && baseUsed) return;

    unused.push(cls);
  });
  if (unused.length) {
    unused.forEach((cls) => {
      infos.push(`${p}.wxss 未使用类：.${cls}`);
    });
  }
}

// ───────── 4. storage 数组无上限增长 ─────────
// 只关注「日志/历史」类数据（会自动 append 且无业务价值上限）。
// clients/leads/partners 这类 CRM 主数据本来就该随业务增长，不报。
const VOLATILE_KEY = /(chat|history|log|message|record|notification)/i;
for (const f of walk(MP).filter((x) => x.endsWith('.js'))) {
  const src = stripComments(read(f));
  const re = /getStorageSync\(\s*['"]([A-Za-z_$][\w$]*)['"]\s*\)\s*\)?\s*\|\|\s*\[\]/g;
  let m;
  const keys = [];
  while ((m = re.exec(src)) !== null) {
    const key = m[1];
    if (VOLATILE_KEY.test(key) && keys.indexOf(key) < 0) keys.push(key);
  }
  keys.forEach((key) => {
    const pushesInto = /\.push\s*\(/.test(src);
    const caps = /\.slice\s*\(\s*0\s*,|\.splice\s*\(|MAX_[A-Z_]*(SIZE|LEN|COUNT|RECORD)|\.length\s*>\s*\d+/.test(src);
    if (pushesInto && !caps) {
      infos.push(`${rel(f)} 往 storage 数组 "${key}" 里 push，但没有长度上限/裁剪（长期可能撑爆 10MB 配额）`);
    }
  });
}

// ───────── 输出 ─────────
console.log('=== 交互完备性检查 ===\n');

console.log(`[ERROR] ${errors.length} 项`);
errors.forEach((e) => console.log('  ✗ ' + e));

console.log(`\n[WARN] ${warnings.length} 项`);
warnings.forEach((w) => console.log('  ! ' + w));

console.log(`\n[INFO] ${infos.length} 项`);
infos.forEach((i) => console.log('  - ' + i));

console.log(`\n=== 统计 ===`);
console.log(`  页面 ${pages.length} | 扫描 JS ${walk(MP).filter((x) => x.endsWith('.js')).length} 个`);

process.exit(errors.length > 0 ? 1 : 0);
