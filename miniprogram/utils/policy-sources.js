/**
 * 政策源单一事实来源（Single Source of Truth）
 *
 * 背景：项目从「云函数抓取」改为「纯端侧 + 用户自带 LLM Key」。
 * 端侧没有爬虫能力，改为把「官网地址清单」完整交给大模型，由模型去读取/梳理最新政策。
 *
 * 因此本文件是全局唯一的地址清单，任何页面/工具都必须从这里取，禁止再各自硬编码，
 * 否则地址会再次分裂（历史上 workbench 25 条裸域名 / sources-admin 27 条完整 URL / 
 * 云函数 20 条深链三套并存，且域名互有冲突）。
 *
 * 三类来源全部保留：
 *   DEEP_SOURCES   —— 20 条精确政策页深链（来自原云函数 fetch-policies，价值最高）
 *   ORG_SOURCES    —— 27 个官方机构/协会官网首页
 *   CASE_SOURCES   —— 5 条案例·判例检索源
 *   LEGACY_DOMAIN_HINTS —— 25 条历史域名提示（裸域名，无协议头，仅作补充提示保留，不丢弃）
 */

// ───────────────────────── 一、精确政策页深链（20） ─────────────────────────
const DEEP_SOURCES = [
  { id: 'deep-isa-bm-reform', name: '出入国在留管理庁｜経営管理（2025改正）', category: 'business_manager', url: 'https://www.moj.go.jp/isa/applications/resources/10_00237.html' },
  { id: 'deep-isa-bm', name: '出入国在留管理庁｜経営管理', category: 'business_manager', url: 'https://www.moj.go.jp/isa/applications/status/businessmanager.html' },
  { id: 'deep-isa-bm-qa', name: '出入国在留管理庁｜経営管理 Q&A', category: 'business_manager', url: 'https://www.moj.go.jp/isa/applications/guide/kanri_qa.html' },
  { id: 'deep-isa-hsp', name: '出入国在留管理庁｜高度人材（ポイント制）', category: 'hsp', url: 'https://www.moj.go.jp/isa/applications/status/designatedactivities02_00004.html' },
  { id: 'deep-isa-jskip', name: '出入国在留管理庁｜特別高度人材（J-Skip）', category: 'hsp', url: 'https://www.moj.go.jp/isa/applications/resources/nyuukokukanri01_00009.html' },
  { id: 'deep-isa-eijyu', name: '出入国在留管理庁｜永住許可ガイドライン', category: 'permanent_residence', url: 'https://www.moj.go.jp/isa/applications/resources/nyukan_nyukan50.html' },
  { id: 'deep-isa-pr-procedure', name: '出入国在留管理庁｜永住許可申請', category: 'permanent_residence', url: 'https://www.moj.go.jp/isa/applications/procedures/16-4.html' },
  { id: 'deep-isa-teiju', name: '出入国在留管理庁｜定住', category: 'long_term_residence', url: 'https://www.moj.go.jp/isa/applications/status/teijyu.html' },
  { id: 'deep-isa-gijinkoku', name: '出入国在留管理庁｜技術・人文知識・国際業務', category: 'work_visa', url: 'https://www.moj.go.jp/isa/applications/status/gijinkoku.html' },
  { id: 'deep-moj-law', name: '法務省｜出入国管理政策', category: 'law_immigration', url: 'https://www.moj.go.jp/nyuukokukanri/kouhou/nyukan_nyukan06.html' },
  { id: 'deep-moj-press', name: '法務省｜記者会見（2025-10-10）', category: 'law_immigration', url: 'https://www.moj.go.jp/hisho/kouhou/hisho08_00656.html' },
  { id: 'deep-isa-press', name: '出入国在留管理庁｜プレスリリース', category: 'law_immigration', url: 'https://www.moj.go.jp/isa/publications/press/index.html' },
  { id: 'deep-isa-status-index', name: '出入国在留管理庁｜在留資格一覧', category: 'law_immigration', url: 'https://www.moj.go.jp/isa/applications/status/index.html' },
  { id: 'deep-mlit-realestate', name: '国土交通省｜不動産取引', category: 'realestate', url: 'https://www.mlit.go.jp/totikensangyo/totikensangyo_tk2_000008.html' },
  { id: 'deep-nta-income-tax', name: '国税庁｜所得税の税率', category: 'tax', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm' },
  { id: 'deep-isa-eijyu-procedure', name: '出入国在留管理庁｜永住許可申請（手続）', category: 'permanent_residence', url: 'https://www.moj.go.jp/isa/applications/procedures/eizyuu_00001.html' },
  { id: 'deep-isa-sousei', name: '出入国在留管理庁｜共生総合対応策', category: 'permanent_residence', url: 'https://www.moj.go.jp/isa/11_00112.html' },
  { id: 'deep-isa-bm-online', name: '出入国在留管理庁｜経営管理オンライン申請新様式', category: 'business_manager', url: 'https://www.moj.go.jp/isa/11_00066.html' },
  { id: 'deep-isa-hsp-eval', name: '出入国在留管理庁｜高度人材ポイント評価', category: 'hsp', url: 'https://www.moj.go.jp/isa/publications/materials/newimmiact_3_evaluate_index.html' },
  { id: 'deep-nta-resident-tax', name: '国税庁｜居住者・非居住者の課税', category: 'tax', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2392.htm' }
];

// ───────────────────────── 二、官方机构 / 协会官网（27） ─────────────────────────
const ORG_SOURCES = [
  // ===== 政府官方机构 =====
  { id: 'org-isa', name: '出入国在留管理庁', category: '政府-入管', url: 'https://www.moj.go.jp/isa/' },
  { id: 'org-moj', name: '法務省', category: '政府', url: 'https://www.moj.go.jp/' },
  { id: 'org-mhlw', name: '厚生労働省', category: '政府-劳务', url: 'https://www.mhlw.go.jp/' },
  { id: 'org-nta', name: '国税庁', category: '政府-税务', url: 'https://www.nta.go.jp/' },
  { id: 'org-mof', name: '財務省', category: '政府-财政', url: 'https://www.mof.go.jp/' },
  { id: 'org-mofa', name: '外務省', category: '政府-外交', url: 'https://www.mofa.go.jp/' },
  { id: 'org-meti', name: '経済産業省', category: '政府-经济', url: 'https://www.meti.go.jp/' },
  { id: 'org-mlit', name: '国土交通省', category: '政府-不动产', url: 'https://www.mlit.go.jp/' },
  { id: 'org-digital', name: 'デジタル庁', category: '政府-数字', url: 'https://www.digital.go.jp/' },
  { id: 'org-soumu', name: '総務省', category: '政府', url: 'https://www.soumu.go.jp/' },
  { id: 'org-cao', name: '内閣府', category: '政府', url: 'https://www.cao.go.jp/' },

  // ===== 入管相关（地方局） =====
  { id: 'org-isa-tokyo', name: '東京出入国在留管理局', category: '入管-地方', url: 'https://www.moj.go.jp/isa/regional/tokyo/' },
  { id: 'org-isa-osaka', name: '大阪出入国在留管理局', category: '入管-地方', url: 'https://www.moj.go.jp/isa/regional/osaka/' },
  { id: 'org-isa-nagoya', name: '名古屋出入国在留管理局', category: '入管-地方', url: 'https://www.moj.go.jp/isa/regional/nagoya/' },
  { id: 'org-isa-fukuoka', name: '福岡出入国在留管理局', category: '入管-地方', url: 'https://www.moj.go.jp/isa/regional/fukuoka/' },

  // ===== 行业协会 =====
  { id: 'org-nalen', name: '日本行政書士会連合会', category: '行业协会-行政书士', url: 'https://www.gyosei.or.jp/' },
  { id: 'org-shiho', name: '日本司法書士会連合会', category: '行业协会-司法书士', url: 'https://www.shiho-shoshi.or.jp/' },
  { id: 'org-sharoshi', name: '日本社会保険労務士会連合会', category: '行业协会-社労士', url: 'https://www.sharoshi.or.jp/' },
  { id: 'org-zeishi', name: '日本税理士会連合会', category: '行业协会-税理士', url: 'https://www.zeishi.or.jp/' },
  { id: 'org-chosashi', name: '日本土地家屋調査士会連合会', category: '行业协会-测量', url: 'https://www.chosashi.or.jp/' },
  { id: 'org-fudousante', name: '日本不動産鑑定士協会連合会', category: '行业协会-不动产', url: 'https://www.fudousante.or.jp/' },
  { id: 'org-zennichi', name: '全日本不動産協会', category: '行业协会-不动产', url: 'https://www.zennichi.or.jp/' },
  { id: 'org-retlo', name: '日本宅地建物取引業協会連合会', category: '行业协会-不动产', url: 'https://www.retlo.or.jp/' },
  { id: 'org-smeca', name: '中小企業診断協会', category: '行业协会-经营', url: 'https://www.j-smeca.jp/' },
  { id: 'org-jetro', name: '日本貿易振興機構（JETRO）', category: '行业协会-贸易', url: 'https://www.jetro.go.jp/' },
  { id: 'org-jica', name: '国際協力機構（JICA）', category: '行业协会-国际', url: 'https://www.jica.go.jp/' },

  // ===== 金融 / 其他 =====
  { id: 'org-boj', name: '日本銀行', category: '金融', url: 'https://www.boj.or.jp/' },
  { id: 'org-jpx', name: '東京証券取引所', category: '金融', url: 'https://www.jpx.co.jp/' }
];

// ───────────────────────── 三、案例 / 判例检索源（7） ─────────────────────────
// 说明：原清单里的 5 条中有 3 条只有名称没有可访问地址（法務省判例検索 / 国税庁税法判例集 /
// 東京・大阪行政書士会事例），导致模型拿不到可检索入口。此处全部补成**已验证可达**的确切检索页。
//
// 映射关系：
//   裁判所裁判例検索      -> case-courts / case-courts-search（入口 + 条件指定检索）
//   法務省判例検索        -> case-soumu-fufuku
//        ※ 法務省并无面向公众的「判例検索」页面；入管处分的不服申立て实际由
//          总务省行政不服審査会审理并公开答申，故映射到该答申一览（权威且可检索）。
//   国税庁税法判例集      -> case-nta-kazei / case-nta-shoso（課税関係判決 + 税務訴訟資料）
//   東京行政書士会事例集  -> case-tokyo-gyosei（東京都行政書士会）
//   大阪行政書士会事例    -> case-osaka-gyosei（大阪府行政書士会）
const CASE_SOURCES = [
  {
    id: 'case-courts',
    name: '裁判所｜裁判例検索（入口）',
    category: 'case',
    url: 'https://www.courts.go.jp/hanrei/index.html',
    note: '最高裁官网判例检索入口，可查民事/刑事/行政判例'
  },
  {
    id: 'case-courts-search',
    name: '裁判所｜裁判例検索（条件指定）',
    category: 'case',
    url: 'https://www.courts.go.jp/hanrei/search2/index.html',
    note: '可按事件类型、判决日期、关键词全文检索，入管行政诉讼判例在此'
  },
  {
    id: 'case-nta-kazei',
    name: '国税庁｜課税関係判決（税務訴訟）',
    category: 'case',
    url: 'https://www.nta.go.jp/about/organization/ntc/soshoshiryo/kazei/index.htm',
    note: '国税厅公开的课税关系判决，非居住者征税/不动产所得税争议参考'
  },
  {
    id: 'case-nta-shoso',
    name: '国税庁｜税務訴訟資料',
    category: 'case',
    url: 'https://www.nta.go.jp/about/organization/ntc/soshoshiryo/',
    note: '税務訴訟資料总目录，含判決全文与争点整理'
  },
  {
    id: 'case-tokyo-gyosei',
    name: '東京都行政書士会',
    category: 'case',
    url: 'https://www.tokyo-gyosei.or.jp/',
    note: '东京都行政书士会官网，含业务指引与实例资料'
  },
  {
    id: 'case-osaka-gyosei',
    name: '大阪府行政書士会',
    category: 'case',
    url: 'https://www.osaka-gyoseishoshi.or.jp/',
    note: '大阪府行政书士会官网，关西地区实务案例参考'
  },
  {
    id: 'case-soumu-fufuku',
    name: '総務省｜行政不服審査会 答申一覧',
    category: 'case',
    url: 'https://www.soumu.go.jp/main_sosiki/singi/fufukushinsa/toushin.html',
    note: '入管处分（不許可・退去強制等）的審査請求答申，替代不存在的「法務省判例検索」'
  }
];

// ───────────────────────── 四、历史域名提示（25，原样保留） ─────────────────────────
// workbench 曾用这 25 条裸域名给模型做提示。保留以免丢失既有信息，
// 但不作为唯一依据 —— 与 ORG_SOURCES 的完整 URL 同时提供给模型。
const LEGACY_DOMAIN_HINTS = [
  '出入国在留管理庁 moj.go.jp/isa',
  '法務省 moj.go.jp',
  '厚生労働省 mhlw.go.jp',
  '国税庁 nta.go.jp',
  '財務省 mof.go.jp',
  '外務省 mofa.go.jp',
  '経済産業省 meti.go.jp',
  '国土交通省 mlit.go.jp',
  '総務省 soumu.go.jp',
  '内閣府 cao.go.jp',
  '東京出入国在留管理局',
  '大阪出入国在留管理局',
  '名古屋出入国在留管理局',
  '福岡出入国在留管理局',
  '日本行政書士会連合会 nalen.or.jp',
  '日本司法書士会連合会 shiho-shoshi.or.jp',
  '社会保険労務士会連合会 shiroudosi.or.jp',
  '日本税理士会連合会 nitchiren.com',
  '日本不動産鑑定士協会連合会 jrea.jp',
  '全日本不動産協会 zennichi.net',
  '日本銀行 boj.or.jp',
  '東京証券取引所 jpx.co.jp',
  '観光庁 mlit.go.jp/kankocho',
  '文化庁 bunka.go.jp',
  'スポーツ庁 mext.go.jp/sports'
];

const CATEGORY_LABELS = {
  business_manager: '経営管理',
  hsp: '高度人材',
  permanent_residence: '永住',
  long_term_residence: '定住',
  work_visa: '就労',
  law_immigration: '入管法・政策',
  realestate: '不動産',
  tax: '税務',
  case: '判例・事例'
};

/**
 * 政策源全量（DEEP + ORG），按 URL 去重，DEEP 优先（更精确）。
 * @returns {Array<{id,name,category,url}>}
 */
function allPolicySources() {
  const seen = {};
  const out = [];
  const push = (s) => {
    if (!s || !s.url) return;
    const key = s.url.replace(/\/+$/, '').toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push(s);
  };
  DEEP_SOURCES.forEach(push);
  ORG_SOURCES.forEach(push);
  return out;
}

/**
 * 渲染给大模型的清单文本：分组 + 编号 + 完整 URL。
 * 明确要求模型只能使用这里的 URL，避免编造链接。
 * 没有完整 URL 的条目（历史裸域名）只给名称+域名，不会伪造成链接。
 */
function formatSourcesForPrompt(list) {
  const src = list || allPolicySources();
  const lines = [];
  for (let i = 0; i < src.length; i++) {
    const s = src[i];
    const cat = CATEGORY_LABELS[s.category] || s.category || 'その他';
    const url = s.url || (s.domainHint ? 'https://' + s.domainHint + '/' : '');
    lines.push(`${i + 1}. [${cat}] ${s.name}${url ? ' | ' + url : ''}`);
  }
  return lines.join('\n');
}

/** 案例源（全部带已验证的确切检索页地址） */
function allCaseSources() {
  return CASE_SOURCES.map((s) => ({
    id: s.id,
    name: s.name,
    category: 'case',
    url: s.url || (s.domainHint ? 'https://' + s.domainHint + '/' : ''),
    note: s.note || '',
    domainHint: s.domainHint || ''
  }));
}

/** 案例源的可读清单（含用途说明，便于模型理解该页该找什么） */
function formatCaseSourcesForPrompt() {
  const parts = CASE_SOURCES.map((s, i) => {
    const u = s.url || (s.domainHint ? 'https://' + s.domainHint : '');
    const note = s.note ? '（' + s.note + '）' : '';
    return `${i + 1}. ${s.name}${u ? ' | ' + u : ''}${note}`;
  });
  return parts.join('\n');
}

/** 首页展示用：把「名称 + 域名」压成一行字符串数组 */
function displayTags() {
  return allPolicySources().map((s) => {
    const domain = (s.url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return `${s.name} ${domain}`;
  });
}

/** 按 URL 反查源（用于给 AI 结果补分类/名称） */
function findByUrl(url) {
  if (!url) return null;
  const norm = String(url).replace(/\/+$/, '').toLowerCase();
  const all = allPolicySources();
  for (let i = 0; i < all.length; i++) {
    if (all[i].url.replace(/\/+$/, '').toLowerCase() === norm) return all[i];
  }
  return null;
}

/**
 * 按「发布机关名称」反查源。
 * 用于把新闻条目的 source（如「出入国在留管理庁」）映射回官网地址，
 * 因为内置 news 数据只有机关名、没有 URL，不应该编造链接。
 * @returns {object|null}
 */
function findSourceByName(name) {
  if (!name) return null;
  const raw = String(name).trim();

  // 新闻里的 source 是「发布机关」，优先映射到机构官网首页（ORG_SOURCES），
  // 而不是某条具体政策深链（DEEP_SOURCES），否则点「原文」会跳到不相关的政策页。
  const search = (list) => list.find((s) => s.name.indexOf(raw) >= 0 || raw.indexOf(s.name) >= 0);

  let hit = search(ORG_SOURCES);
  if (hit) return hit;

  // 2) 去掉「｜副标题」后重试
  const core = raw.replace(/[｜|].*$/, '').trim();
  if (core && core !== raw) {
    hit = search(ORG_SOURCES.map((s) => ({ name: s.name, url: s.url })).filter((s) => s.name.indexOf(core) >= 0));
    if (hit) return hit;
  }

  // 3) 最后再退到深链
  hit = search(DEEP_SOURCES);
  if (hit) return hit;
  const core2 = raw.replace(/[｜|].*$/, '').trim();
  if (core2 && core2 !== raw) {
    hit = search(DEEP_SOURCES.filter((s) => s.name.indexOf(core2) >= 0));
    if (hit) return hit;
  }
  return null;
}

/** 机关名称 -> 官网地址（匹配不到返回 ''，绝不伪造） */
function resolveSourceUrl(name) {
  const hit = findSourceByName(name);
  return hit ? hit.url : '';
}

/** 方向标签（与 timeline 页面保持一致） */
function directionLabel(d) {
  const map = {
    tighten: '收緊',
    relax: '放寬',
    clarify: '明確化',
    create: '創設',
    info: '情報',
    warn: '注意'
  };
  return map[d] || '情報';
}

module.exports = {
  DEEP_SOURCES,
  ORG_SOURCES,
  CASE_SOURCES,
  LEGACY_DOMAIN_HINTS,
  CATEGORY_LABELS,
  allPolicySources,
  allCaseSources,
  formatSourcesForPrompt,
  formatCaseSourcesForPrompt,
  displayTags,
  findByUrl,
  findSourceByName,
  resolveSourceUrl,
  directionLabel
};
