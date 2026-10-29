// 发布就绪度 / 最后一公里检查
//
// 与前几个脚本的分工：
//   check-miniprogram  : 文件是否齐全、语法、引用是否断
//   check-bindings     : wxml 绑定 -> js 方法/数据是否对得上
//   audit-completeness : 页面是否真的实现了、死文件、云遗留、样式、外部请求
//   本脚本             : 「能不能上线」—— 发布配置、wx:key、空处理器、setData 键名拼错、
//                        导航传参契约、列表页数据是否会在返回时刷新、包体积
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

const allFiles = walk(MP);
const appJson = JSON.parse(read(path.join(MP, 'app.json')));
const pages = appJson.pages || [];

// ───────────────── 1. 发布配置 ─────────────────
const projectCfgPath = path.join(ROOT, 'project.config.json');
if (exists(projectCfgPath)) {
  let pc = {};
  try { pc = JSON.parse(read(projectCfgPath)); } catch (e) {
    errors.push('project.config.json 解析失败：' + e.message);
  }

  // appid：DevTools 未填 appid 时会自动写入占位值 touristappid。
  // 这不影响代码本身与本地运行，仅在需要「配置服务器域名白名单 / 上传发布」时
  // 才需要换成你自己的 AppID，因此只做提示，不算错误。
  if (!pc.appid || pc.appid === 'touristappid') {
    infos.push('project.config.json 的 appid 为占位值（touristappid）。'
      + '纯端侧运行不受影响；仅当需要配置 request 白名单或上传发布时，替换为你自己的 AppID');
  }

  // urlCheck：只是开发者工具「模拟器是否校验服务器域名」的本地开关，
  // 不会随代码上传，也不影响线上/真机（真机始终按白名单校验）。
  const urlCheck = !!(pc.setting && pc.setting.urlCheck);
  if (!urlCheck) {
    infos.push('project.config.json setting.urlCheck=false：仅影响开发者工具模拟器是否校验域名白名单，'
      + '不随代码上传、不影响真机与线上。建议上线前在真机预览一次，确认真机请求正常');
  }

  if (pc.cloudfunctionRoot) {
    infos.push(`project.config.json 仍保留 cloudfunctionRoot=${pc.cloudfunctionRoot}（历史云架构遗留，不参与运行；如无云函数部署需求可移除）`);
  }
} else {
  errors.push('缺少 project.config.json');
}

// 需要用户授权/隐私声明的能力（本项目未用到定位/相册等，留作守卫）
const appJsonText = read(path.join(MP, 'app.json'));
if (/getLocation|chooseLocation/.test(allFiles.filter(f => f.endsWith('.js')).map(f => read(f)).join(''))) {
  if (!appJsonText.includes('requiredPrivateInfos')) {
    errors.push('代码使用定位能力，但 app.json 缺少 requiredPrivateInfos 声明');
  }
}

// ───────────────── 2. wx:key / wx:for 规范 ─────────────────
const wxmlFiles = allFiles.filter((f) => f.endsWith('.wxml'));
for (const f of wxmlFiles) {
  const src = read(f);
  const tagRe = /<([a-zA-Z-]+)\b([^>]*?)\/?>/g;
  let m;
  while ((m = tagRe.exec(src)) !== null) {
    const attrs = m[2];
    if (!/\bwx:for\s*=/.test(attrs)) continue;
    const keyMatch = attrs.match(/\bwx:key\s*=\s*"([^"]*)"/);
    if (!keyMatch) {
      warnings.push(`${rel(f)} 的 <${m[1]}> 有 wx:for 但没有 wx:key`);
      continue;
    }
    const key = keyMatch[1].trim();
    if (key === 'index') {
      errors.push(`${rel(f)} 的 <${m[1]}> 使用 wx:key="index" —— index 不是数据字段，微信不允许（应用 *this 或某个唯一字段）`);
    }
  }
}

// ───────────────── 3. 空处理器（只报被 wxml 真正绑定的） ─────────────────
const pageJsFiles = pages.map((p) => path.join(MP, p + '.js')).filter(exists);
for (const f of pageJsFiles) {
  const wxmlPath = f.replace(/\.js$/, '.wxml');
  if (!exists(wxmlPath)) continue;
  const wxml = read(wxmlPath);

  // 收集该页 wxml 里绑定的处理器名
  const bound = new Set();
  const bindRe = /\b(?:capture-)?(?:bind|catch|mut-bind)[:]?([a-zA-Z]+)\s*=\s*"([^"]*)"/g;
  let bm;
  while ((bm = bindRe.exec(wxml)) !== null) {
    const v = bm[2].trim();
    if (/^[A-Za-z_$][\w$]*$/.test(v)) bound.add(v);
  }
  if (bound.size === 0) continue;

  const src = stripComments(read(f));
  bound.forEach((name) => {
    // 匹配 name() {} / name: function () {} / name: () => {}
    const escaped = name.replace(/[$]/g, '\\$');
    const re = new RegExp(
      '(?:^|[,{\\s])' + escaped +
      '\\s*(?:\\([^)\\n]*\\)\\s*\\{\\s*\\}' +                       // name() {}
      '|:\\s*(?:async\\s*)?function\\s*\\*?\\s*\\([^)\\n]*\\)\\s*\\{\\s*\\}' + // name: function () {}
      '|:\\s*(?:async\\s*)?\\([^)\\n]*\\)\\s*=>\\s*\\{\\s*\\})'      // name: () => {}
    );
    if (re.test(src)) {
      warnings.push(`${rel(f)} 绑定的处理器 ${name}() 是空函数（点击后无任何反应）`);
    }
  });
}

// ───────────────── 4. setData 键名 vs data 声明 ─────────────────
// 只取对象字面量的**顶层**键：嵌套对象（如 result: { a, b }）里的键不是 setData 的目标。
function extractObjectBody(src, openBraceIdx) {
  const start = src.indexOf('{', openBraceIdx);
  if (start < 0) return '';
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  return '';
}

/** 解析对象字面体，返回顶层键集合（深度 0 的 key） */
function topLevelKeys(body) {
  const keys = [];
  let d = 0;
  let segStart = 0;
  let quote = null;
  for (let i = 0; i <= body.length; i++) {
    const c = body[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{' || c === '[' || c === '(') { d++; continue; }
    if (c === '}' || c === ']' || c === ')') { d--; continue; }
    if ((c === ',' && d === 0) || i === body.length) {
      const seg = body.slice(segStart, i);
      const km = seg.match(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/);
      if (km) {
        // 'form.x' 这类动态键只取根键
        const full = km[1] || km[2] || km[3];
        keys.push(full.split('.')[0]);
      }
      segStart = i + 1;
    }
  }
  return keys;
}

function extractDataKeys(src) {
  const idx = src.search(/\bdata\s*:\s*\{/);
  if (idx < 0) return new Set();
  return new Set(topLevelKeys(extractObjectBody(src, idx)));
}

for (const f of pageJsFiles) {
  const raw = read(f);
  const src = stripComments(raw);
  const declared = extractDataKeys(src);
  if (declared.size === 0) continue;

  const reported = new Set();
  const sdRe = /setData\s*\(/g;
  let m;
  while ((m = sdRe.exec(src)) !== null) {
    // 跳过组件级 setData（如 this.getTabBar().setData({selected:0})），它写的是组件自己的 data
    const before = src.slice(Math.max(0, m.index - 30), m.index);
    if (/getTabBar\s*\(\s*\)\s*\.\s*$/.test(before)) continue;

    const openParen = src.indexOf('(', m.index);
    const body = extractObjectBody(src, openParen);
    if (!body) continue;
    const keys = topLevelKeys(body);
    keys.forEach((key) => {
      if (!key || declared.has(key) || reported.has(key)) return;
      reported.add(key);
      warnings.push(`${rel(f)} setData 写入未在 data 声明的顶层键 "${key}"（wxml 若引用会取不到值）`);
    });
  }
}

// ───────────────── 5. 导航传参契约 ─────────────────
const pagesByRoute = {};
pages.forEach((p) => { pagesByRoute[p] = p; });

for (const f of allFiles.filter((x) => x.endsWith('.js'))) {
  const src = stripComments(read(f));
  const navRe = /(?:navigateTo|redirectTo|reLaunch)\s*\(\s*\{[\s\S]{0,200}?url\s*:\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = navRe.exec(src)) !== null) {
    const url = m[1];
    if (url.indexOf('?') < 0) continue;
    const route = url.split('?')[0].replace(/^\//, '');
    const query = url.split('?')[1];
    if (!pagesByRoute[route]) continue;

    const targetJs = path.join(MP, route + '.js');
    if (!exists(targetJs)) continue;
    const targetSrc = stripComments(read(targetJs));

    // 目标页 onLoad 的参数名
    const onLoadMatch = targetSrc.match(/\bonLoad\s*(?:\(([^)]*)\)|:\s*function\s*\(([^)]*)\))/);
    const paramName = (onLoadMatch && (onLoadMatch[1] || onLoadMatch[2] || '')).trim().split(',')[0].trim();
    if (!paramName || paramName === '') continue;

    const passed = new Set();
    query.split('&').forEach((pair) => {
      const k = pair.split('=')[0];
      if (k) passed.add(k);
    });

    [...passed].forEach((k) => {
      const used = new RegExp('\\b' + paramName + '\\s*\\.\\s*' + k + '\\b').test(targetSrc)
        || new RegExp(paramName + '\\[' + '"' + k + '"\\]').test(targetSrc)
        || new RegExp('options\\s*\\.\\s*' + k + '\\b').test(targetSrc);
      if (!used) {
        warnings.push(`${rel(f)} 导航到 ${route} 传了参数 ${k}，但目标页 onLoad(${paramName}) 未读取该参数`);
      }
    });
  }
}

// ───────────────── 6. 列表页返回时是否刷新 ─────────────────
// 只有当页面确实在「用 wx:for 渲染业务列表」、且只在 onLoad 读 storage 时才报。
// 表单页/展示"缺失字段"之类的小循环不算。
const STORAGE_LIST_HINT = /getStorageSync\(\s*['"](clients|leads|partners|customCases|aiCases|customPolicies|policySources|policyReviews)['"]/;
const LIST_VAR_RE = /wx:for\s*=\s*"\{\{\s*([A-Za-z_$][\w$]*)/g;
const LISTY_NAME = /^(clients?|cases?|aiCases|customCases|customPolicies|leads|partners|policies|sources|notes|commLogs|tasks|documents|list|items|rows)$/i;

for (const f of pageJsFiles) {
  const src = stripComments(read(f));
  if (!STORAGE_LIST_HINT.test(src)) continue;

  const wxmlPath = f.replace(/\.js$/, '.wxml');
  const wxml = exists(wxmlPath) ? read(wxmlPath) : '';

  // 取所有 wx:for 的循环变量名，判断其中是否有"业务列表"
  const loopVars = [];
  let lm;
  while ((lm = LIST_VAR_RE.exec(wxml)) !== null) loopVars.push(lm[1]);
  const hasBusinessList = loopVars.some((v) => LISTY_NAME.test(v));
  if (!hasBusinessList) continue;

  const hasOnLoad = /\bonLoad\b/.test(src);
  const hasOnShow = /\bonShow\b/.test(src);
  if (hasOnLoad && !hasOnShow) {
    warnings.push(`${rel(f)} 用 wx:for 渲染业务列表（${loopVars.join('/')}），但只有 onLoad、没有 onShow → 从子页面返回后列表不刷新`);
  }
}

// ───────────────── 7. tabBar 一致性 ─────────────────
const tabList = (appJson.tabBar && appJson.tabBar.list) || [];
const tabBarJs = path.join(MP, 'custom-tab-bar', 'index.js');
if (appJson.tabBar && appJson.tabBar.custom) {
  if (!exists(tabBarJs)) {
    errors.push('app.json 声明 tabBar.custom=true，但缺少 custom-tab-bar/index.js');
  } else {
    const src = read(tabBarJs);
    const switchTabs = (src.match(/switchTab\s*\(/g) || []).length;
    if (switchTabs !== tabList.length) {
      warnings.push(`custom-tab-bar 有 ${switchTabs} 个 switchTab 入口，但 app.json tabBar.list 有 ${tabList.length} 项`);
    }
    tabList.forEach((t) => {
      if (!pages.includes(t.pagePath)) errors.push(`tabBar 引用未注册页面：${t.pagePath}`);
    });
  }
}

// ───────────────── 9. Page 对象内重复定义的方法/键 ─────────────────
// 同一个对象字面量里重复的键，后面的会静默覆盖前面的，是典型的「改了没生效」来源。
for (const f of pageJsFiles) {
  const src = stripComments(read(f));
  const pIdx = src.search(/\bPage\s*\(\s*\{/);
  if (pIdx < 0) continue;
  const body = extractObjectBody(src, pIdx);
  if (!body) continue;
  const keys = topLevelKeys(body);
  const seen = {};
  keys.forEach((k) => {
    if (seen[k]) errors.push(`${rel(f)} 的 Page 对象里 "${k}" 重复定义（后者会覆盖前者）`);
    seen[k] = true;
  });
}

// ───────────────── 10. data 里声明但从未使用的键 ─────────────────
for (const f of pageJsFiles) {
  const src = stripComments(read(f));
  const declared = extractDataKeys(src);
  if (declared.size === 0) continue;
  const wxmlPath = f.replace(/\.js$/, '.wxml');
  const wxml = exists(wxmlPath) ? read(wxmlPath) : '';

  const unused = [];
  declared.forEach((k) => {
    if (k.charAt(0) === '_') return; // 内部标记
    const inWxml = new RegExp('\\b' + k + '\\b').test(wxml);
    const readInJs = new RegExp('this\\.data\\.' + k + '\\b').test(src);
    if (!inWxml && !readInJs) unused.push(k);
  });
  if (unused.length) {
    infos.push(`${rel(f)} data 中 ${unused.length} 个键既未被 wxml 引用、也未在 js 读取（可清理）：${unused.join(', ')}`);
  }
}

// ───────────────── 11. 工作台入口 -> 路由表 覆盖 ─────────────────
const workbenchPath = path.join(MP, 'pages/workbench/workbench.js');
if (exists(workbenchPath)) {
  const src = stripComments(read(workbenchPath));
  const qeIdx = src.search(/quickEntries\s*:\s*\[/);
  const rtIdx = src.search(/const routes\s*=\s*\{/);
  if (qeIdx >= 0 && rtIdx >= 0) {
    const qeBody = src.slice(src.indexOf('[', qeIdx));
    let d = 0, end = -1;
    for (let i = 0; i < qeBody.length; i++) {
      if (qeBody[i] === '[') d++;
      else if (qeBody[i] === ']') { d--; if (d === 0) { end = i; break; } }
    }
    const qeText = end > 0 ? qeBody.slice(0, end) : '';
    const qeKeys = [...qeText.matchAll(/key:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

    const rtBody = extractObjectBody(src, rtIdx);
    const rtKeys = topLevelKeys(rtBody);

    const noRoute = qeKeys.filter((k) => rtKeys.indexOf(k) < 0);
    if (noRoute.length) {
      warnings.push(`工作台 quickEntries 中 ${noRoute.length} 个入口没有对应路由（点击只会提示「準備中」）：${noRoute.join(', ')}`);
    }
    const orphanRoutes = rtKeys.filter((k) => qeKeys.indexOf(k) < 0);
    if (orphanRoutes.length) {
      infos.push(`工作台 routes 中有 ${orphanRoutes.length} 个路由没有入口引用（可能是遗留）：${orphanRoutes.join(', ')}`);
    }
  }
}

// ───────────────── 12. 已废弃的 wx API ─────────────────
const DEPRECATED_APIS = [
  { name: 'wx.getSystemInfoSync', alt: 'wx.getWindowInfo / getDeviceInfo' },
  { name: 'wx.getSystemInfo', alt: 'wx.getWindowInfo / getDeviceInfo' },
  { name: 'wx.createCanvasContext', alt: 'Canvas 2D 接口' },
  { name: 'wx.startPullDownRefresh', alt: 'onPullDownRefresh（页面级）' },
  { name: 'wx.chooseInvoiceTitle', alt: '已下线能力' }
];
for (const f of allFiles.filter((x) => x.endsWith('.js'))) {
  const src = stripComments(read(f));
  DEPRECATED_APIS.forEach((api) => {
    // 用「非标识符续接」边界匹配，避免 wx.getSystemInfo 命中 wx.getSystemInfoSync
    const callRe = new RegExp(api.name.replace(/\./g, '\\.') + '(?![\\w$])');
    if (!callRe.test(src)) return;
    // 若已用「能力探测 + 新版优先」的写法（typeof wx.X === 'function' 兜底），视为合规
    const guarded = new RegExp("typeof\\s+" + api.name.replace(/\./g, '\\.') + "\\s*===?\\s*['\"]function['\"]").test(src);
    if (guarded) return;
    warnings.push(`${rel(f)} 使用了已废弃 API ${api.name}，建议改用 ${api.alt}`);
  });
}

// ───────────────── 13. 死方法：定义了但从未被绑定/调用 ─────────────────
/** 把对象字面体按「深度 0 的逗号」切成顶层片段 */
function topLevelSegments(body) {
  const segs = [];
  let d = 0;
  let segStart = 0;
  let quote = null;
  for (let i = 0; i <= body.length; i++) {
    const c = body[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
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

const LIFECYCLE = new Set([
  'onLoad', 'onShow', 'onReady', 'onHide', 'onUnload', 'onPullDownRefresh',
  'onReachBottom', 'onShareAppMessage', 'onShareTimeline', 'onPageScroll',
  'onResize', 'onTabItemTap'
]);

for (const f of pageJsFiles) {
  const src = stripComments(read(f));
  const pIdx = src.search(/\bPage\s*\(\s*\{/);
  if (pIdx < 0) continue;
  const body = extractObjectBody(src, pIdx);
  if (!body) continue;

  // 只在 Page 对象的「顶层片段」里找方法定义，
  // 否则会把 wx.request({ success: () => {} }) 这类嵌套回调误当成页面方法。
  const methodNames = [];
  topLevelSegments(body).forEach((seg) => {
    const m = seg.match(/^(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*(?=\(|:)/);
    if (!m) return;
    const name = m[1] || m[2] || m[3];
    if (!name || LIFECYCLE.has(name)) return;

    const rest = seg.slice(seg.indexOf(name) + name.length).trim();
    const isMethod = /^\([^)\n]*\)\s*\{/.test(rest)                        // name(...) {
      || /^:\s*(?:async\s*)?function\s*\*?\s*\(/.test(rest)               // name: function(...)
      || /^:\s*(?:async\s*)?\([^)\n]*\)\s*=>/.test(rest);                 // name: (...) =>
    if (isMethod && methodNames.indexOf(name) < 0) methodNames.push(name);
  });
  if (methodNames.length === 0) continue;

  const wxmlPath = f.replace(/\.js$/, '.wxml');
  const wxml = exists(wxmlPath) ? read(wxmlPath) : '';

  const dead = methodNames.filter((name) => {
    if (new RegExp('(?:bind|catch)[:]?[a-zA-Z]+\\s*=\\s*"' + name + '"').test(wxml)) return false;
    if (new RegExp('this\\.' + name + '\\b').test(src)) return false;   // 内部调用或作为回调传入
    if (new RegExp('\\b' + name + '\\b').test(wxml)) return false;      // wxml 里有同名引用
    return true;
  });

  if (dead.length) {
    infos.push(`${rel(f)} 有 ${dead.length} 个方法既未被 wxml 绑定、也未被内部调用（可能是废弃功能）：${dead.join(', ')}`);
  }
}

// ───────────────── 8. 包体积 ─────────────────
let totalBytes = 0;
const byExt = {};
for (const f of allFiles) {
  const sz = fs.statSync(f).size;
  totalBytes += sz;
  const ext = path.extname(f) || '(none)';
  byExt[ext] = (byExt[ext] || 0) + sz;
}
const totalKb = totalBytes / 1024;
if (totalKb > 2048) {
  errors.push(`小程序主包体积约 ${totalKb.toFixed(0)} KB，超过 2MB 主包上限，需分包`);
} else if (totalKb > 1536) {
  warnings.push(`小程序体积约 ${totalKb.toFixed(0)} KB，接近 2MB 上限`);
}

// ───────────────── 输出 ─────────────────
console.log('=== 发布就绪度检查 ===\n');

console.log(`[ERROR] ${errors.length} 项`);
errors.forEach((e) => console.log('  ✗ ' + e));

console.log(`\n[WARN] ${warnings.length} 项`);
warnings.forEach((w) => console.log('  ! ' + w));

console.log(`\n[INFO] ${infos.length} 项`);
infos.forEach((i) => console.log('  - ' + i));

console.log('\n=== 包体积 ===');
console.log(`  合计 ${totalKb.toFixed(1)} KB（上限 2048 KB，余量 ${(2048 - totalKb).toFixed(0)} KB）`);
Object.keys(byExt).sort((a, b) => byExt[b] - byExt[a]).forEach((ext) => {
  console.log(`  ${ext.padEnd(8)} ${(byExt[ext] / 1024).toFixed(1)} KB`);
});

console.log(`\n=== 统计 ===`);
console.log(`  页面 ${pages.length} | wxml ${wxmlFiles.length} | 扫描文件 ${allFiles.length}`);

process.exit(errors.length > 0 ? 1 : 0);
