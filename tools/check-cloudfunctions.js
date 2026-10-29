// 云函数体检：语法、package.json、依赖声明与实际 require 是否一致、wx-server-sdk 是否存在
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const CF = path.join(ROOT, 'cloudfunctions');

const problems = [];
const warnings = [];

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }

if (!exists(CF)) {
  console.log('cloudfunctions 目录不存在，跳过');
  process.exit(0);
}

const dirs = fs.readdirSync(CF, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

// 内置模块名单（避免把 fs/path 等误判为缺失依赖）
const BUILTIN = new Set([
  'fs', 'path', 'crypto', 'util', 'http', 'https', 'net', 'url', 'os', 'zlib',
  'stream', 'events', 'buffer', 'querystring', 'assert', 'child_process', 'tty'
]);

const report = [];

for (const name of dirs) {
  const dir = path.join(CF, name);
  const index = path.join(dir, 'index.js');
  const pkgPath = path.join(dir, 'package.json');

  if (!exists(index)) {
    problems.push(`${name}: 缺少 index.js`);
    continue;
  }
  if (!exists(pkgPath)) {
    problems.push(`${name}: 缺少 package.json`);
  }

  // 语法
  const src = read(index);
  try {
    new Function(src);
  } catch (e) {
    problems.push(`${name}/index.js 语法错误: ${e.message}`);
  }

  // package.json
  let pkg = null;
  if (exists(pkgPath)) {
    try { pkg = JSON.parse(read(pkgPath)); } catch (e) {
      problems.push(`${name}/package.json 解析失败: ${e.message}`);
    }
  }
  if (pkg) {
    if (!pkg.name) warnings.push(`${name}/package.json 缺少 "name"`);
    if (!pkg.main) warnings.push(`${name}/package.json 缺少 "main"（默认 index.js）`);
    const deps = Object.keys(pkg.dependencies || {});
    if (deps.length === 0) warnings.push(`${name}/package.json 没有 dependencies`);
    if (!deps.includes('wx-server-sdk')) {
      warnings.push(`${name}/package.json 未声明 wx-server-sdk`);
    }
    // 实际 require 的外部包是否都在 dependencies 里
    const reqRe = /require\(\s*['"]([^.'"][^'"]*)['"]\s*\)/g;
    let m;
    const missing = new Set();
    while ((m = reqRe.exec(src)) !== null) {
      const mod = m[1];
      const top = mod.startsWith('@') ? mod.split('/').slice(0, 2).join('/') : mod.split('/')[0];
      if (BUILTIN.has(top)) continue;
      if (!deps.includes(top) && !deps.includes(mod)) missing.add(top);
    }
    if (missing.size) {
      problems.push(`${name}: 代码 require 了未在 dependencies 声明的包 -> ${[...missing].join(', ')}`);
    }
  }

  report.push({
    name,
    lines: src.split('\n').length,
    deps: pkg ? Object.keys(pkg.dependencies || {}).length : 0
  });
}

console.log(`=== 云函数 ${dirs.length} 个 ===`);
console.log(`[ERROR] ${problems.length} 项`);
problems.forEach(p => console.log('  ' + p));
console.log(`\n[WARN] ${warnings.length} 项`);
warnings.forEach(p => console.log('  ' + p));

console.log('\n=== 明细 ===');
report.sort((a, b) => b.lines - a.lines);
for (const r of report.slice(0, 10)) {
  console.log(`  ${r.name.padEnd(26)} ${String(r.lines).padStart(5)} 行   依赖 ${r.deps}`);
}

process.exit(problems.length > 0 ? 1 : 0);
