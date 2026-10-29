// 契约检查：data-* 属性 <-> dataset.X 读取、组件属性 <-> properties 声明
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const MP = path.join(ROOT, 'miniprogram');

const issues = [];
const infos = [];
const stats = { bindings: 0, dataAttrs: 0, datasetReads: 0, components: 0 };

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

/** 取函数体（从签名后的第一个 { 起配平） */
function bodyAfter(src, idx) {
  const open = src.indexOf('{', idx);
  if (open < 0) return '';
  let depth = 0;
  let state = 'code';
  for (let i = open; i < src.length; i++) {
    const c = src[i], c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; i++; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { state = c; continue; }
      if (c === '{') { depth++; continue; }
      if (c === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
      continue;
    }
    if (state === 'line') { if (c === '\n') state = 'code'; continue; }
    if (state === 'block') { if (c === '*' && c2 === '/') { state = 'code'; i++; } continue; }
    if (c === '\\') { i++; continue; }
    if (c === state) state = 'code';
  }
  return '';
}

const appJson = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));
const pages = appJson.pages || [];

// ───────── 1. data-* ↔ dataset.X ─────────
pages.forEach((p) => {
  const wxmlPath = path.join(MP, p + '.wxml');
  const jsPath = path.join(MP, p + '.js');
  if (!fs.existsSync(wxmlPath) || !fs.existsSync(jsPath)) return;

  const wxml = fs.readFileSync(wxmlPath, 'utf8');
  const js = stripComments(fs.readFileSync(jsPath, 'utf8'));

  // 每个处理器被绑定时，所在元素（及其祖先链简化处理：同元素）传了哪些 data-*
  const boundData = {};
  const tagRe = /<[a-zA-Z-]+[^>]*>/g;
  let tm;
  while ((tm = tagRe.exec(wxml)) !== null) {
    const tag = tm[0];
    const handlers = [];
    const hRe = /\b(?:bind|catch|mut-bind)[:]?([a-zA-Z]+)\s*=\s*"([A-Za-z_$][\w$]*)"/g;
    let hm;
    while ((hm = hRe.exec(tag)) !== null) handlers.push(hm[2]);
    if (handlers.length === 0) continue;

    const keys = [];
    const dRe = /\bdata-([a-zA-Z0-9_-]+)\s*=/g;
    let dm;
    while ((dm = dRe.exec(tag)) !== null) { keys.push(dm[1].toLowerCase()); stats.dataAttrs++; }

    handlers.forEach((h) => {
      stats.bindings++;
      if (!boundData[h]) boundData[h] = new Set();
      keys.forEach((k) => boundData[h].add(k));
    });
  }

  Object.keys(boundData).forEach((h) => {
    const re = new RegExp('\\b' + h.replace(/[$]/g, '\\$') + '\\s*\\(', 'g');
    const m = re.exec(js);
    if (!m) return;
    const body = bodyAfter(js, m.index);
    const dsRe = /dataset\s*\.\s*([a-zA-Z0-9_]+)/g;
    let sm;
    const checked = new Set();
    while ((sm = dsRe.exec(body)) !== null) {
      const raw = sm[1];
      const key = raw.toLowerCase();
      if (checked.has(key)) continue;
      checked.add(key);
      stats.datasetReads++;
      // 有些代码统一取 e.currentTarget.dataset 整个对象再动态取，这种无法静态判断
      if (new RegExp('dataset\\s*\\[[^\\]]+\\]').test(body)) continue;
      if (!boundData[h].has(key)) {
        issues.push(`${p}  处理器 ${h}() 读取 dataset.${raw}，但 wxml 里绑定该处理器的元素没有对应的 data-${raw}`);
      }
    }
  });
});

// ───────── 2. 组件属性 ↔ properties 声明 ─────────
const components = [];
(function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'miniprogram_npm') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) scan(full);
    else if (e.name.endsWith('.js') && /Component\s*\(\s*\{/.test(fs.readFileSync(full, 'utf8'))) components.push(full);
  }
})(MP);

components.forEach((jsPath) => {
  const js = stripComments(fs.readFileSync(jsPath, 'utf8'));
  const name = path.basename(path.dirname(jsPath));
  const pIdx = js.search(/properties\s*:\s*\{/);
  let declared = new Set();
  if (pIdx >= 0) {
    const body = bodyAfter(js, pIdx);
    const inner = body.slice(1, -1);
    let d = 0, segStart = 0, quote = null;
    for (let i = 0; i <= inner.length; i++) {
      const c = inner[i];
      if (quote) { if (c === '\\') { i++; continue; } if (c === quote) quote = null; continue; }
      if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
      if (c === '{' || c === '[' || c === '(') { d++; continue; }
      if (c === '}' || c === ']' || c === ')') { d--; continue; }
      if ((c === ',' && d === 0) || i === inner.length) {
        const seg = inner.slice(segStart, i).trim();
        const km = seg.match(/^([A-Za-z_$][\w$]*)\s*:/);
        if (km) declared.add(km[1]);
        segStart = i + 1;
      }
    }
  }

  // 找出所有页面/组件里使用该组件时传的属性
  (function scan(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'miniprogram_npm') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { scan(full); continue; }
      if (!e.name.endsWith('.wxml')) continue;
      const wxml = fs.readFileSync(full, 'utf8');
      const tagRe = new RegExp('<' + name + '\\b([^>]*)>', 'g');
      let tm;
      while ((tm = tagRe.exec(wxml)) !== null) {
        const attrs = tm[1];
        const aRe = /\b([a-zA-Z][\w-]*)\s*=/g;
        let am;
        while ((am = aRe.exec(attrs)) !== null) {
          const attr = am[1];
          if (['class', 'style', 'id', 'wx:if', 'wx:for', 'wx:key'].indexOf(attr) >= 0) continue;
          const camel = attr.replace(/-([a-z])/g, (s, c) => c.toUpperCase());
          if (!declared.has(attr) && !declared.has(camel)) {
            infos.push(`${path.relative(MP, full).replace(/\\/g, '/')} 给组件 <${name}> 传了属性 ${attr}，但组件未声明该 property（会被忽略）`);
          }
        }
      }
    }
  })(MP);
});

console.log('=== 契约检查（dataset / 组件属性）===\n');
stats.components = components.length;
console.log('[问题] ' + issues.length + ' 项');
issues.forEach((i) => console.log('  ✗ ' + i));
console.log('\n[提示] ' + infos.length + ' 项');
infos.forEach((i) => console.log('  - ' + i));

console.log('\n=== 统计 ===');
console.log('  绑定 ' + stats.bindings + ' 处 | data-* 属性 ' + stats.dataAttrs
  + ' 个 | dataset 读取 ' + stats.datasetReads + ' 处 | 组件 ' + stats.components + ' 个');

process.exit(issues.length > 0 ? 1 : 0);
