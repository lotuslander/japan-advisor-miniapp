// 生成 R11 软件著作权登记所需的「源程序鉴别材料」
//
// 依据中国版权保护中心《所需文件》要求：
//   - 源程序前、后各连续 30 页（全文不足 60 页则提交全部）
//   - 每页不少于 50 行
//   - 页眉标注软件名称与版本号（须与申请表一致）
//   - 纵向排版，文字从左向右
//
// 输出：
//   copyright/源程序鉴别材料.txt   —— 前 30 页 + 后 30 页（可直接转 PDF 上传）
//   copyright/软件说明书.txt       —— 文档鉴别材料（每页不少于 30 行）
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const MP = path.join(ROOT, 'miniprogram');
const OUT = path.join(ROOT, 'copyright');

const SOFT_NAME = '日本移民置业顾问智能工作台软件';
const VERSION = 'V1.0';
const LINES_PER_PAGE = 50;      // 源程序每页行数（≥50）
const DOC_LINES_PER_PAGE = 32;  // 文档每页行数（≥30）
const FRONT_PAGES = 30;
const BACK_PAGES = 30;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'miniprogram_npm'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}

// 收集源文件：按「入口 → 工具 → 页面 → 组件」的逻辑顺序排，便于审查阅读
const ORDER_HINT = [
  'app.js', 'app.json', 'app.wxss',
  'utils/', 'components/',
  'pages/'
];

const all = walk(MP).filter((f) => /\.(js|json|wxml|wxss)$/.test(f));

function rank(rel) {
  const p = rel.replace(/\\/g, '/');
  if (p === 'app.js') return 0;
  if (p === 'app.json') return 1;
  if (p === 'app.wxss') return 2;
  if (p.startsWith('utils/')) return 10;
  if (p.startsWith('components/')) return 20;
  return 30;
}

const files = all
  .map((f) => ({ abs: f, rel: path.relative(MP, f).replace(/\\/g, '/') }))
  .sort((a, b) => {
    const d = rank(a.rel) - rank(b.rel);
    return d !== 0 ? d : a.rel.localeCompare(b.rel);
  });

// 组装全部源码行（每行前保留文件路径作为注释分隔，便于审查定位）
const srcLines = [];
for (const f of files) {
  const content = fs.readFileSync(f.abs, 'utf8').replace(/\r\n/g, '\n').split('\n');
  // 去掉文件末尾多余空行
  while (content.length > 0 && content[content.length - 1].trim() === '') content.pop();
  srcLines.push('/* ===== FILE: ' + f.rel + ' ===== */');
  content.forEach((l) => srcLines.push(l));
  srcLines.push('');
}

// 分页
const totalPages = Math.ceil(srcLines.length / LINES_PER_PAGE);
const pages = [];
for (let i = 0; i < totalPages; i++) {
  pages.push(srcLines.slice(i * LINES_PER_PAGE, (i + 1) * LINES_PER_PAGE));
}

// 取前 30 页 + 后 30 页
let selectedPages;
let mode;
if (totalPages <= FRONT_PAGES + BACK_PAGES) {
  selectedPages = pages.map((p, i) => ({ no: i + 1, lines: p }));
  mode = '全文提交（共 ' + totalPages + ' 页，未超过 60 页）';
} else {
  const front = pages.slice(0, FRONT_PAGES).map((p, i) => ({ no: i + 1, lines: p }));
  const backStart = totalPages - BACK_PAGES;
  const back = pages.slice(backStart).map((p, i) => ({ no: backStart + i + 1, lines: p }));
  selectedPages = front.concat(back);
  mode = '前 30 页 + 后 30 页（全文 ' + totalPages + ' 页）';
}

// 输出源程序鉴别材料
function renderPage(pg, pageIndex, totalOut) {
  const header = SOFT_NAME + '  ' + VERSION + '      第 ' + (pageIndex + 1) + ' / ' + totalOut + ' 页';
  const out = [header, '-'.repeat(78)];
  // 补齐到 LINES_PER_PAGE 行（页尾空白补足，保证每页 ≥50 行）
  for (let i = 0; i < LINES_PER_PAGE; i++) {
    out.push(pg.lines[i] !== undefined ? pg.lines[i] : '');
  }
  return out.join('\n');
}

const srcDoc = selectedPages.map((pg, i) => renderPage(pg, i, selectedPages.length)).join('\n\f\n');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, '源程序鉴别材料.txt'), srcDoc, 'utf8');

// ───────── 生成软件说明书 ─────────
const meta = {
  name: SOFT_NAME,
  version: VERSION,
  totalFiles: files.length,
  totalLines: srcLines.length,
  totalPages: totalPages,
  submitMode: mode,
  submitPages: selectedPages.length,
  lineRange: '前 30 页：第 1–' + Math.min(FRONT_PAGES * LINES_PER_PAGE, srcLines.length) + ' 行'
    + (totalPages > 60 ? '；后 30 页：第 ' + ((totalPages - BACK_PAGES) * LINES_PER_PAGE + 1) + '–' + srcLines.length + ' 行' : '')
};

const doc = [];
function H(t) { doc.push(''); doc.push('# ' + t); doc.push(''); }
function P(t) { doc.push(t); }
function LI(t) { doc.push('  ' + t); }

H(SOFT_NAME + ' ' + VERSION + '  软件说明书');
P('一、软件概述');
P('');
P('本软件是一款面向日本移民与不动产投资领域顾问的智能工作台，采用微信小程序技术栈实现，');
P('运行于纯端侧环境，所有业务数据均保存在用户本机，不经过任何中间服务器。');
P('');
P('软件以小程序的页面（Page）为单位组织功能，以自定义组件（Component）复用交互单元，');
P('以本地知识库与本地存储作为数据层，通过用户自行配置的大语言模型接口完成智能化能力。');
P('');
P('二、技术架构');
P('');
P('1. 运行形态');
LI('宿主：微信小程序（基础库 2.2.3 及以上）');
LI('渲染：WXML 结构 + WXSS 样式 + JavaScript 逻辑，原生小程序框架');
LI('数据：wx.setStorageSync / wx.getStorageSync 本地持久化，无云端依赖');
P('');
P('2. 外部依赖');
LI('仅依赖用户自行配置的大语言模型 HTTP 接口（OpenAI 兼容格式）');
LI('日本政府官网等外部网页由大模型侧访问，小程序本身不直连，');
LI('因此小程序服务器域名白名单只需配置所选模型的一个域名。');
P('');
P('3. 目录结构');
LI('app.js / app.json / app.wxss —— 全局入口、路由与样式');
LI('pages/ —— 业务页面，每页由 .js/.wxml/.wxss/.json 四个文件组成');
LI('components/ —— 自定义组件（全局 AI 悬浮球、客户进度条、政策新闻滚动条）');
LI('utils/ —— 工具层：本地知识库、政策源清单、AI 更新引擎、存储安全读取、数据备份');
P('');

H('三、功能模块说明');
const MODULES = [
  ['工作台（pages/workbench）', '首页聚合入口：AI 政策更新、AI 案例更新、今日待办、政策新闻滚动条、21 个功能快捷入口、政策源清单展示。'],
  ['政策更新引擎（utils/ai-updater.js）', '将 48 个日本官方政策源地址分批提交给用户配置的大模型，要求其返回严格 JSON 结构；解析后按标题与日期去重写入本地政策库；具备防幻觉设计（无联网能力时返回 no_web_access 而非编造）。'],
  ['政策源清单（utils/policy-sources.js）', '统一维护 20 条精确政策页深链、28 个机构官网、7 条判例检索源，并提供机关名称到官网地址的映射。'],
  ['政策年表（pages/timeline）', '按分类展示政策时间线，合并内置政策与 AI 更新结果，标注 AI 来源与核验状态。'],
  ['政策審査（pages/policy-review）', 'AI 更新的政策进入待核验队列，顾问可填写资本金、日语要求、员工要求、过渡期等结构化字段并确认生效或驳回，结论持久化保存。'],
  ['客户管理（pages/clients、client-detail、client-intake）', '客户列表、详情、语音/文字录入。详情页支持跟进记录、沟通记录、关联案件、待办任务，全部真实读写本地存储。'],
  ['案件工作台（pages/case-workbench）', '案件阶段推进（咨询→评分→定案→执行→落地→归档）、材料清单（按签证类型从内置清单生成）、待办任务勾选，状态持久化。'],
  ['案例库（pages/cases-library、case-lib-detail）', '内置成功与不许可案例，支持分类筛选与关键词搜索。'],
  ['高度人才积分计算（pages/calculator）', '依据入管厅积分制口径计算学历、职历、年收、年龄、日语加分，结果可写入客户档案。'],
  ['不动产收益测算（pages/rei-calc）', '表面利回与实质利回测算，含取得费用、持有成本、空室率、托管费明细。'],
  ['费用估算（pages/fees）', '按签证路径估算官方费用与行政书士报酬区间。'],
  ['文书生成（pages/documents）', '按签证类型生成理由书框架，支持口述填表。'],
  ['AI 对话（pages/chat）', '基于内置知识库检索增强的大模型对话，内置风险预警规则与客户信息提取规则。'],
  ['知识库管理（pages/knowledge-admin）', '查看内置政策与案例、添加自定义政策、删除 AI 更新条目。'],
  ['数据备份（utils/data-transfer.js）', '导出/导入全部用户数据（12 个键），带格式版本号与类型校验，畸形备份不会污染存储。'],
];
MODULES.forEach((m, i) => {
  P((i + 1) + '. ' + m[0]);
  P('   ' + m[1]);
  P('');
});

H('四、数据存储设计');
P('本地存储键清单：');
const KEYS = [
  ['clients', '客户档案（含备注 notes、沟通记录 comm_logs、积分结果 hsp）'],
  ['leads', '线索记录'],
  ['partners', '合作方资源'],
  ['customCases', '用户自建案件'],
  ['aiCases', 'AI 更新的案例'],
  ['customPolicies', 'AI 更新与用户自定义政策'],
  ['policyReviews', '政策审核结论与结构化字段'],
  ['policySources', '政策源（可自定义增删）'],
  ['chatHistory', '对话历史'],
  ['llmConfig', '用户自行填写的大模型配置（BaseURL / Key / 模型名）'],
  ['advisorName', '顾问姓名'],
  ['renewal_done', '续签检查项完成状态'],
];
KEYS.forEach(([k, d]) => P('  ' + k.padEnd(18) + d));
P('');
P('安全说明：软件不内置任何 API Key，用户密钥仅保存在本机，不上传任何服务器。');
P('读取统一经过 utils/storage.js 做类型归一，非数组/非对象一律退回空容器，避免脏数据导致页面异常。');
P('');

H('五、运行环境');
P('  操作系统：Android 5.0 及以上 / iOS 12 及以上（微信客户端）');
P('  宿主平台：微信客户端（基础库 2.2.3 及以上）');
P('  编程语言：JavaScript（ES6）、WXML、WXSS');
P('  网络要求：可访问用户所选大模型接口；其余功能完全离线可用');
P('');

H('六、源程序鉴别材料说明');
P('  软件名称：' + meta.name);
P('  版本号：' + meta.version);
P('  源程序文件数：' + meta.totalFiles + ' 个');
P('  源程序总行数：' + meta.totalLines + ' 行');
P('  按每页 ' + LINES_PER_PAGE + ' 行折算：全文共 ' + meta.totalPages + ' 页');
P('  提交方式：' + meta.submitMode);
P('  提交页数：' + meta.submitPages + ' 页');
P('  行号范围：' + meta.lineRange);
P('');
P('  说明：源程序按「全局入口 → 工具层 → 组件层 → 页面层」的顺序连续排列，');
P('        每页页眉标注软件名称与版本号，每页 ' + LINES_PER_PAGE + ' 行。');
P('');

H('七、版本记录');
P('  V1.0    首次发表版本。包含政策更新引擎、客户与案件管理、积分与收益测算、');
P('          文书生成、AI 对话、政策审核、数据备份等完整功能模块。');
P('');

// 文档分页：每页 ≥30 行
const docBody = [];
doc.forEach((l) => docBody.push(l));
const docPages = Math.ceil(docBody.length / DOC_LINES_PER_PAGE);
const docOut = [];
for (let i = 0; i < docPages; i++) {
  const chunk = docBody.slice(i * DOC_LINES_PER_PAGE, (i + 1) * DOC_LINES_PER_PAGE);
  const hdr = SOFT_NAME + '  ' + VERSION + '  软件说明书      第 ' + (i + 1) + ' / ' + docPages + ' 页';
  const lines = [hdr, '-'.repeat(78)];
  for (let k = 0; k < DOC_LINES_PER_PAGE; k++) lines.push(chunk[k] !== undefined ? chunk[k] : '');
  docOut.push(lines.join('\n'));
}
fs.writeFileSync(path.join(OUT, '软件说明书.txt'), docOut.join('\n\f\n'), 'utf8');

console.log('=== R11 源程序鉴别材料生成完成 ===');
console.log('  软件名称: ' + SOFT_NAME);
console.log('  版本号  : ' + VERSION);
console.log('  文件数  : ' + meta.totalFiles);
console.log('  总行数  : ' + meta.totalLines);
console.log('  全文页数: ' + meta.totalPages);
console.log('  提交方式: ' + meta.submitMode);
console.log('  提交页数: ' + meta.submitPages + ' 页（每页 ' + LINES_PER_PAGE + ' 行）');
console.log('  说明书  : ' + docPages + ' 页（每页 ' + DOC_LINES_PER_PAGE + ' 行）');
console.log('  输出目录: ' + OUT);
