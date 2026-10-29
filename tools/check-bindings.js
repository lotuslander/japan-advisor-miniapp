// 小程序深度体检 v2：WXML <-> JS 绑定一致性、组件注册、导航目标、云函数调用
// 相比 v1 修正：方法提取限制在单行参数表，避免贪婪跨行吞掉后续方法
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const MP = path.join(ROOT, 'miniprogram');
const problems = [];
const warnings = [];

const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');
const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };
const read = p => fs.readFileSync(p, 'utf8');
const readJson = p => { try { return JSON.parse(read(p)); } catch { return null; } };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'miniprogram_npm' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}

// 去掉注释但保留字符串内容（用状态机，避免误伤 URL 里的 //）
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code'; // code | line | block | sq | dq | tpl
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; i += 2; continue; }
      if (c === "'") { state = 'sq'; out += c; i++; continue; }
      if (c === '"') { state = 'dq'; out += c; i++; continue; }
      if (c === '`') { state = 'tpl'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; out += c; } i++; continue; }
    if (state === 'block') { if (c === '*' && c2 === '/') { state = 'code'; i += 2; } else i++; continue; }
    if (state === 'sq') { out += c; if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; } if (c === "'") state = 'code'; i++; continue; }
    if (state === 'dq') { out += c; if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; } if (c === '"') state = 'code'; i++; continue; }
    if (state === 'tpl') { out += c; if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; } if (c === '`') state = 'code'; i++; continue; }
  }
  return out;
}

// 从 startIndex 的 '{' 开始做平衡匹配，返回配对 '}' 的下标
function matchBrace(src, startIndex) {
  let depth = 0;
  for (let i = startIndex; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

const JS_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof',
  'new', 'do', 'else', 'try', 'finally', 'with', 'await', 'async', 'yield'
]);

function extractJsInfo(jsPath) {
  const raw = read(jsPath);
  const src = stripComments(raw);

  // ---- 方法名 ----
  const methods = new Set();

  // (a) 对象字面量方法简写 / 函数表达式： name(params) {  |  name: function(params) {  |  name: (params) => {
  const reA = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*\(([^)\n]*)\)\s*\{/g;
  let m;
  while ((m = reA.exec(src)) !== null) {
    if (!JS_KEYWORDS.has(m[1])) methods.add(m[1]);
  }
  const reB = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function\s*\*?\s*\(([^)\n]*)\)/g;
  while ((m = reB.exec(src)) !== null) {
    if (!JS_KEYWORDS.has(m[1])) methods.add(m[1]);
  }
  const reC = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\(([^)\n]*)\)\s*=>/g;
  while ((m = reC.exec(src)) !== null) {
    if (!JS_KEYWORDS.has(m[1])) methods.add(m[1]);
  }

  // ---- data 顶层键 ----
  const dataKeys = new Set();
  const dataIdx = src.search(/\bdata\s*:\s*\{/);
  if (dataIdx >= 0) {
    const open = src.indexOf('{', dataIdx);
    const close = matchBrace(src, open);
    if (close > open) {
      const body = src.slice(open + 1, close);
      // 只取顶层（depth 0）的键
      let depth = 0;
      let seg = '';
      const segs = [];
      for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (c === '{' || c === '[' || c === '(') depth++;
        else if (c === '}' || c === ']' || c === ')') depth--;
        if (c === ',' && depth === 0) { segs.push(seg); seg = ''; continue; }
        seg += c;
      }
      segs.push(seg);
      for (const s of segs) {
        const km = s.match(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/);
        if (km) dataKeys.add(km[1] || km[2] || km[3]);
      }
    }
  }

  // setData 动态键（含 'a.b' 形式的顶层）
  const setRe = /setData\s*\(\s*\{/g;
  while ((m = setRe.exec(src)) !== null) {
    const open = src.indexOf('{', m.index);
    const close = matchBrace(src, open);
    if (close > open) {
      const body = src.slice(open + 1, close);
      const kmRe = /(?:^|[,{\s])\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/g;
      let k;
      while ((k = kmRe.exec(body)) !== null) {
        const key = k[1] || k[2] || k[3];
        dataKeys.add(key.split('.')[0]);
      }
    }
  }

  return { methods, dataKeys, src };
}

function extractWxmlInfo(wxmlPath) {
  const src = read(wxmlPath);
  const handlers = new Set();
  const identifiers = new Set();
  const tags = new Set();

  // 事件绑定
  const bindRe = /\b(?:capture-)?(?:bind|catch|mut-bind)[:]?([a-zA-Z]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = bindRe.exec(src)) !== null) {
    const val = m[2].trim();
    if (/^[A-Za-z_$][\w$]*$/.test(val)) handlers.add(val);
  }

  // 标签
  const tagRe = /<([a-z][a-z0-9-]*[a-z0-9])\b/g;
  while ((m = tagRe.exec(src)) !== null) tags.add(m[1]);

  // {{ }} 根标识符
  const mustacheRe = /\{\{([\s\S]*?)\}\}/g;
  while ((m = mustacheRe.exec(src)) !== null) {
    const expr = m[1];
    // 去掉字符串字面量
    const cleaned = expr.replace(/'[^']*'|"[^"]*"/g, '""');
    const idRe = /(?:^|[^.\w$])([A-Za-z_$][\w$]*)/g;
    let idm;
    while ((idm = idRe.exec(cleaned)) !== null) {
      const id = idm[1];
      if (['true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'in', 'of',
        'new', 'Math', 'JSON', 'Number', 'String', 'Array', 'Object'].includes(id)) continue;
      identifiers.add(id);
    }
  }

  // wx:for 局部变量
  const forVars = new Set(['item', 'index']);
  const forRe = /wx:for-item\s*=\s*"([^"]*)"/g;
  while ((m = forRe.exec(src)) !== null) forVars.add(m[1]);
  const forIdxRe = /wx:for-index\s*=\s*"([^"]*)"/g;
  while ((m = forIdxRe.exec(src)) !== null) forVars.add(m[1]);

  return { handlers, identifiers, tags, forVars };
}

const BUILTIN_TAGS = new Set([
  'view', 'text', 'button', 'input', 'textarea', 'image', 'swiper', 'swiper-item',
  'scroll-view', 'navigator', 'icon', 'switch', 'slider', 'radio', 'radio-group',
  'checkbox', 'checkbox-group', 'picker', 'picker-view', 'picker-view-column',
  'form', 'label', 'movable-area', 'movable-view', 'cover-view', 'cover-image',
  'rich-text', 'progress', 'canvas', 'map', 'video', 'audio', 'camera', 'live-player',
  'live-pusher', 'open-data', 'web-view', 'ad', 'official-account', 'block',
  'template', 'import', 'include', 'wxs', 'slot', 'editor', 'root-portal',
  'page-meta', 'navigation-bar', 'page-container', 'functional-page-navigator',
  'match-media', 'keyboard-accessory', 'channel-live', 'channel-video', 'grid-view',
  'list-view', 'sticky-header', 'sticky-section', 'share-element', 'snapshot',
  'span', 'draggable-sheet', 'nested-scroll-header', 'nested-scroll-body'
]);

const appJson = readJson(path.join(MP, 'app.json'));
const pages = appJson.pages || [];
const pageSet = new Set(pages);
const appUsing = appJson.usingComponents || {};

// ---------- 逐页绑定校验 ----------
for (const page of pages) {
  const jsPath = path.join(MP, page + '.js');
  const wxmlPath = path.join(MP, page + '.wxml');
  const jsonPath = path.join(MP, page + '.json');
  if (!exists(jsPath) || !exists(wxmlPath)) continue;

  const js = extractJsInfo(jsPath);
  const wxml = extractWxmlInfo(wxmlPath);
  const pageJson = exists(jsonPath) ? (readJson(jsonPath) || {}) : {};
  const usingComponents = pageJson.usingComponents || {};

  for (const h of wxml.handlers) {
    if (!js.methods.has(h)) {
      problems.push(`${page}.wxml 绑定事件 "${h}"，但 ${page}.js 无此方法`);
    }
  }

  for (const t of wxml.tags) {
    if (BUILTIN_TAGS.has(t)) continue;
    if (usingComponents[t] || appUsing[t]) continue;
    problems.push(`${page}.wxml 使用标签 <${t}> 未在 usingComponents 注册`);
  }

  for (const id of wxml.identifiers) {
    if (wxml.forVars.has(id)) continue;
    if (js.dataKeys.has(id)) continue;
    if (js.methods.has(id)) continue;
    if (new RegExp(`\\b(?:const|let|var)\\s+${id}\\b`).test(js.src)) continue;
    warnings.push(`${page}.wxml 引用 "${id}" 未在 data/setData 中出现`);
  }
}

// ---------- 导航目标 ----------
const navRe = /(?:navigateTo|redirectTo|reLaunch|switchTab)\s*\(\s*\{[\s\S]{0,200}?url\s*:\s*['"`]([^'"`?]+)/g;
for (const f of walk(MP).filter(f => f.endsWith('.js'))) {
  const src = stripComments(read(f));
  let m;
  while ((m = navRe.exec(src)) !== null) {
    const url = m[1].replace(/^\//, '');
    if (!url.includes('${') && !pageSet.has(url)) {
      problems.push(`导航目标未注册: ${rel(f)} -> /${url}`);
    }
  }
}

// ---------- 云函数调用 ----------
const CF = path.join(ROOT, 'cloudfunctions');
const cfNames = new Set(exists(CF)
  ? fs.readdirSync(CF, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) : []);
const called = new Map();
const cfCallRe = /callFunction\s*\(\s*\{[\s\S]{0,300}?name\s*:\s*['"`]([^'"`]+)['"`]/g;
for (const f of walk(MP).filter(f => f.endsWith('.js'))) {
  const src = stripComments(read(f));
  let m;
  while ((m = cfCallRe.exec(src)) !== null) {
    const name = m[1];
    if (!called.has(name)) called.set(name, new Set());
    called.get(name).add(rel(f));
  }
}
for (const [name, files] of called) {
  if (!cfNames.has(name)) {
    problems.push(`调用不存在的云函数 "${name}"（${[...files].join(', ')}）`);
  }
}
const unusedCf = [...cfNames].filter(n => !called.has(n));

// ---------- 输出 ----------
console.log(`=== 页面 ${pages.length} | 云函数 ${cfNames.size} | 前端调用 ${called.size} ===\n`);
console.log(`[ERROR] ${problems.length} 项`);
problems.forEach(p => console.log('  ' + p));
console.log(`\n[WARN] ${warnings.length} 项`);
warnings.forEach(p => console.log('  ' + p));
console.log(`\n[INFO] 云函数已部署但前端未调用（${unusedCf.length}）:`);
console.log('  ' + (unusedCf.join(', ') || '无'));
process.exit(problems.length > 0 ? 1 : 0);
