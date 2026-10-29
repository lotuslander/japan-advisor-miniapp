// 数据完整性检查
//
// 关注点：数据会不会「重复」或「缺失字段」。静态可查的三类问题：
//   1. 重复提交风险：保存类处理器写 storage，但没有提交锁 → 双击产生两条重复记录
//   2. 字段契约漂移：wxml 读了 item.X，但没有任何写入方生产过 X → 界面永远空白
//   3. ID 生成碰撞：用 '<前缀>' + Date.now() 生成 ID，同毫秒内可能重复；
//      且多个页面用了相同前缀
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

function objectBodyAt(src, openIdx) {
  const start = src.indexOf('{', openIdx);
  if (start < 0) return null;
  let depth = 0, state = 'code';
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
const allJs = walk(MP).filter((f) => f.endsWith('.js'));

// ───────── 1. 重复提交风险 ─────────
// 保存处理器里写 storage，但函数开头没有提交锁（submitting/saving/locked 之类）
const GUARD_RE = /if\s*\(\s*this\.data\.(submitting|saving|locked|busy|inFlight)\s*\)\s*return/;
const LOCK_SET_RE = /setData\(\s*\{\s*(submitting|saving|locked|busy|inFlight)\s*:\s*true/;

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

    const writes = /setStorageSync\s*\(/.test(seg);
    // 只关注「往数组里 push 新记录」的保存动作（编辑/删除不会重复）
    const pushes = /\.push\s*\(/.test(seg);
    if (!writes || !pushes) return;

    const guarded = GUARD_RE.test(seg) && LOCK_SET_RE.test(seg);
    if (!guarded) {
      warnings.push(`${rel(f)} 的 ${name}() 会往 storage 里 push 新记录，但没有提交锁 → 快速双击可能产生重复数据`);
    }
  });
}

// ───────── 2. 字段契约漂移 ─────────
// wxml 里 item.<field> 读到的字段，必须有写入方生产过，否则界面永远空白。
const LIST_STORAGE = {
  clients: 'clients',
  clientList: 'clients',
  cases: 'customCases',
  customCases: 'customCases',
  leads: 'leads',
  partners: 'partners',
  aiCases: 'aiCases',
  customPolicies: 'customPolicies',
  sources: 'policySources'
};

// 汇总每个 storage key 被写入过的字段名
// 注意：按 push 的**目标变量名**归属 storage key，比"往前找最近的 getStorageSync" 准确
const VAR_TO_KEY = {
  clients: 'clients',
  leads: 'leads',
  partners: 'partners',
  cases: 'customCases',
  custom: 'customPolicies',
  customPolicies: 'customPolicies',
  tasks: 'tasks'
};
const writtenFields = {};
allJs.forEach((f) => {
  const src = stripComments(read(f));
  const pushRe = /([A-Za-z_$][\w$]*)\s*\.push\s*\(/g;
  let pm;
  while ((pm = pushRe.exec(src)) !== null) {
    const varName = pm[1];
    const key = VAR_TO_KEY[varName];
    if (!key) continue;
    const objBody = objectBodyAt(src, pm.index);
    if (!objBody) continue;
    // 含展开运算符的对象无法静态枚举字段，跳过
    if (/\.\.\./.test(objBody)) continue;
    if (!writtenFields[key]) writtenFields[key] = new Set();
    topLevelSegments(objBody).forEach((s) => {
      const fm = s.match(/^(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/);
      if (fm) writtenFields[key].add(fm[1] || fm[2] || fm[3]);
    });
  }
});

// 汇总 wxml 里 item.<field> 读取的字段
for (const p of pages) {
  const wxmlPath = path.join(MP, p + '.wxml');
  if (!exists(wxmlPath)) continue;
  const wxml = read(wxmlPath);

  // 找出每个 wx:for 的变量名
  const loops = [];
  const lr = /wx:for\s*=\s*"\{\{\s*([A-Za-z_$][\w$]*)/g;
  let lm;
  while ((lm = lr.exec(wxml)) !== null) loops.push(lm[1]);

  loops.forEach((varName) => {
    const storageKey = LIST_STORAGE[varName];
    if (!storageKey) return;
    const written = writtenFields[storageKey];
    if (!written || written.size === 0) return;

    // 收集 {{item.X}} / {{item.X.y}}
    const fieldRe = new RegExp('\\b' + varName + '\\.([A-Za-z_$][\\w$]*)', 'g');
    const readFields = new Set();
    let fm;
    while ((fm = fieldRe.exec(wxml)) !== null) {
      if (fm[1] === 'length') continue;   // 数组长度，不是数据字段
      readFields.add(fm[1]);
    }

    const missing = [...readFields].filter((x) => !written.has(x));
    // 这些字段通常由页面在 js 里二次计算，属于正常
    const COMPUTED = ['stageLabel', 'pathLabel', 'tagsText', 'isAI', 'verified', 'typeLabel',
      'kindLabel', 'statusLabel', 'catLabel', 'overdue', 'index', 'case_id', 'started_at',
      'expected_result_at', 'package_price_jpy', 'due_date', 'urgent', 'done', 'title'];
    const real = missing.filter((x) => COMPUTED.indexOf(x) < 0);
    if (real.length) {
      infos.push(`${p}.wxml 读取 ${varName}.${real.join('/')}，但写入 ${storageKey} 的代码从未生产这些字段（可能是空白显示）`);
    }
  });
}

// ───────── 3. ID 生成碰撞风险 ─────────
// 只看「纯时间戳」生成的 ID；已追加随机后缀的视为安全。
const idGen = {};
allJs.forEach((f) => {
  const src = stripComments(read(f));
  const re = /(['"`])([a-z]+-)\1\s*\+\s*Date\.now\(\)([^;\n,)]{0,80})/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const prefix = m[2];
    const tail = m[3] || '';
    // 后面拼了随机串/uuid → 不会碰撞
    if (/Math\.random|uuid|randomUUID/.test(tail)) continue;
    if (!idGen[prefix]) idGen[prefix] = [];
    idGen[prefix].push(rel(f));
  }
});
Object.keys(idGen).forEach((prefix) => {
  const files = idGen[prefix];
  if (files.length > 1) {
    infos.push(`ID 前缀 "${prefix}" 在 ${files.length} 个文件里用纯 Date.now() 生成（${files.join(', ')}）→ 同一毫秒内可能重复 ID`);
  } else {
    infos.push(`ID 前缀 "${prefix}" 在 ${files[0]} 用纯 Date.now() 生成 → 同一毫秒内可能重复 ID`);
  }
});

// ───────── 输出 ─────────
console.log('=== 数据完整性检查 ===\n');

console.log(`[ERROR] ${errors.length} 项`);
errors.forEach((e) => console.log('  ✗ ' + e));

console.log(`\n[WARN] ${warnings.length} 项`);
warnings.forEach((w) => console.log('  ! ' + w));

console.log(`\n[INFO] ${infos.length} 项`);
infos.forEach((i) => console.log('  - ' + i));

console.log('\n=== 统计 ===');
console.log(`  页面 ${pages.length} | 扫描 JS ${allJs.length} 个`);
Object.keys(writtenFields).sort().forEach((k) => {
  console.log(`  ${k.padEnd(16)} 写入字段 ${writtenFields[k].size} 个：${[...writtenFields[k]].join(', ')}`);
});

process.exit(errors.length > 0 ? 1 : 0);
