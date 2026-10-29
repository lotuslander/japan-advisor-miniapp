// 小程序静态体检：页面完整性 / 组件引用 / JS 语法 / 资源引用 / 配置一致性
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const MP = path.join(ROOT, 'miniprogram');
const problems = [];
const warnings = [];
const stats = { pages: 0, components: 0, jsFiles: 0, jsonFiles: 0, wxmlFiles: 0, wxssFiles: 0 };

function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }
function readJson(p) {
  const raw = fs.readFileSync(p, 'utf8');
  try { return JSON.parse(raw); } catch (e) { problems.push(`JSON 解析失败 ${rel(p)} :: ${e.message}`); return null; }
}
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

// 去掉注释（保留字符串），避免把注释里的示例代码当成真实引用
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code';
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { state = c; }
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
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'miniprogram_npm' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}

// ---------- 1. app.json ----------
const appJsonPath = path.join(MP, 'app.json');
if (!exists(appJsonPath)) { console.log('FATAL: miniprogram/app.json 不存在'); process.exit(1); }
const appJson = readJson(appJsonPath);

// sitemap
if (appJson.sitemapLocation && !exists(path.join(MP, appJson.sitemapLocation))) {
  problems.push(`app.json sitemapLocation 指向的文件不存在: ${appJson.sitemapLocation}`);
}

// ---------- 2. 页面完整性 ----------
const pages = appJson.pages || [];
stats.pages = pages.length;
const pageSet = new Set(pages);

for (const page of pages) {
  const base = path.join(MP, page);
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    if (!exists(`${base}.${ext}`)) {
      // wxss/json 允许缺失（非必须），js/wxml 必须存在
      if (ext === 'js' || ext === 'wxml') problems.push(`页面缺少必需文件: ${page}.${ext}`);
      else warnings.push(`页面缺少可选文件: ${page}.${ext}`);
    }
  }
}

// ---------- 3. 磁盘上存在但未注册的页面 ----------
const pagesDir = path.join(MP, 'pages');
if (exists(pagesDir)) {
  for (const d of fs.readdirSync(pagesDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const pagePath = `pages/${d.name}/${d.name}`;
    if (!pageSet.has(pagePath) && exists(path.join(MP, pagePath + '.js'))) {
      problems.push(`页面目录存在但未在 app.json.pages 注册: ${pagePath}`);
    }
  }
}

// ---------- 4. 组件引用 ----------
function checkUsingComponents(jsonPath, jsonData) {
  const uc = jsonData && jsonData.usingComponents;
  if (!uc) return;
  for (const [name, target] of Object.entries(uc)) {
    const resolved = path.resolve(path.dirname(jsonPath), target);
    for (const ext of ['js', 'json', 'wxml']) {
      if (!exists(`${resolved}.${ext}`)) {
        problems.push(`${rel(jsonPath)} 引用组件 "${name}" 缺少 ${ext}: ${target}.${ext}`);
      }
    }
    // 组件 json 必须声明 component:true
    const cj = `${resolved}.json`;
    if (exists(cj)) {
      const cjData = readJson(cj);
      if (cjData && cjData.component !== true) {
        problems.push(`${rel(cj)} 未声明 "component": true（被 ${rel(jsonPath)} 当作组件引用）`);
      }
    }
  }
}

checkUsingComponents(appJsonPath, appJson);

// ---------- 5. 每个页面的 json ----------
for (const page of pages) {
  const jp = path.join(MP, page + '.json');
  if (exists(jp)) {
    const data = readJson(jp);
    checkUsingComponents(jp, data);
  }
}

// ---------- 6. 自定义 tabBar ----------
if (appJson.tabBar && appJson.tabBar.custom) {
  const ctb = path.join(MP, 'custom-tab-bar');
  for (const ext of ['js', 'json', 'wxml']) {
    if (!exists(path.join(ctb, `index.${ext}`))) {
      problems.push(`tabBar.custom=true 但缺少 custom-tab-bar/index.${ext}`);
    }
  }
  // tabBar 页面必须在 pages 中
  for (const item of (appJson.tabBar.list || [])) {
    if (!pageSet.has(item.pagePath)) {
      problems.push(`tabBar.list 中的页面未注册: ${item.pagePath}`);
    }
  }
}

// ---------- 7. 全量 JS 语法检查 ----------
const allFiles = walk(MP);
for (const f of allFiles) {
  const ext = path.extname(f);
  if (ext === '.js') {
    stats.jsFiles++;
    const src = fs.readFileSync(f, 'utf8');
    try {
      new Function(src); // 仅检查语法，不执行
    } catch (e) {
      problems.push(`JS 语法错误 ${rel(f)} :: ${e.message}`);
    }
  } else if (ext === '.json') {
    stats.jsonFiles++;
    readJson(f);
  } else if (ext === '.wxml') {
    stats.wxmlFiles++;
  } else if (ext === '.wxss') {
    stats.wxssFiles++;
  }
}

// ---------- 8. wxss @import 解析 ----------
for (const f of allFiles) {
  if (path.extname(f) !== '.wxss') continue;
  const src = fs.readFileSync(f, 'utf8');
  const re = /@import\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const target = m[1];
    if (/^https?:/.test(target)) continue;
    const resolved = path.resolve(path.dirname(f), target);
    if (!exists(resolved)) {
      problems.push(`WXSS @import 目标不存在 ${rel(f)} -> ${target}`);
    }
  }
}

// ---------- 9. wxml 中引用的静态资源 ----------
const assetRe = /src\s*=\s*["'](\/?(?:images|assets)\/[^"'{}]+)["']/g;
for (const f of allFiles) {
  if (path.extname(f) !== '.wxml') continue;
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = assetRe.exec(src)) !== null) {
    const target = m[1].replace(/^\//, '');
    if (!exists(path.join(MP, target))) {
      problems.push(`WXML 引用的图片不存在 ${rel(f)} -> ${m[1]}`);
    }
  }
}

// ---------- 10. require 路径解析 ----------
const requireRe = /require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
for (const f of allFiles) {
  if (path.extname(f) !== '.js') continue;
  const src = stripComments(fs.readFileSync(f, 'utf8'));
  let m;
  while ((m = requireRe.exec(src)) !== null) {
    const target = m[1];
    const resolved = path.resolve(path.dirname(f), target);
    const candidates = [resolved, resolved + '.js', resolved + '.json',
      path.join(resolved, 'index.js')];
    if (!candidates.some(exists)) {
      problems.push(`require 目标不存在 ${rel(f)} -> ${target}`);
    }
  }
}

// ---------- 输出 ----------
console.log('=== 统计 ===');
console.log(`页面 ${stats.pages} | JS ${stats.jsFiles} | JSON ${stats.jsonFiles} | WXML ${stats.wxmlFiles} | WXSS ${stats.wxssFiles}`);
console.log(`\n=== 问题 ${problems.length} 项 ===`);
problems.forEach(p => console.log('  [ERROR] ' + p));
console.log(`\n=== 提示 ${warnings.length} 项 ===`);
warnings.forEach(p => console.log('  [WARN ] ' + p));
process.exit(problems.length > 0 ? 1 : 0);
