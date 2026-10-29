// 页面可达性检查：找出没有任何导航入口、也不在 tabBar 的孤儿页面
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const MP = path.join(ROOT, 'miniprogram');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'miniprogram_npm', '.git'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}

const app = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));
const pages = app.pages || [];
const targets = new Set();

const navRe = /(?:navigateTo|redirectTo|reLaunch|switchTab)\s*\(\s*\{[\s\S]{0,200}?url\s*:\s*['"`]([^'"`?]+)/g;
// 也统计任意 '/pages/xxx/xxx' 字符串字面量（例如 workbench 的 routes 映射表）
const pageLiteralRe = /['"`]\/?(pages\/[\w-]+\/[\w-]+)['"`]/g;

for (const f of walk(MP).filter(f => f.endsWith('.js'))) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = navRe.exec(src)) !== null) {
    targets.add(m[1].replace(/^\//, ''));
  }
  while ((m = pageLiteralRe.exec(src)) !== null) {
    targets.add(m[1]);
  }
}

const tab = ((app.tabBar && app.tabBar.list) || []).map(x => x.pagePath);
const entry = pages[0];
const orphans = pages.filter(p => !targets.has(p) && !tab.includes(p) && p !== entry);

console.log(`页面总数: ${pages.length}`);
console.log(`入口页: ${entry}`);
console.log(`tabBar: ${tab.join(', ') || '(无)'}`);
console.log(`被导航引用: ${targets.size} 个不同目标`);
console.log(`\n无任何入口的页面 (${orphans.length}):`);
orphans.forEach(p => console.log('  ' + p));

// 反向：nav 目标存在但页面未注册，已在主检查覆盖，这里仅统计
const toMissing = [...targets].filter(t => !pages.includes(t));
if (toMissing.length) {
  console.log(`\n导航指向未注册页面 (${toMissing.length}):`);
  toMissing.forEach(t => console.log('  ' + t));
}

process.exit(orphans.length > 0 ? 1 : 0);
