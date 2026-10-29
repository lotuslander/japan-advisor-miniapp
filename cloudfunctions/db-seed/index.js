const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function clearCollection(name) {
  // 云开发批量删除：每次最多 100 条，循环删完
  const col = db.collection(name);
  let removed = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await col.where({ _id: db.command.exists(true) }).limit(100).remove();
    removed += res.stats.removed || 0;
    if (!res.stats.removed) break;
  }
  return removed;
}

async function seedCollection(name, docs, force) {
  const col = db.collection(name);
  const count = await col.count();
  if (count.total > 0) {
    if (!force) {
      return { name, skipped: count.total, reason: '已有数据，跳过' };
    }
    await clearCollection(name);
  }
  let inserted = 0;
  for (const d of docs) {
    await col.add({ data: d });
    inserted++;
  }
  return { name, inserted };
}

exports.main = async (event = {}) => {
  const force = !!(event && event.force);
  const results = {};

  // 1. 政策原文（官方源，20 条，内容经日本官方页面核验）
  results.policies = await seedCollection('policies', [
    // ── 经营管理签（核心，7 条）──
    {
      title_ja: '在留資格「経営・管理」に係る上陸基準省令等の改正について（令和7年10月16日施行）',
      title_zh: '经营管理在留资格上陆基准省令改正（2025年10月16日施行）',
      summary: '官方权威文件。改正要点：①须雇用 1 名以上常勤职员（对象为日本人/特别永住者/法别表第二在留者，法别表第一在留者不属对象）；②资本金 3000 万日元以上（法人=资本金/出资总额，个人事业主=投下资金总额）；③申请人或常勤职员任一方须具备 B2 相当日语能力（JLPT N2 以上 / BJT 400 点以上 / 在日 20 年以上 / 日本高等教育毕业 / 日本义务教育+高中毕业）；④须有经营管理相关博士/硕士/专门职学位或 3 年以上经营管理经验；⑤事业计划书须经中小企业诊断士/公认会计士/税理士确认；⑥原则上不认可自宅兼事务所；⑦长期无正当理由出国、公租公课不履行等成为消极审查要素。施行日 3 年内（至 2028-10-16）旧在留者更新不因新基准不满足而被拒。',
      url: 'https://www.moj.go.jp/isa/applications/resources/10_00237.html',
      category: 'business_manager',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2025-10-16',
      effective_at: '2025-10-16',
      status: 'effective',
      direction: 'tighten',
      // 结构化字段（供历史对比/积分测算/检索引用）
      capital_min_jpy: 30000000,
      japanese_level: 'B2相当（申请人或常勤职员任一方：N2/BJT400/在日20年/日本高教毕业）',
      employee_required: true,
      expert_review: true,
      transition_until: '2028-10-16',
      impact: '资本金 6 倍、日语任一方 B2、专家背书三要素叠加；个人事业主按投下资金总额计。',
      keywords: ['经营管理', '経営管理', '3000万', 'B2', 'N2', '常勤职员', '专家确认', '过渡期']
    },
    {
      title_ja: '出入国管理及び難民認定法第七条第一項第二号の基準を定める省令（改正）',
      title_zh: '入管法第七条第一项第二号基准省令（2025年10月16日施行）',
      summary: '经营管理签许可基准省令改正条文。规模要件：法人的资本金 3000 万日元以上；个人事业主为事业所需投下资金总额 3000 万日元以上；常勤职员 1 名以上；日语能力 B2 相当（N2/BJT400/在日20年/日本高教毕业）；学历或 3 年以上经营管理经验；专家确认事业计划书。',
      url: 'https://www.moj.go.jp/isa/applications/status/businessmanager.html',
      category: 'business_manager',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2025-10-16',
      effective_at: '2025-10-16',
      status: 'effective',
      direction: 'tighten'
    },
    {
      title_ja: '経営管理ビザの要件（2025年改正前）',
      title_zh: '经营管理签旧要件（2025年改正前，2025-10-15 前有效）',
      summary: '改正前标准：资本金 500 万日元以上，或雇用 2 名以上常勤职员（二选一）；无日语硬性要求；不要求专家背书；自宅兼事务所原则认可；无学历/经验硬性要求。2025-10-16 起废止，转按新规执行。施行日前受理的申请仍按旧基准审查。',
      url: 'https://www.moj.go.jp/isa/applications/status/businessmanager.html',
      category: 'business_manager',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2025-10-15',
      effective_at: '',
      status: 'pending_review',
      direction: 'clarify'
    },
    {
      title_ja: '経営管理ビザ新設（2006年）',
      title_zh: '经营管理在留资格创设（2006年）',
      summary: '「投資・経営」在留资格自 2006 年设立，为外国人在日本从事经营管理活动提供制度基础。资本金标准 500 万日元。',
      url: 'https://www.moj.go.jp/isa/applications/status/businessmanager.html',
      category: 'business_manager',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2006-04-01',
      effective_at: '2006-04-01',
      status: 'effective',
      direction: 'create'
    },
    {
      title_ja: '在留資格名称変更（2015年）',
      title_zh: '在留资格名称变更（2015年）',
      summary: '「投資・経営」更名为「経営・管理」。资本金标准为 500 万日元以上。',
      url: 'https://www.moj.go.jp/isa/applications/status/businessmanager.html',
      category: 'business_manager',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2015-04-01',
      effective_at: '2015-04-01',
      status: 'effective',
      direction: 'clarify'
    },
    {
      title_ja: '総合規制改革会議「規制改革の推進に関する第３次答申」に関する在留資格認定',
      title_zh: '综合规制改革会议第三次答申中的经营管理资格认定（历史文件）',
      summary: '历史官方文件。明确经营管理在留资格的活动范围、实质参入要件，以及旧基准下事业规模基准（2 名常勤职员或资本金 500 万日元以上）。',
      url: 'https://www.moj.go.jp/isa/applications/resources/nyukan_nyukan20.html',
      category: 'business_manager',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2004-03-19',
      effective_at: '2004-03-19',
      status: 'effective',
      direction: 'clarify'
    },
    {
      title_ja: '外国人経営者の在留資格基準の明確化について',
      title_zh: '外国经营者留资格基准的明确化（历史文件）',
      summary: '官方文件。明确"事业所存在"基准的审查口径：事业所须实际存在并用于经营活动，虚拟事务所等不被认可。',
      url: 'https://www.moj.go.jp/isa/applications/resources/nyukan_nyukan43.html',
      category: 'business_manager',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2004-01-01',
      effective_at: '2004-01-01',
      status: 'effective',
      direction: 'clarify'
    },

    // ── 高度人才（3 条）──
    {
      title_ja: '在留資格「高度専門職」（高度人材ポイント制）',
      title_zh: '高度专门职（高度人才积分制）',
      summary: '官方权威页面。高度专门职 1 号要件：①活动符合 1 号イ/ロ/ハ之一；②基准省令全部适合；③积分合计 70 点以上。2 号：1 号或高度人才特定活动在留 3 年以上、积分 70 以上、素行善良。更新申请时积分须维持 70 点以上（在留期间内不要求始终维持）。',
      url: 'https://www.moj.go.jp/isa/applications/status/designatedactivities02_00004.html',
      category: 'hsp',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2012-05-07',
      effective_at: '2012-05-07',
      status: 'effective',
      direction: 'relax'
    },
    {
      title_ja: '高度人材ポイント制 Q&A',
      title_zh: '高度人才积分制 Q&A',
      summary: '官方 Q&A。70 分以上在留 3 年或 80 分以上在留 1 年可申请永住；积分计算以申请时点与申请日前 3 年（或 1 年）为基准双轨确认。',
      url: 'https://www.moj.go.jp/isa/applications/resources/newimmiact_3_qa.html',
      category: 'hsp',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2012-05-07',
      effective_at: '2012-05-07',
      status: 'effective',
      direction: 'relax'
    },
    {
      title_ja: '特別高度人材制度（J-Skip）',
      title_zh: '特别高度人才制度（J-Skip）',
      summary: '2023-04-21 导入。满足"硕士以上 + 年收 2000 万以上"或"实务经验 10 年以上 + 年收 2000 万以上"（研究/技术类），或"经营管理经验 5 年以上 + 年收 4000 万以上"（经营管理类），即可作为特别高度人才在留 1 年，几乎覆盖全部就劳资格活动，在留期间无期限（2 号），永住所需在留期间 1 年。',
      url: 'https://www.moj.go.jp/isa/applications/resources/nyuukokukanri01_00009.html',
      category: 'hsp',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2023-04-21',
      effective_at: '2023-04-21',
      status: 'effective',
      direction: 'relax'
    },

    // ── 永住（2 条）──
    {
      title_ja: '永住許可に関するガイドライン（令和8年2月24日改訂）',
      title_zh: '永住许可指南（2026年2月24日修订版）',
      summary: '官方最新永住指南。法律要件：①素行善良；②有独立生计资产或技能；③符合日本国家利益（原则 10 年以上在留，其中就劳/居住资格 5 年以上；无罚金刑；公的義務即纳税/年金/医保/届出义务妥善履行）。特例：配偶者 3 年婚姻+1 年在留；定住者 5 年；高度人才 70 分 3 年 / 80 分 1 年；特别高度人才 1 年。注：令和9年3月31日前在留期间 3 年亦视为"最长在留期间"。',
      url: 'https://www.moj.go.jp/isa/applications/resources/nyukan_nyukan50.html',
      category: 'permanent_residence',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2026-02-24',
      effective_at: '2026-02-24',
      status: 'effective',
      direction: 'clarify',
      // 结构化字段
      japanese_level: '无硬性日语要求（素行与纳税履行为重点）',
      employee_required: false,
      expert_review: false,
      transition_until: '2027-03-31',
      impact: '在留期间特例：令和9年3月31日前 3 年亦视为最长在留期间；就劳资格需连续 5 年。',
      keywords: ['永住', 'ガイドライン', '10年', '就劳5年', '纳税', '年金', '素行']
    },
    {
      title_ja: '永住許可申請（手続案内）',
      title_zh: '永住许可申请（手续指南）',
      summary: '永住申请提出资料：素行善良证明、独立生计证明、住民税/国税纳税证明（纳税证明书その3）、年金与医保缴纳证明、身元保证人等。',
      url: 'https://www.moj.go.jp/isa/applications/procedures/16-4.html',
      category: 'permanent_residence',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2026-02-24',
      effective_at: '2026-02-24',
      status: 'effective',
      direction: 'clarify'
    },

    // ── 工作签证（2 条）──
    {
      title_ja: '技術・人文知識・国際業務ビザ',
      title_zh: '技术·人文知识·国际业务签证',
      summary: '官方页面。适用于工程师、技术专家、翻译、国际业务等受雇劳动者。需大学学历或 10 年以上实务经验；在留期间最长 5 年。不适用于自营业主。',
      url: 'https://www.moj.go.jp/isa/applications/status/gijinkoku.html',
      category: 'work_visa',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2026-07-13',
      effective_at: '2026-07-13',
      status: 'effective',
      direction: 'clarify'
    },
    {
      title_ja: '在留資格の変更・在留期間の更新許可のガイドライン',
      title_zh: '在留资格变更·更新许可指南',
      summary: '官方指南。在留资格变更与更新审查要点：活动实态、在留状况（含届出义务履行）、素行、生计能力等。',
      url: 'https://www.moj.go.jp/isa/applications/resources/nyuukokukanri07_00058.html',
      category: 'work_visa',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2020-01-01',
      effective_at: '2020-01-01',
      status: 'effective',
      direction: 'clarify'
    },

    // ── 定住（1 条）──
    {
      title_ja: '定住ビザ（定住者）',
      title_zh: '定住签证（定住者）',
      summary: '定住者资格：因法务大臣特别理由允许定住者。与永住不同，无 10 年期间硬性要求，按个案审查。永住特例：定住者资格 5 年以上在留可申请永住。',
      url: 'https://www.moj.go.jp/isa/applications/status/teijyu.html',
      category: 'long_term_residence',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2020-01-01',
      effective_at: '2020-01-01',
      status: 'effective',
      direction: 'clarify'
    },

    // ── 不动产（3 条，含 2025-2026 新规）──
    {
      title_ja: '外国人による不動産取得（原則無制限）',
      title_zh: '外国人不动产取得（原则无限制）',
      summary: '日本法律原则上对外国人取得不动产无国籍、无在留资格限制（非居住者亦可全所有权购入）；与泰国/印尼/菲律宾等限制外国人土地所有不同，日本对外国买家开放度高。但需遵守与日本人相同的税制与登记程序；取得不动产本身不授予签证或永住（无"黄金签证"）。',
      url: 'https://www.mlit.go.jp/totikensangyo/totikensangyo_tk2_000008.html',
      category: 'realestate',
      source: 'mlit',
      source_name_zh: '国土交通省',
      published_at: '2025-07-01',
      effective_at: '2025-07-01',
      status: 'effective',
      direction: 'clarify'
    },
    {
      title_ja: '国土利用計画法施行規則の改正（2025年7月）国籍届出義務',
      title_zh: '国土利用计划法施行规则改正（2025年7月）国籍申报义务',
      summary: '2025-07-01 起，一定规模以上土地交易（市街化区域 2000㎡ 以上、市街化区域外 5000㎡ 以上、山林等 1 万㎡ 以上）申报时须申报取得者国籍；外国法人须申报代表者国籍。2026-10-05 起不动产登记强制申报国籍（日本人也不例外）。',
      url: 'https://www.mlit.go.jp/totikensangyo/totikensangyo_tk2_000008.html',
      category: 'realestate',
      source: 'mlit',
      source_name_zh: '国土交通省',
      published_at: '2025-07-01',
      effective_at: '2025-07-01',
      status: 'effective',
      direction: 'tighten'
    },
    {
      title_ja: '外国為替及び外国貿易法の改正（2026年4月）不動産報告義務',
      title_zh: '外汇及对外贸易法改正（2026年4月）不动产报告义务',
      summary: '2026-04 起《外汇及对外贸易法》修订落地：海外非居住者购买日本住宅类不动产（无论自住或投资）须在购入后 20 天内向财务省报告，违者最高罚款 100 万日元。以商业投资为目的的购房申报此前已存在。',
      url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm',
      category: 'realestate',
      source: 'moj',
      source_name_zh: '财务省（外汇法）',
      published_at: '2026-04-01',
      effective_at: '2026-04-01',
      status: 'effective',
      direction: 'tighten',
      // 结构化字段
      capital_min_jpy: null,
      japanese_level: null,
      employee_required: null,
      expert_review: null,
      transition_until: '',
      impact: '海外非居住者（含中国买家）购房后 20 天内须向财务省报告；与 2025-07 国籍申报、2026-10 登记国籍申报构成不动产三重合规。',
      keywords: ['外汇法', '不动产', '非居住者', '20日', '报告', '财务省', '购房']
    },

    // ── 税制（2 条）──
    {
      title_ja: '所得税の税率（No.2260）',
      title_zh: '所得税税率（国税厅 Tax Answer No.2260）',
      summary: '国税厅官方 Tax Answer（令和8年4月1日现行）。所得税 7 档累进：5%（~194.9万）/10%（195-329.9万）/20%（330-694.9万）/23%（695-899.9万）/33%（900-1799.9万）/40%（1800-3999.9万）/45%（4000万以上）。令和25年-令和19年加征复兴特别所得税（基准所得税额 2.1%）。',
      url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm',
      category: 'tax',
      source: 'nta',
      source_name_zh: '国税庁',
      published_at: '2026-04-01',
      effective_at: '2026-04-01',
      status: 'effective',
      direction: 'clarify'
    },
    {
      title_ja: '外国人居住者・非居住者の課税関係',
      title_zh: '外国人居住者·非居住者的课税关系',
      summary: '外国人按在留期间与居住形态分为居住者/非居住者：居住者（在日本有住所或居所连续 1 年以上）全球所得课税；非居住者仅日本国内来源所得课税。经营管理签持有人通常为居住者。',
      url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm',
      category: 'tax',
      source: 'nta',
      source_name_zh: '国税庁',
      published_at: '2026-04-01',
      effective_at: '2026-04-01',
      status: 'effective',
      direction: 'clarify'
    },

    // ── 在留制度总览（1 条）──
    {
      title_ja: '在留資格の一覧（出入国在留管理庁）',
      title_zh: '在留资格一览（出入国在留管理厅）',
      summary: '官方总览页。日本在留资格分为 29 种：活动资格（高度专门职/经营·管理/技术人文知识国际业务/技能/特定技能等 19 种）、居留资格（永住者/日本人配偶者等/永住者配偶者等/定住者 4 种）、特定活动等。申请与更新统一经出入国在留管理厅审查。',
      url: 'https://www.moj.go.jp/isa/applications/status/index.html',
      category: 'law_immigration',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2026-01-01',
      effective_at: '2026-01-01',
      status: 'effective',
      direction: 'clarify',
      keywords: ['在留资格', '一覧', '29種', '永住者', '定住者', '特定活动']
    },

    // ── 2026 新发现的关键政策（2026-09-27 补录）──
    {
      title_ja: '永住許可ガイドライン在留期間「3年」の取扱い見直し（令和9年4月1日施行）',
      title_zh: '永住许可指南在留期间"3年"待遇废止（2027-04-01 施行）',
      summary: '2027-04-01 起，现行永住指南中"3年在留期间视为最长在留期间"的过渡措施废止，回归各在留资格的法定最长期间。即：2027-04-01 后申请永住，需实际持有该在留资格的最长期限（而非 3 年即可）。2027-03-31 前申请仍可享受 3 年特例。顾问须提醒 2027 年前申请的客户把握窗口期。',
      url: 'https://www.moj.go.jp/isa/applications/procedures/eizyuu_00001.html',
      category: 'pr',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2026-01-23',
      effective_at: '2027-04-01',
      status: 'upcoming',
      direction: 'tighten',
      impact: '2027-04 后永住在留年限要求实质收紧，需提醒客户赶过渡期末班车。',
      keywords: ['永住', '3年', '最長在留期間', '令和9年', '过渡期', '2027']
    },
    {
      title_ja: '外国人の受入れ・共生総合対策（令和8年1月23日閣議決定）——永住国益要件への日本語能力追加',
      title_zh: '外国人受入共生综合对策（2026-01-23 阁议决定）——永住国益要件新增日语能力',
      summary: '2026-01-23 阁议决定。永住许可"国益要件"新增考虑要素：①日语能力 CEFR B1 相当（日常话题可自立应对水准）；②对日本制度的理解；③学龄子女就学状况。例外：高度人才及其家属、在日受教育 6 年以上者不要求日语。顾问须关注后续指南细则发布。',
      url: 'https://www.moj.go.jp/isa/11_00112.html',
      category: 'pr',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2026-01-23',
      effective_at: '',
      status: 'pending_review',
      direction: 'tighten',
      impact: '未来永住审查将实质考察日语能力；N3 以下客户需提前规划日语学习。',
      keywords: ['永住', '国益要件', '日本語B1', 'CEFR', '共生', '阁议决定']
    },
    {
      title_ja: '経営・管理ビザ カテゴリー3・4追加提出書類（令和8年4月15日施行）',
      title_zh: '经营管理签 类别3/4 追加提交文件（2026-04-15 施行）',
      summary: '2026-04-15 起申请，所属机关属カテゴリー3或4的，须追加提交：①所属机关代表者相关申告书（参考样式，从事事业管理者时附加）；②所属机关公租公课纳税履行状况资料。カテゴリー1/2（上市/规模法人）不要求。',
      url: 'https://www.moj.go.jp/isa/applications/status/businessmanager.html',
      category: 'business_manager',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2026-04-15',
      effective_at: '2026-04-15',
      status: 'effective',
      direction: 'tighten',
      impact: '中小企业新设立公司（カテゴリー4）须准备代表者申告书与纳税资料，材料周期增加 1-2 周。',
      keywords: ['经营管理', 'カテゴリー3', 'カテゴリー4', '代表者申告書', '公租公課', '2026-04']
    },
    {
      title_ja: 'J-Find（特定活動46号・47号）新制度概要',
      title_zh: 'J-Find 新制度（特定活动 46/47 号）',
      summary: '2025 年新设。面向外国大学等毕业生在日本求职/创业的特定活动签证：46号=求职活动（最长1年，活动资金+日语 N2 程度）；47号=创业准备活动（最长2年，事业计划+资金+日语 N2 程度）。与 J-Skip（特别高度人才）互补，覆盖年轻外国人才。',
      url: 'https://www.moj.go.jp/isa/applications/status/index.html',
      category: 'hsp',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2025-04-01',
      effective_at: '2025-04-01',
      status: 'effective',
      direction: 'relax',
      impact: '外国毕业生留日求职/创业路径拓宽，但与经营管理签的 3000 万资本金新规无直接关系。',
      keywords: ['J-Find', '特定活动', '46号', '47号', '求职', '创业准备']
    },
    {
      title_ja: '永住審査期間の実情（東京/大阪/地方別）',
      title_zh: '永住审查期间实务实情（按入管局区分）',
      summary: '官方标准处理期间约 4 个月，实务因入管局差异极大：东京入管约 18-24 个月（2026 年受理高峰）；大阪入管约 12 个月；其他地方入管约 6-8 个月。审查中常见追加资料：纳税证明、年金记录、健康保险、在职证明、出国履历、身元保证人。顾问须按客户申请地管理预期。',
      url: 'https://www.moj.go.jp/isa/applications/procedures/16-4.html',
      category: 'pr',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2026-06-01',
      effective_at: '2026-06-01',
      status: 'effective',
      direction: 'clarify',
      impact: '东京客户须按 18 个月排期；大阪/地方客户可按 6-12 个月承诺。',
      keywords: ['永住', '審査期間', '東京', '大阪', '地方', '追加資料']
    },
    {
      title_ja: '経営・管理ビザ 更新時のオンライン申請新様式（令和7年11月一部変更）',
      title_zh: '经营管理签更新在线申请新样式（2025-11 部分变更）',
      summary: '2025-10-16 新规后在线申请表新增项目：①"申请事业供用财产总额"记入项目（资本金/出资总额与申请人投资额作为内数记入新样式3(7)）；②"常勤职员数"仅申请人开始经营时记入。更新时同步要求提交所属机关纳税履行资料。',
      url: 'https://www.moj.go.jp/isa/11_00066.html',
      category: 'business_manager',
      source: 'isa',
      source_name_zh: '出入国在留管理庁',
      published_at: '2025-11-01',
      effective_at: '2025-11-01',
      status: 'effective',
      direction: 'clarify',
      impact: '在线申请须按新样式填写，财产总额与常勤职员数口径与新规一致。',
      keywords: ['经营管理', '在线申请', '新样式', '财产总额', '常勤职员数']
    }
  ]);

  // 2. 政策版本（历史溯源，经营管理 ×3 + 高度人才 ×2，2025 新规口径按官方修正）
  results.policy_versions = await seedCollection('policy_versions', [
    {
      policy_key: 'business_manager',
      version_label: '2006 创设',
      version: '2006-04-01',
      category: 'business_manager',
      capital_min_jpy: 5000000,
      fulltime_employee: false,
      japanese_level: null,
      expert_review: false,
      management_experience_years: null,
      home_office: true,
      note: '创设期：投资经营，资本金 500 万日元。'
    },
    {
      policy_key: 'business_manager',
      version_label: '2015 更名',
      version: '2015-04-01',
      category: 'business_manager',
      capital_min_jpy: 5000000,
      fulltime_employee: false,
      japanese_level: null,
      expert_review: false,
      management_experience_years: null,
      home_office: true,
      note: '更名「経営・管理」，标准未变。'
    },
    {
      policy_key: 'business_manager',
      version_label: '2025 新规',
      version: '2025-10-16',
      category: 'business_manager',
      capital_min_jpy: 30000000,
      fulltime_employee: true,
      japanese_level: 'B2相当（申请人或常勤职员任一方：N2/BJT400/在日20年/日本高教毕业）',
      expert_review: true,
      management_experience_years: 3,
      home_office: false,
      note: '史上最严改革：资本金 6 倍（法人=资本金，个人=投下资金总额）、常勤职员 1 名、日语 B2 相当（申请人或员工任一方）、专家背书、学历或 3 年管理经验、自宅兼用原则上不认可。施行日 3 年内（至 2028-10-16）旧在留者更新不因新基准不满足而被拒。'
    },
    {
      policy_key: 'hsp',
      version_label: '2012 创设',
      version: '2012-05-07',
      category: 'hsp',
      capital_min_jpy: null,
      fulltime_employee: null,
      japanese_level: null,
      expert_review: null,
      management_experience_years: null,
      home_office: null,
      note: '高度人才积分制创设：70 分可申请高度专门职 1 号。'
    },
    {
      policy_key: 'hsp',
      version_label: '2023 改正（J-Skip 导入）',
      version: '2023-04-21',
      category: 'hsp',
      capital_min_jpy: null,
      fulltime_employee: null,
      japanese_level: null,
      expert_review: null,
      management_experience_years: null,
      home_office: null,
      note: '积分制扩大 + 特别高度人才制度（J-Skip）导入：硕士+年收2000万或实务10年+年收2000万，在留 1 年可申请永住。'
    }
  ]);

  // 3. 时间线节点（13 个，含 2025-2026 不动产新规与永住指南修订）
  results.timeline_nodes = await seedCollection('timeline_nodes', [
    { category: 'business_manager', event_date: '2025-10-16', title: '经营管理签新规正式施行', summary: '资本金提至3000万日元（法人=资本金/个人=投下资金总额），史上最严。', direction: 'tighten', severity: 5, is_current: true },
    { category: 'business_manager', event_date: '2025-08-22', title: '入管厅公布新规预告', summary: '公布施行规则修正案并征求意见。', direction: 'tighten', severity: 4, is_current: false },
    { category: 'business_manager', event_date: '2015-04-01', title: '更名「経営・管理」', summary: '投资经营资格更名，资本金标准 500 万日元。', direction: 'clarify', severity: 2, is_current: false },
    { category: 'business_manager', event_date: '2006-04-01', title: '经营管理在留资格创设', summary: '「投資・経営」创设，资本金 500 万日元标准。', direction: 'create', severity: 3, is_current: false },
    { category: 'hsp', event_date: '2023-04-21', title: 'J-Skip 特别高度人才导入', summary: '硕士+年收2000万或实务10年+年收2000万，1 年可申请永住。', direction: 'relax', severity: 4, is_current: true },
    { category: 'hsp', event_date: '2012-05-07', title: '高度人才积分制创设', summary: '70 分可申请高度专门职 1 号，80 分 1 年永住。', direction: 'create', severity: 4, is_current: false },
    { category: 'permanent_residence', event_date: '2026-02-24', title: '永住指南修订（令和8年改订）', summary: '明确就劳/居住资格连续 5 年以上；令和9年3月31日前 3 年亦视为最长在留期间。', direction: 'clarify', severity: 3, is_current: true },
    { category: 'realestate', event_date: '2026-10-05', title: '不动产登记强制申报国籍', summary: '登记时申报国籍义务化（日本人也不例外），口子彻底堵上。', direction: 'tighten', severity: 3, is_current: false },
    { category: 'realestate', event_date: '2026-04-01', title: '外汇法修订：非居住者买房须报告', summary: '海外非居住者购房（含自住）20 天内向财务省报告，违者罚最高 100 万日元。', direction: 'tighten', severity: 4, is_current: true },
    { category: 'realestate', event_date: '2025-07-01', title: '国土利用计划法国籍申报', summary: '大规模土地交易（市街化区域2000㎡+）申报须含国籍。', direction: 'tighten', severity: 3, is_current: true },
    { category: 'realestate', event_date: '2020-01-01', title: '外国人不动产取得原则确认', summary: '无国籍限制，资金来源与签证合规为审查重点。', direction: 'clarify', severity: 2, is_current: true }
  ]);

  // 4. 客户（8 个，覆盖各阶段与画像）
  results.clients = await seedCollection('clients', [
    { name: '陈先生', stage: 'executing', occupation: '科技公司创始人', annual_income_jpy: 20000000, tags: ['高净值', '跨境电商', '子女教育'], created_at: new Date('2026-08-10'), updated_at: new Date('2026-09-25') },
    { name: '林女士', stage: 'evaluating', occupation: 'IT 工程师', annual_income_jpy: 18000000, tags: ['高度人才', 'N1', '东京'], created_at: new Date('2026-09-20'), updated_at: new Date('2026-09-24') },
    { name: '王先生', stage: 'confirmed', occupation: '贸易公司经营者', annual_income_jpy: 12000000, tags: ['经营管理', '大阪'], created_at: new Date('2026-09-15'), updated_at: new Date('2026-09-22') },
    { name: '张女士', stage: 'landed', occupation: '民宿经营者', annual_income_jpy: 9000000, tags: ['房产投资', '民宿', '大阪'], created_at: new Date('2025-11-02'), updated_at: new Date('2026-08-15') },
    { name: '李总', stage: 'closed', occupation: '餐饮连锁创始人', annual_income_jpy: 35000000, tags: ['经营管理', '餐饮', '东京'], created_at: new Date('2025-06-20'), updated_at: new Date('2026-01-10') },
    { name: '赵女士', stage: 'evaluating', occupation: '跨境电商运营', annual_income_jpy: 8000000, tags: ['经营管理', '跨境电商', '福冈'], created_at: new Date('2026-09-18'), updated_at: new Date('2026-09-23') },
    { name: '周医生', stage: 'confirmed', occupation: '牙科医生', annual_income_jpy: 25000000, tags: ['高度人才', '医疗', '横滨'], created_at: new Date('2026-08-28'), updated_at: new Date('2026-09-20') },
    { name: '吴先生', stage: 'executing', occupation: '物流公司董事', annual_income_jpy: 15000000, tags: ['经营管理', '物流', '名古屋'], created_at: new Date('2026-07-15'), updated_at: new Date('2026-09-19') }
  ]);

  // 5. 案件（6 个）
  results.cases = await seedCollection('cases', [
    { case_id: 'seed_bm_1', client_name: '陈先生', path: 'business_manager', stage: 'executing',
      started_at: '2026-08-10', expected_result_at: '2026-12-15',
      package_price_jpy: 1800000, deposit_jpy: 500000, score_estimate: null,
      created_at: new Date('2026-08-10'), updated_at: new Date('2026-09-25') },
    { case_id: 'seed_hsp_1', client_name: '林女士', path: 'hsp', stage: 'evaluating',
      started_at: '2026-09-20', expected_result_at: '2026-12-20',
      package_price_jpy: 800000, deposit_jpy: 0, score_estimate: 78,
      created_at: new Date('2026-09-20'), updated_at: new Date('2026-09-24') },
    { case_id: 'seed_pr_1', client_name: '王先生', path: 'pr', stage: 'confirmed',
      started_at: '2026-09-15', expected_result_at: '2027-03-15',
      package_price_jpy: 1500000, deposit_jpy: 500000, score_estimate: null,
      created_at: new Date('2026-09-15'), updated_at: new Date('2026-09-22') },
    { case_id: 'seed_bm_2', client_name: '赵女士', path: 'business_manager', stage: 'evaluating',
      started_at: '2026-09-18', expected_result_at: '2027-01-30',
      package_price_jpy: 1600000, deposit_jpy: 0, score_estimate: null,
      created_at: new Date('2026-09-18'), updated_at: new Date('2026-09-23') },
    { case_id: 'seed_hsp_2', client_name: '周医生', path: 'hsp', stage: 'confirmed',
      started_at: '2026-08-28', expected_result_at: '2026-12-28',
      package_price_jpy: 900000, deposit_jpy: 300000, score_estimate: 85,
      created_at: new Date('2026-08-28'), updated_at: new Date('2026-09-20') },
    { case_id: 'seed_bm_3', client_name: '吴先生', path: 'business_manager', stage: 'executing',
      started_at: '2026-07-15', expected_result_at: '2026-11-20',
      package_price_jpy: 1700000, deposit_jpy: 800000, score_estimate: null,
      created_at: new Date('2026-07-15'), updated_at: new Date('2026-09-19') }
  ]);

  // 6. 案件任务（12 个）
  results.case_tasks = await seedCollection('case_tasks', [
    { case_id: 'seed_bm_1', title: '事业计划书专家确认（中小企业诊断士）', due_date: '2026-10-20', urgent: true, done: false, sort: 1 },
    { case_id: 'seed_bm_1', title: '资本金 3000 万日元入金证明', due_date: '2026-10-10', urgent: true, done: false, sort: 2 },
    { case_id: 'seed_bm_1', title: '事务所租赁合同', due_date: '2026-10-15', urgent: false, done: false, sort: 3 },
    { case_id: 'seed_bm_1', title: '1 名全职员工雇佣合同', due_date: '2026-10-25', urgent: false, done: false, sort: 4 },
    { case_id: 'seed_bm_1', title: '日语能力确认（申请人或常勤职员任一方）', due_date: '2026-11-01', urgent: false, done: false, sort: 5 },
    { case_id: 'seed_bm_1', title: '入管厅递交（预计）', due_date: '2026-11-15', urgent: false, done: false, sort: 6 },
    { case_id: 'seed_hsp_1', title: '积分表自算确认（78 分）', due_date: '2026-10-05', urgent: true, done: false, sort: 1 },
    { case_id: 'seed_hsp_1', title: '年收证明（源泉徴収票）', due_date: '2026-10-15', urgent: false, done: false, sort: 2 },
    { case_id: 'seed_pr_1', title: '纳税证明 5 年分', due_date: '2026-10-30', urgent: false, done: false, sort: 1 },
    { case_id: 'seed_bm_2', title: '事业形态与资本金方案设计', due_date: '2026-10-08', urgent: true, done: false, sort: 1 },
    { case_id: 'seed_bm_2', title: '跨境电商经营实绩材料整理', due_date: '2026-10-22', urgent: false, done: false, sort: 2 },
    { case_id: 'seed_bm_3', title: '物流公司账目与税务材料', due_date: '2026-10-12', urgent: true, done: false, sort: 1 }
  ]);

  // 7. 案件材料（12 个）
  results.case_documents = await seedCollection('case_documents', [
    { case_id: 'seed_bm_1', name: '护照复印件', status: 'ready' },
    { case_id: 'seed_bm_1', name: '在留资格认定申请书', status: 'pending' },
    { case_id: 'seed_bm_1', name: '事业计划书（专家确认版）', status: 'pending' },
    { case_id: 'seed_bm_1', name: '资本金入金证明', status: 'pending' },
    { case_id: 'seed_bm_1', name: '事务所租赁合同', status: 'pending' },
    { case_id: 'seed_bm_1', name: '雇佣合同（全职员工）', status: 'pending' },
    { case_id: 'seed_hsp_1', name: '学历证明', status: 'ready' },
    { case_id: 'seed_hsp_1', name: '职历证明', status: 'ready' },
    { case_id: 'seed_pr_1', name: '纳税证明', status: 'pending' },
    { case_id: 'seed_bm_2', name: '经营实绩流水', status: 'pending' },
    { case_id: 'seed_bm_2', name: '公司注册计划书', status: 'pending' },
    { case_id: 'seed_bm_3', name: '决算书（2年分）', status: 'ready' }
  ]);

  // 8. 案例库（14 个：内部案例 8 + 公开报道案例 6，均脱敏；公开案例标注来源 URL）
  results.cases_library = await seedCollection('cases_library', [
    {
      title: '科技创始人，3000 万资本金路径获批',
      path: 'business_manager',
      profile_tags: ['38岁', '硕士', '科技创业', '东京'],
      key_challenge: '2025 新规后资本金 6 倍至 3000 万，需专家事业计划书 + 全职员工。',
      solution: ['资本金调整与资金来源说明', '专家事业计划书提前确认', '全职员工雇佣先行'],
      result: 'approved',
      duration_months: 5,
      approved_for_publish: true
    },
    {
      title: 'IT 工程师 82 分，1 年永驻',
      path: 'hsp',
      profile_tags: ['35岁', 'IT', '年收1800万', 'N1'],
      key_challenge: '积分计算与证明材料完整性。',
      solution: ['积分表逐项核对', '年收与学历证明齐备'],
      result: 'approved',
      duration_months: 12,
      approved_for_publish: true
    },
    {
      title: '主妇带子女，家族经营管理签',
      path: 'business_manager',
      profile_tags: ['家庭移民', '子女教育', '大阪'],
      key_challenge: '主申请人事业形态设计与家属在留资格。',
      solution: ['配偶事业参与设计', '子女教育资料准备'],
      result: 'approved',
      duration_months: 6,
      approved_for_publish: true
    },
    {
      title: '高龄申请者资本金来源审查驳回（补正后撤回）',
      path: 'business_manager',
      profile_tags: ['52岁', '餐饮', '地方城市'],
      key_challenge: '资本金 3000 万来源无法完整说明，新规后专家审查提出质疑。',
      solution: ['资金来源逐笔梳理', '建议改期再申并补充完税证明'],
      result: 'withdrawn',
      duration_months: 3,
      approved_for_publish: false,
      review_notes: [
        { stage: '初审', note: '专家审查质疑资本金来源完整性，要求补交完税证明与转账流水。', response: '资金来源逐笔梳理仍无法覆盖全额，建议撤回改期再申' }
      ]
    },
    {
      title: '日语未达标（仅 N3），改走高度人才经营管理类',
      path: 'hsp',
      profile_tags: ['41岁', 'IT 管理', '年收2200万'],
      key_challenge: '经营管理签新规要求 B2 相当（N2），客户仅 JLPT N3。',
      solution: ['转高度人才经营管理类积分路径', '利用年收与职历补齐 70 分'],
      result: 'approved',
      duration_months: 4,
      approved_for_publish: true
    },
    {
      title: '自宅兼事务所申请，新规后补正为租赁事务所',
      path: 'business_manager',
      profile_tags: ['33岁', '咨询', '福冈'],
      key_challenge: '2025 新规原则上不认可自宅兼事务所，初审补正。',
      solution: ['补租正式事务所', '提交新址租赁合同与办公室照片'],
      result: 'approved',
      duration_months: 6,
      approved_for_publish: true,
      review_notes: [
        { stage: '初审', note: '入管局指出自宅兼事务所不符合新规原则，要求补正事务所实态证明。', response: '补租正式事务所，提交租赁合同+办公室照片+使用说明' }
      ]
    },
    {
      title: '民宿投资客，先置业后经营管理签',
      path: 'realestate',
      profile_tags: ['45岁', '房产投资', '大阪'],
      key_challenge: '客户误以为买房即可获签，实为房产投资 + 经营管理签双线。',
      solution: ['澄清置业与签证关系', '民宿经营为事业内容申请经营管理签'],
      result: 'approved',
      duration_months: 8,
      approved_for_publish: true
    },
    {
      title: '永住申请 10 年要件审查（纳税瑕疵补正）',
      path: 'pr',
      profile_tags: ['48岁', '贸易', '东京', '在日9年'],
      key_challenge: '在日 9 年未满 10 年且早期有税务滞纳记录。',
      solution: ['延后 1 年申请', '补缴并取得完税证明', '由律师出具意见书'],
      result: 'pending',
      duration_months: null,
      approved_for_publish: false
    },
    // ── 以下为公开报道案例（已脱敏，来源见 source_url）──
    {
      title: '民宿牌照房产 + 500 万公司获批（旧规路径）',
      path: 'business_manager',
      profile_tags: ['1988年生', '民宿投资', '全家移民'],
      key_challenge: '旧规时代（500 万资本金）获批，约 9 个月，全家移民。',
      solution: ['购买带民宿牌照房产', '注册 500 万日元公司', '以民宿经营为事业内容'],
      result: 'approved',
      duration_months: 9,
      approved_for_publish: true,
      source_url: 'https://www.jinyueyimin.com/case/details.html?id=812',
      source_note: '公开报道案例（金乐移民官网），已脱敏'
    },
    {
      title: '民宿公寓 + 500 万公司获批（旧规路径）',
      path: 'business_manager',
      profile_tags: ['1988年生', '民宿公寓', '长期扎根'],
      key_challenge: '旧规时代获批，约 9 个月，公司稳步运营。',
      solution: ['购买带民宿牌照公寓', '注册 500 万日元公司', '稳定经营记录'],
      result: 'approved',
      duration_months: 9,
      approved_for_publish: true,
      source_url: 'https://www.jinyueyimin.com/case/details.html?id=856',
      source_note: '公开报道案例（金乐移民官网），已脱敏'
    },
    {
      title: '房地产模式：大阪 4 套民宿 2.5 亿日元，6 个月获批',
      path: 'realestate',
      profile_tags: ['二线城市开发商', '大阪', '民宿4套', '代表取缔役'],
      key_challenge: '高额房产投资 + 经营管理双线，需证明经营实态。',
      solution: ['投资约 2.5 亿日元大阪民宿 4 套', '委托专业运营公司管理', '本人任代表取缔役体现经营参与'],
      result: 'approved',
      duration_months: 6,
      approved_for_publish: true,
      source_url: 'https://m.sohu.com/a/1010317260_120288712/',
      source_note: '公开报道案例（搜狐·移民港），已脱敏'
    },
    {
      title: '海外公司嫁接模式：香港跨境电商设日本子公司',
      path: 'business_manager',
      profile_tags: ['香港跨境电商', '年利润3000万港币', '子公司模式'],
      key_challenge: '以海外母公司为基础在日本设子公司，转移部分采购业务。',
      solution: ['日本设立子公司', '转移部分采购业务', '以实际经营证明申请'],
      result: 'approved',
      duration_months: null,
      approved_for_publish: true,
      source_url: 'https://m.sohu.com/a/1010317260_120288712/',
      source_note: '公开报道案例（搜狐·移民港），已脱敏'
    },
    {
      title: '技术·人文签变更经营管理签（光伏行业创业）',
      path: 'business_manager',
      profile_tags: ['中国大学毕业', '光伏行业', '合同会社', '3年事业计划'],
      key_challenge: '从受雇（技术·人文知识·国际业务）变更为经营管理，需证明事业具体性与可持续性。',
      solution: ['设立合同会社', '制定具体 3 年事业计划', '准备交易确约书类'],
      result: 'approved',
      duration_months: null,
      approved_for_publish: true,
      source_url: 'https://www.visa-yamanishi.com/',
      source_note: '公开报道案例（山西行政书士事务所官网），已脱敏'
    },
    {
      title: '80 分高度人才 1 年永住获批（东京局，追加纳税证明）',
      path: 'pr',
      profile_tags: ['高度人才80分', '在留1年', '东京'],
      key_challenge: '80 分 + 在留 1 年申请永住；审查期间最新年度课税·纳税证明发行，被要求追加提交。',
      solution: ['住民税课税·纳税证明书（直近年度）', '审查期间配合追加资料'],
      result: 'approved',
      duration_months: 12,
      approved_for_publish: true,
      source_url: 'https://calico-legal.com/casestudy_pr_03-2/',
      source_note: '公开报道案例（CALICO LEGAL 行政书士事务所），已脱敏'
    },
    // ── 第三批公开报道案例（2026 搜索核验，均脱敏）──
    {
      title: '经营管理签续签（新规后补正纳税与社保证明）',
      path: 'business_manager',
      profile_tags: ['续签', '2025新规后', '纳税证明', '社会保险'],
      key_challenge: '2025-12 提交续签，审查中按新规要求补正纳税证明书与社会保险料纳付证明书。',
      solution: ['按新规要求补正课税·纳税证明', '补正社会保险料纳付证明', '约 1.5 个月获批'],
      result: 'approved',
      duration_months: 2,
      approved_for_publish: true,
      source_url: 'https://www.iesdouyin.com/share/video/7623279485517403249',
      source_note: '公开报道案例（抖音·移民从业者分享），已脱敏'
    },
    {
      title: '经营管理签持有人第三次申请永住获批',
      path: 'pr',
      profile_tags: ['经营管理', '第三次申请', '在日10年以上'],
      key_challenge: '前两次永住申请未获批，需梳理不许可原因并针对性补强素行与纳税记录。',
      solution: ['复盘前两次不许可理由', '补强纳税·年金持续缴纳记录', '第三次申请获批'],
      result: 'approved',
      duration_months: 36,
      approved_for_publish: true,
      source_url: 'https://china.visajapan.jp/qa/qa_eiju12.html',
      source_note: '公开报道案例（ACROSEED 行政书士法人 VOL.135），已脱敏'
    },
    {
      title: '80 分高才 1 年转永住（名古屋/横滨 9 例 8 过）',
      path: 'pr',
      profile_tags: ['高度人才80分', '1年转永住', '名古屋', '横滨'],
      key_challenge: '2026 年以来名古屋/横滨两局 80 分一年转永住 9 例中 8 例获批；不许可 1 例原因未公开（个人隐私）。',
      solution: ['积分双时点核验（申请时+1年前）', '纳税·课税证明齐备', '个别案件结果因审查官裁量而异'],
      result: 'approved',
      duration_months: 12,
      approved_for_publish: true,
      source_url: 'https://www.iesdouyin.com/share/video/7664487613444771099',
      source_note: '公开报道案例（抖音·移民从业者分享），已脱敏'
    },
    {
      title: '85 后高管 100 分高才，1 年获批永住',
      path: 'pr',
      profile_tags: ['85后', '综合评分100', '高管', '1年永住'],
      key_challenge: '长期留学背景语言达标、年龄优势；综合评分超 80 分（达 100 分）。',
      solution: ['高级人才签证获批', '在日工作满 1 年提交永住申请', '2023 提交、2024-04 获批'],
      result: 'approved',
      duration_months: 12,
      approved_for_publish: true,
      source_url: 'http://m.leadvisa.com/index.php/mapp/index/news_detail/id/3767',
      source_note: '公开报道案例（领航海外），已脱敏'
    },
    {
      title: '拉面店留学签转经营管理签（东京·吴先生）',
      path: 'business_manager',
      profile_tags: ['拉面店', '留学转签', '东京千代田'],
      key_challenge: '原持留学签证经营饮食店，需转经营管理签；需证明事业实态与独立事务所。',
      solution: ['饮食店经营实态确认', '事务所与店面分离确认', '资本金与事业计划书齐备'],
      result: 'approved',
      duration_months: 3,
      approved_for_publish: true,
      source_url: 'https://samurai-law.com/cn/voice02.html',
      source_note: 'SAMURAI 行政书士法人公开客户反馈，已脱敏'
    },
    {
      title: '技能实习转经营管理签（建设会社设立）',
      path: 'business_manager',
      profile_tags: ['技能实习转签', '建设业', '独立事务所'],
      key_challenge: '元技能实习生设立建设会社；需证明资本金出所、独立事务所、现业与经营分离。',
      solution: ['自己资金资本金通帳立证', '独立事务所契约+平面图+照片', '业务委托契約分离现业与经营', '技能实习人脉经验写入事业计划'],
      result: 'approved',
      duration_months: 4,
      approved_for_publish: true,
      source_url: 'https://tlg-visa.law/topics/8013/',
      source_note: '谷島行政書士法人公开事例，已脱敏'
    },
    {
      title: '中国在住贸易业者在东京涩谷设立株式会社',
      path: 'business_manager',
      profile_tags: ['中国在住', '贸易业', '东京涩谷'],
      key_challenge: '中国在住经营者拟在日本设立公司开展贸易，需从海外申请 COE。',
      solution: ['株式会社设立', '贸易事业计划书', '取引先确认资料'],
      result: 'approved',
      duration_months: 5,
      approved_for_publish: true,
      source_url: 'https://visa.go-al.co.jp/case/case_post-1807/',
      source_note: '行政書士法人GOAL 公开事例，已脱敏'
    },
    {
      title: '技术·人文签转みなし高度人材80点，5个月许可',
      path: 'hsp',
      profile_tags: ['技术人文', '80点', 'みなし高度人材', '5个月'],
      key_challenge: '技术·人文知识·国际业务转みなし高度人材 80 点；职历疎明资料收集耗时。',
      solution: ['职历证明资料齐备', 'みなし高度人材 80 点在留期間 1 年特例申请', '约 5 个月许可'],
      result: 'approved',
      duration_months: 5,
      approved_for_publish: true,
      source_url: 'https://office-forest.jp/visa-case-all/',
      source_note: '行政書士事務所フォレスト 公开事例，已脱敏'
    },
    {
      title: '高度专门职 70 点中国实务经验立证永住',
      path: 'pr',
      profile_tags: ['70点', '中国实务经验', '职历证明独自作成'],
      key_challenge: '实务经验几乎全部在中国，需独立作成在职期间证明立证积分。',
      solution: ['中国职历证明独自作成', '70 点积分表提出', '2025-01 开始对应，永住许可'],
      result: 'approved',
      duration_months: 6,
      approved_for_publish: true,
      source_url: 'https://eijyu.kika.kanamori-japan-visa.com/kodo-point-70-chugoku-jitumu-shoumei/',
      source_note: '金榮国際行政書士事務所 成功事例，已脱敏'
    },
    // ── 第四批：不许可/驳回/虚假陈述典型案例（2026-10 补录，正反对比）──
    {
      title: '【不许可】虚假经营实绩：伪造电商流水被识破',
      path: 'business_manager',
      profile_tags: ['39岁', '跨境电商', '伪造流水', '东京'],
      key_challenge: '客户试图用伪造的Amazon销售流水证明经营实绩，入管通过与平台数据交叉比对发现不一致。',
      solution: ['入管要求补充平台后台截图与第三方支付流水', '客户无法提供', '认定虚假陈述，不予许可'],
      result: 'rejected',
      duration_months: 4,
      approved_for_publish: false,
      review_notes: [
        { stage: '审查中', note: '入管指出电商流水金额与平台公开数据不一致，要求说明', response: '客户无法合理解释，最终不予许可' },
        { stage: '教训', note: '经营实绩必须真实可核验，伪造流水 = 虚假陈述 = 5年黑名单', response: '顾问须提前警示客户：任何材料造假都可能导致在留资格取消' }
      ]
    },
    {
      title: '【不许可】自宅兼事务所 + 无实雇员工',
      path: 'business_manager',
      profile_tags: ['32岁', '咨询业', '自宅兼用', '名古屋'],
      key_challenge: '2025新规后仍按旧规思路申请：自宅兼事务所、不雇全职员工、仅靠申请人自己。',
      solution: ['入管初审即指出：新规原则不认可自宅兼事务所', '全职员工未雇佣，常勤职员要件不满足', '不予许可'],
      result: 'rejected',
      duration_months: 3,
      approved_for_publish: false,
      review_notes: [
        { stage: '初审', note: '指出两个硬伤：自宅兼事务所、无常勤职员', response: '客户拒绝补正，直接不许可' }
      ]
    },
    {
      title: '【不许可】资本金抽回：入金后立即转出被发现',
      path: 'business_manager',
      profile_tags: ['45岁', '餐饮', '资本金抽回', '福冈'],
      key_challenge: '3000万资本金入金后2周内即转出至客户个人账户，入管通过银行流水追踪发现。',
      solution: ['入管要求说明资金去向', '客户解释不清', '认定"事业不具有实体性"，不予许可'],
      result: 'rejected',
      duration_months: 5,
      approved_for_publish: false,
      review_notes: [
        { stage: '审查中', note: '银行流水显示资本金入金后立即转出', response: '客户无法说明合理商业用途，不予许可' },
        { stage: '教训', note: '资本金入金后必须留在公司账户用于实际经营', response: '顾问须在签约时明确告知：抽回资本金=自动不许可' }
      ]
    },
    {
      title: '【不许可】永住申请：税务滞纳未补正',
      path: 'pr',
      profile_tags: ['46岁', '贸易', '税务滞纳', '大阪'],
      key_challenge: '在日8年，持有经营管理签3年，但住民税有2年滞纳记录且未补缴。',
      solution: ['入管要求补正纳税证明', '客户拒绝补缴', '以"素行不良"为由不予永住许可'],
      result: 'rejected',
      duration_months: 6,
      approved_for_publish: false,
      review_notes: [
        { stage: '审查中', note: '发现住民税滞纳2年，要求补缴', response: '客户拒绝，以素行不良不许可' }
      ]
    },
    {
      title: '【撤回】高度人才积分虚报：职历证明造假',
      path: 'hsp',
      profile_tags: ['38岁', 'IT', '职历造假', '横滨'],
      key_challenge: '客户为凑70分，虚报3年管理职经验，原公司出具证明时入管电话核实发现矛盾。',
      solution: ['入管联系原公司核实', '原公司表示客户为普通职员非管理职', '客户主动撤回申请'],
      result: 'withdrawn',
      duration_months: 2,
      approved_for_publish: false,
      review_notes: [
        { stage: '审查中', note: '入管电话核实职历，发现虚报', response: '客户主动撤回，避免留下不许可记录' },
        { stage: '教训', note: '积分材料必须真实，入管有权电话核实', response: '顾问须严格审核积分表每一项，不帮客户凑分' }
      ]
    }
  ]);

  // 9. 线索（6 个）
  results.leads = await seedCollection('leads', [
    { name: '刘先生', phone: '138****5678', source: '微信公众号', initial_intent: '经营管理签', budget_jpy: 30000000, timeline: '半年内', note: '深圳跨境电商，想带家人赴日。', status: 'new', created_at: new Date('2026-09-25') },
    { name: '赵女士', phone: '186****1234', source: '转介绍', initial_intent: '房产投资', budget_jpy: 50000000, timeline: '1 年内', note: '关注大阪民宿投资。', status: 'new', created_at: new Date('2026-09-24') },
    { name: '孙先生', phone: '139****9012', source: '小红书', initial_intent: '高度人才', budget_jpy: 10000000, timeline: '3 个月内', note: 'N1 已过，IT 十年经验，问积分是否够 80。', status: 'contacted', created_at: new Date('2026-09-22') },
    { name: '钱女士', phone: '137****3456', source: '老客户推荐', initial_intent: '永住', budget_jpy: 800000, timeline: '1 年内', note: '在日 11 年，经营管理签，问永住材料。', status: 'contacted', created_at: new Date('2026-09-21') },
    { name: '何先生', phone: '135****7890', source: '线下展会', initial_intent: '经营管理签+置业', budget_jpy: 60000000, timeline: '半年内', note: '餐饮 + 大阪一户建，双线需求。', status: 'qualified', created_at: new Date('2026-09-19') },
    { name: '高女士', phone: '158****2345', source: '官网咨询', initial_intent: '子女留学+陪读', budget_jpy: 20000000, timeline: '明年', note: '孩子初中，问经营管理签陪读可行性。', status: 'new', created_at: new Date('2026-09-18') }
  ]);

  // 10. 客户跟进记录（时间线，覆盖多阶段客户）
  results.client_notes = await seedCollection('client_notes', [
    { client_id: '', client_name: '陈先生', content: '首轮面谈：确认跨境电商赴日计划，主申人本人赴日经营，家属随行。', kind: 'contact', created_at: new Date('2026-08-12') },
    { client_id: '', client_name: '陈先生', content: '资本金方案确定：3000 万日元由境内公司利润汇出，需提供完税证明。', kind: 'decision', created_at: new Date('2026-08-25') },
    { client_id: '', client_name: '陈先生', content: '已预约中小企业诊断士出具事业计划书确认意见。', kind: 'material', created_at: new Date('2026-09-10') },
    { client_id: '', client_name: '林女士', content: '积分初算 78 分：学历 30 + 职历 15 + 年收 20 + N1 15，需补年龄加分复核。', kind: 'contact', created_at: new Date('2026-09-21') },
    { client_id: '', client_name: '林女士', content: '客户确认走高度专门职 1 号，意向签约。', kind: 'decision', created_at: new Date('2026-09-23') },
    { client_id: '', client_name: '王先生', content: '永住材料清单已发出，重点提醒纳税证明 5 年分与年金记录。', kind: 'material', created_at: new Date('2026-09-16') },
    { client_id: '', client_name: '赵女士', content: '线上沟通：福冈跨境电商，考虑经营管理签 + 一户建投资双线。', kind: 'contact', created_at: new Date('2026-09-19') }
  ]);

  // 11. 资源协作层（6 条示例）
  results.partners = await seedCollection('partners', [
    { name: '藤井行政書士事務所', type: 'gyosei', city: '東京', specialty: '経営管理簽・高度人材', note: '長期合作，回復快', status: 'active', created_at: new Date('2026-09-01'), updated_at: new Date('2026-09-01') },
    { name: '中村税理士事務所', type: 'tax', city: '大阪', specialty: '法人設立・決算・申告', note: '対応日本語/中文', status: 'active', created_at: new Date('2026-09-01'), updated_at: new Date('2026-09-01') },
    { name: '三井司法書士事務所', type: 'judicial', city: '東京', specialty: '不動産登記・会社設立登記', note: '', status: 'active', created_at: new Date('2026-09-01'), updated_at: new Date('2026-09-01') },
    { name: 'みずほ銀行（法人窓口）', type: 'bank', city: '東京', specialty: '法人口座・融資相談', note: '需要董事在日面谈', status: 'active', created_at: new Date('2026-09-01'), updated_at: new Date('2026-09-01') },
    { name: '桜不動産仲介', type: 'agency', city: '大阪', specialty: '民宿・一户建投資物件', note: '可带看，提供收益测算', status: 'active', created_at: new Date('2026-09-01'), updated_at: new Date('2026-09-01') },
    { name: '高橋弁護士', type: 'lawyer', city: '東京', specialty: '在留審查対応・訴訟', note: '疑难案件咨询', status: 'active', created_at: new Date('2026-09-01'), updated_at: new Date('2026-09-01') }
  ]);

  return { ok: true, results };
};
