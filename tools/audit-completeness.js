// 实现完备性审计：每页是否真有逻辑、样式缺失、死文件、遗留云调用、storage key 清单
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const MP = path.join(ROOT, 'miniprogram');
const findings = [];
const pages = [];

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

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

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'miniprogram_npm', '.git'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}

const appJson = JSON.parse(read(path.join(MP, 'app.json')));
const pageList = appJson.pages || [];

// ───────── 1. 每页实现度 ─────────
const PLACEHOLDER = ['开发中', '敬请期待', 'TODO', 'FIXME', '暂未实现', 'coming soon', '模拟数据', '占位'];

for (const page of pageList) {
  const jsPath = path.join(MP, page + '.js');
  const wxmlPath = path.join(MP, page + '.wxml');
  const wxssPath = path.join(MP, page + '.wxss');
  if (!exists(jsPath) || !exists(wxmlPath)) continue;

  const jsRaw = read(jsPath);
  const js = stripComments(jsRaw);
  const wxml = read(wxmlPath);
  const jsBytes = jsRaw.length;
  const wxmlBytes = wxml.length;

  // 绑定的处理器
  const handlers = new Set();
  const bindRe = /\b(?:capture-)?(?:bind|catch|mut-bind)[:]?([a-zA-Z]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = bindRe.exec(wxml)) !== null) {
    const v = m[2].trim();
    if (/^[A-Za-z_$][\w$]*$/.test(v)) handlers.add(v);
  }

  // 实现的方法（兼容 name(){} / name: function(){} / name: ()=>{} 三种写法）
  const methods = new Set();
  const KEYWORDS = ['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'do', 'else'];
  const methA = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*\(([^)\n]*)\)\s*\{/g;
  const methB = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function\s*\*?\s*\(([^)\n]*)\)/g;
  const methC = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\(([^)\n]*)\)\s*=>/g;
  [methA, methB, methC].forEach((re) => {
    let mm;
    while ((mm = re.exec(js)) !== null) {
      if (!KEYWORDS.includes(mm[1])) methods.add(mm[1]);
    }
  });
  const missingHandlers = [...handlers].filter((h) => !methods.has(h));

  // 生命周期
  const hasLifecycle = /\bonLoad\b|\bonShow\b|\bonReady\b|\bonLoad\s*\(/.test(js);

  // 数据源：是否真的读取数据
  const readsData = /localData|getStorageSync|aiUpdater|policySources|storage\.(getList|getMap|getString)/.test(js);

  // setData 调用次数
  const setDataCount = (js.match(/setData\s*\(/g) || []).length;

  // 占位标记（只查「真正的代码与界面文案」，注释里出现这些词不算）
  const placeholders = PLACEHOLDER.filter((w) => js.includes(w) || wxml.includes(w));

  // 样式类缺失
  const usedClasses = new Set();
  const classRe = /class="([^"]*)"/g;
  while ((m = classRe.exec(wxml)) !== null) {
    const raw = m[1];
    // 动态类名前缀：如 tag-{{d}} / p{{level}} / stage-{{s}}，前缀本身不是独立类名
    const dynPrefixes = new Set();
    const dpRe = /([A-Za-z][\w-]*)\{\{/g;
    let dp;
    while ((dp = dpRe.exec(raw)) !== null) dynPrefixes.add(dp[1]);

    // 静态类：剥离 {{...}}，避免把模板表达式里的变量名/比较值当成类名
    const staticPart = raw.replace(/\{\{[\s\S]*?\}\}/g, ' ');
    staticPart.split(/\s+/).forEach((t) => {
      if (!/^[A-Za-z][\w-]*$/.test(t)) return;
      if (dynPrefixes.has(t)) return;          // 动态前缀，跳过
      if (t.endsWith('-')) return;             // 残留前缀，跳过
      usedClasses.add(t);
    });
    // {{...}} 内的字符串字面量（排除 ===/== 比较左侧的取值，那是指数据值不是类名）
    const mustache = raw.match(/\{\{[\s\S]*?\}\}/g) || [];
    mustache.forEach((expr) => {
      const lits = expr.match(/(?:'([^']*)'|"([^"]*)")/g) || [];
      lits.forEach((lit) => {
        // 判断该字面量是否紧跟在比较运算符后面（如 === 'all'），是则跳过
        const at = expr.indexOf(lit);
        const before = expr.slice(Math.max(0, at - 5), at);
        if (/===?\s*$/.test(before) || /!==?\s*$/.test(before)) return;
        const val = lit.replace(/^['"]|['"]$/g, '');
        val.split(/\s+/).forEach((t) => {
          if (/^[A-Za-z][\w-]*$/.test(t)) usedClasses.add(t);
        });
      });
    });
  }

  const wxssText = (exists(wxssPath) ? read(wxssPath) : '') + '\n' + read(path.join(MP, 'app.wxss'));
  const definedClasses = new Set();
  const defRe = /\.([A-Za-z_][\w-]*)/g;
  while ((m = defRe.exec(wxssText)) !== null) definedClasses.add(m[1]);

  const missingClasses = [...usedClasses].filter((c) => !definedClasses.has(c));

  pages.push({
    page,
    jsBytes,
    wxmlBytes,
    handlers: handlers.size,
    methods: methods.size,
    missingHandlers,
    hasLifecycle,
    readsData,
    setDataCount,
    placeholders,
    missingClasses
  });
}

// ───────── 2. 死文件：utils / components 未被引用 ─────────
const allRefs = walk(MP)
  .filter((f) => /\.(js|json|wxml)$/.test(f))
  .map((f) => stripComments(read(f)))
  .join('\n');

const deadFiles = [];
for (const sub of ['utils', 'components']) {
  const dir = path.join(MP, sub);
  if (!exists(dir)) continue;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const name = e.name;
    if (e.isDirectory()) {
      const used = allRefs.includes(`/${sub}/${name}/`) || allRefs.includes(`components/${name}`);
      if (!used) deadFiles.push(`${sub}/${name}/`);
    } else if (name.endsWith('.js')) {
      const base = name.replace(/\.js$/, '');
      const used = allRefs.includes(`${sub}/${name}`) || allRefs.includes(`/${base}.js`);
      if (!used) deadFiles.push(`${sub}/${name}`);
    }
  }
}

// ───────── 3. 遗留云调用 ─────────
const cloudRefs = [];
for (const f of walk(MP).filter((f) => f.endsWith('.js'))) {
  const s = stripComments(read(f));
  if (/wx\.cloud/.test(s)) {
    const lines = s.split('\n');
    lines.forEach((ln, i) => {
      if (/wx\.cloud/.test(ln)) cloudRefs.push(`${rel(f)}:${i + 1}  ${ln.trim()}`);
    });
  }
}

// ───────── 4. storage key 清单 ─────────
const storageKeys = new Map();
for (const f of walk(MP).filter((f) => f.endsWith('.js'))) {
  const s = stripComments(read(f));
  const re = /(?:getStorageSync|setStorageSync|removeStorageSync)\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const k = m[1];
    if (!storageKeys.has(k)) storageKeys.set(k, new Set());
    storageKeys.get(k).add(rel(f).replace('miniprogram/', ''));
  }
}

// 有些工具（如 data-transfer）通过键名数组批量读写，需一并纳入清单
for (const f of walk(MP).filter((f) => f.endsWith('.js'))) {
  const s = stripComments(read(f));
  const arrRe = /[A-Z_]*KEYS\s*=\s*\[([\s\S]{0,1200}?)\]/g;
  let am;
  while ((am = arrRe.exec(s)) !== null) {
    const body = am[1];
    const litRe = /['"]([^'"]+)['"]/g;
    let lm;
    while ((lm = litRe.exec(body)) !== null) {
      const k = lm[1];
      if (!/^[A-Za-z][\w.]*$/.test(k)) continue;
      if (!storageKeys.has(k)) storageKeys.set(k, new Set());
      storageKeys.get(k).add(rel(f).replace('miniprogram/', ''));
    }
  }
}

// ───────── 5. 外部请求域名（单白名单架构守卫） ─────────
// 架构约定：小程序只允许请求「用户配置的大模型」这一个域名，
// 政府网站一律交给大模型去抓。所以 wx.request 的 url 必须来自配置，
// 不能硬编码任何外部站点，否则上线就要多配白名单。
const requestSites = [];
for (const f of walk(MP).filter((f) => f.endsWith('.js'))) {
  const s = stripComments(read(f));
  if (!/wx\.request\s*\(/.test(s)) continue;

  // 先收集「由配置派生」的局部变量名，例如：
  //   const testUrl = (config.apiBaseUrl || this.data.llmUrl || '...');
  const derived = new Set();
  const deriveRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]{0,200}?(?:apiBaseUrl|llmConfig|this\.data\.baseUrl)/g;
  let dm;
  while ((dm = deriveRe.exec(s)) !== null) derived.add(dm[1]);

  const lines = s.split('\n');
  lines.forEach((ln, i) => {
    if (!/wx\.request\s*\(/.test(ln)) return;
    const chunk = lines.slice(i, i + 9).join(' ');
    const um = chunk.match(/url\s*:\s*([^,\n]{1,120})/);
    const expr = um ? um[1].trim() : '(未找到 url)';
    const direct = /config\.apiBaseUrl|apiBaseUrl|this\.data\.baseUrl|llmConfig/.test(expr);
    const viaDerived = [...derived].some((name) => new RegExp('\\b' + name + '\\b').test(expr));
    requestSites.push({
      file: rel(f),
      line: i + 1,
      expr,
      ok: direct || viaDerived
    });
  });
}
const badRequests = requestSites.filter((r) => !r.ok);

// ───────── 输出 ─────────
console.log('=== 每页实现度 ===');
console.log('页面'.padEnd(34) + 'js/wxml'.padEnd(12) + '处理器'.padEnd(8) + 'setData'.padEnd(9) + '数据源  标记');
const suspicious = [];
let staticPages = 0;
for (const p of pages) {
  const isStatic = p.handlers === 0 && p.setDataCount === 0;
  if (isStatic) staticPages++;

  const flags = [];
  if (p.missingHandlers.length) flags.push('缺处理器:' + p.missingHandlers.length);
  // 静态展示页（无交互、无动态数据）不需要生命周期与数据源
  if (!isStatic && !p.hasLifecycle) flags.push('无生命周期');
  if (!isStatic && !p.readsData) flags.push('无数据源(可能纯计算)');
  if (!isStatic && p.setDataCount === 0) flags.push('从不 setData');
  if (p.placeholders.length) flags.push('占位:' + p.placeholders.join('/'));
  if (!isStatic && p.jsBytes < p.wxmlBytes * 0.25) flags.push('js 明显偏小');
  if (flags.length) suspicious.push({ page: p.page, flags });

  console.log(
    p.page.replace('pages/', '').padEnd(34) +
    `${p.jsBytes}/${p.wxmlBytes}`.padEnd(12) +
    `${p.handlers}/${p.methods}`.padEnd(8) +
    String(p.setDataCount).padEnd(9) +
    (isStatic ? ' 静态页  ' : (p.readsData ? ' 有     ' : ' 计算   ')) +
    (flags.length ? '⚠ ' + flags.join('; ') : 'OK')
  );
}

console.log(`\n=== 可疑页面 (${suspicious.length}) ===`);
suspicious.forEach((s) => console.log(`  ${s.page}\n    ${s.flags.join('\n    ')}`));

console.log(`\n=== 样式类缺失（wxml 用了但 wxss/app.wxss 未定义）===`);
const classIssues = pages.filter((p) => p.missingClasses.length > 0);
if (classIssues.length === 0) console.log('  无');
classIssues.forEach((p) => console.log(`  ${p.page}: ${p.missingClasses.join(', ')}`));

console.log(`\n=== 未被引用的文件 (${deadFiles.length}) ===`);
deadFiles.forEach((f) => console.log('  ' + f));

console.log(`\n=== 遗留云调用 (${cloudRefs.length}) ===`);
cloudRefs.forEach((c) => console.log('  ' + c));

console.log(`\n=== 外部请求目标 (${requestSites.length} 处，违反单白名单 ${badRequests.length} 处) ===`);
requestSites.forEach((r) => {
  console.log(`  ${r.ok ? 'OK  ' : 'BAD '} ${r.file}:${r.line}  url: ${r.expr}`);
});

console.log(`\n=== storage key 清单 (${storageKeys.size}) ===`);
[...storageKeys.keys()].sort().forEach((k) => {
  console.log(`  ${k.padEnd(24)} <- ${[...storageKeys.get(k)].join(', ')}`);
});

const failCount = suspicious.length + deadFiles.length + cloudRefs.length + classIssues.length + badRequests.length;
console.log(`\n合计待处理项: ${failCount}`);
process.exit(0);
