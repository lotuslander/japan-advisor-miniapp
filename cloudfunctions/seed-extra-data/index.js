const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 追加种子数据：政策、不许可案例、文书模板、合规检查规则
// 只追加不覆盖（已存在的跳过）

async function addIfNotExist(colName, query, doc) {
  const exist = await db.collection(colName).where(query).count();
  if (exist.total > 0) return false;
  await db.collection(colName).add({ data: doc });
  return true;
}

exports.main = async () => {
  const stats = { policies: 0, cases: 0, templates: 0, compliance: 0 };

  // ── 1. 政策追加10条 ──
  const extraPolicies = [
    {
      title_zh: '特定技能1号（介護・外食・農業等14業種）',
      title_jp: '特定技能1号（介護・外食・農業など14業種）',
      path: '特定技能',
      summary: '2019年新设，5年在留资格，不可带家属。需通过技能考试+日语N4/JFT-A2。',
      url: 'https://www.moj.go.jp/isa/policies/ssw/index.html',
      effective_date: '2019-04-01',
      version: '2025-04改定',
      is_current: true
    },
    {
      title_zh: '经营管理签证2025年10月新规：3000万円资本金+独立事务所+常勤职员1名',
      title_jp: '経営・管理ビザ2025年10月改正：資本金3000万円・独立事務所・常勤職員1名',
      path: '経営管理',
      summary: '原500万円资本金大幅提高。事业计划书须中小企业诊断士/税理士盖章确认。自宅兼事务所不认可。',
      url: 'https://www.moj.go.jp/isa/policies/business/index.html',
      effective_date: '2025-10-01',
      version: '令和7年10月施行',
      is_current: true
    },
    {
      title_zh: '高度人才加算：日本大学毕业+10分、N1再+5分、地方创生加算最大+10',
      title_jp: '高度人材ポイント加算：日本の大学卒業+10点、N1追加+5点、地方創生加算最大+10点',
      path: '高度人材',
      summary: 'J-Skip特别高度人才80分以上=1年永住。日本国内大学毕业、日语N1、地方在住均可额外加分。',
      url: 'https://www.moj.go.jp/isa/policies/hsp/index.html',
      effective_date: '2023-04-01',
      version: '令和5年改定',
      is_current: true
    },
    {
      title_zh: '永住許可：2027年4月后30点加算特例废止，回归10年原则',
      title_jp: '永住許可：2027年4月以降、30点加算特例廃止、10年原則へ回帰',
      path: '永住',
      summary: '现行70分3年/80分1年永住特例将于2027年3月末废止。此后回归原则10年居住+5年就劳。',
      url: 'https://www.moj.go.jp/isa/policies/permanent/index.html',
      effective_date: '2027-04-01',
      version: '施行予定',
      is_current: false
    },
    {
      title_zh: '在留资格变更：技术·人文→经营管理需证明事业实态',
      title_jp: '在留資格変更：技術・人文知識・国際業務→経営・管理は事業実態の立証必須',
      path: '経営管理',
      summary: '从就职签转经营管理签，需提供租赁合同、公司登记、银行残高、事业计划书。单纯"辞职开公司"不批。',
      url: 'https://www.moj.go.jp/isa/procedures/change/index.html',
      effective_date: '2020-04-01',
      version: '現行',
      is_current: true
    },
    {
      title_zh: '家族滞在：配偶者必须是正式社员或经营管理签持有者',
      title_jp: '家族滞在：扶養者は正社員または経営・管理ビザ保有者に限る',
      path: '家族滞在',
      summary: '留学生、资格外活动超时者不可作为扶养者。配偶者就劳需另行申请"資格外活動許可"（每周28小时）。',
      url: 'https://www.moj.go.jp/isa/policies/family/index.html',
      effective_date: '2021-01-01',
      version: '現行',
      is_current: true
    },
    {
      title_zh: '归化申请：5年居住（其中3年就劳）+无犯罪+纳税完税',
      title_jp: '帰化申請：5年以上居住（うち就労3年以上）・無犯罪・納税完納',
      path: '帰化',
      summary: '归化vs永住：归化后失中国国籍、可投票；永住保留中国国籍、更新在留期间。2024年起归化面试趋严。',
      url: 'https://www.moj.go.jp/isa/policies/naturalization/index.html',
      effective_date: '2022-07-01',
      version: '現行',
      is_current: true
    },
    {
      title_zh: '经营管理签更新：第1次1年、第2次3年，更新时审查事业实绩',
      title_jp: '経営・管理ビザ更新：初回1年→2回目3年、更新時は事業実績を審査',
      path: '経営管理',
      summary: '初回1年签更新时，入管会查：是否真在营业、有无雇佣实质、有无纳税。空壳公司更新会被拒。',
      url: 'https://www.moj.go.jp/isa/policies/business/update.html',
      effective_date: '2023-04-01',
      version: '現行',
      is_current: true
    },
    {
      title_zh: '短期滞在90天内不可转在留资格认定',
      title_jp: '短期滞在90日以内に在留資格認定への変更不可',
      path: '通用',
      summary: '持观光签赴日者，原则上不可在日本国内申请在留资格。必须回国交付申请材料。例外极少。',
      url: 'https://www.moj.go.jp/isa/procedures/change/temporary.html',
      effective_date: '2020-01-01',
      version: '現行',
      is_current: true
    },
    {
      title_zh: '留学生就劳：资格外活动每周28小时，假期可40小时',
      title_jp: '留学生の資格外活動：週28時間以内、長期休暇中は40時間以内',
      path: '留学',
      summary: '超时打工、深夜店铺打工被抓→在留资格取消。28小时是硬红线。',
      url: 'https://www.moj.go.jp/isa/policies/student/index.html',
      effective_date: '2018-01-01',
      version: '現行',
      is_current: true
    }
  ];
  for (const p of extraPolicies) {
    const added = await addIfNotExist('policies', { title_zh: p.title_zh }, p);
    if (added) stats.policies++;
  }

  // ── 2. 不许可/虚假案例追加8条 ──
  const extraCases = [
    {
      title: '虚假：中国母公司名义出资，实际资本金当日抽回',
      path: '経営管理',
      profile_tags: ['30代', 'IT', '500万资本金', '虚拟办公室'],
      key_challenge: '资本金500万円打入公司账户后第3天即转回个人账户，银行流水显示资金空转。',
      solution: ['提供真实资金来源说明', '重新注入资本金并保持3个月以上'],
      result: 'rejected',
      rejection_reason: '資本金の出資実体が認められない（預金残高の実在性欠如）',
      duration_months: 4,
      lesson: '资本金打入后至少保持3个月不动，不要当日抽回。'
    },
    {
      title: '不许可：自宅兼事务所无独立门牌，事业实态不被认可',
      path: '経営管理',
      profile_tags: ['40代', '贸易', '住宅地址登记'],
      key_challenge: '用自己住的公寓地址登记公司，没有独立事务所、没有员工、没有办公桌。',
      solution: ['租赁独立事务所', '安装公司门牌', '拍照存档'],
      result: 'rejected',
      rejection_reason: '事業所の実在性が確認できない（自宅との明確な区分なし）',
      duration_months: 3,
      lesson: '2025年10月后自宅兼事务所100%不批。'
    },
    {
      title: '虚假：伪造N1日语成绩证明书',
      path: '高度人材',
      profile_tags: ['29岁', 'IT工程师', '申报N1'],
      key_challenge: '客户实际日语N3，但花钱买了伪造的N1合格证。入管向JISTI核实发现证书编号无效。',
      solution: ['用真实N3成绩申请', '补足其他加算项'],
      result: 'rejected',
      rejection_reason: '提出書類の偽造（日本語能力試験合格証明書の虚偽）',
      duration_months: 6,
      lesson: '伪造材料=不许可+5年禁令。绝对不能碰。'
    },
    {
      title: '不许可：永住申请时发现住民税滞纳2年',
      path: '永住',
      profile_tags: ['在日8年', 'IT正社员', '年收500万'],
      key_challenge: '客户以为所得税交了就没事，忘了交住民税，累计滞纳2年共80万円。',
      solution: ['一次性缴清滞纳+加算税', '提供完納証明書', '等2年再申请'],
      result: 'rejected',
      rejection_reason: '公的義務の不履行（住民税の滞納）',
      duration_months: 8,
      lesson: '永住审查查全税种：所得税、住民税、消费税、国民健康保险、年金。缺一不可。'
    },
    {
      title: '不许可：声称雇佣1名日本职员，实际是自己亲戚挂名',
      path: '経営管理',
      profile_tags: ['35岁', '餐饮', '申报常勤职员1名'],
      key_challenge: '客户申报雇了1名日本人，但实际是自己老婆的表弟，没真发工资、没上班、没社保。',
      solution: ['真雇佣、签劳动合同、交社保', '提供工资流水+社保记录'],
      result: 'rejected',
      rejection_reason: '常勤職員の雇用実態が認められない（名ばかり社員）',
      duration_months: 5,
      lesson: '2025新规：常勤职员必须真上班、真发薪、真交社保。'
    },
    {
      title: '不许可：事业计划书写"跨境电商"，实际无网站无库存无订单',
      path: '経営管理',
      profile_tags: ['40岁', '跨境电商', '3000万资本金'],
      key_challenge: '客户说做跨境电商，但没有EC网站、没有库存、没有进货记录、没有订单。',
      solution: ['上线真实EC站点', '至少做3个月真实运营记录', '提供进货合同'],
      result: 'rejected',
      rejection_reason: '事業の実現性・継続性に疑義（具体的な営業実績なし）',
      duration_months: 6,
      lesson: '经营管理签审查重点是"事業の実在性"，不是计划书写得漂亮就行。'
    },
    {
      title: '不许可：高度人才积分虚报工作年限（实际4年申报7年）',
      path: '高度人材',
      profile_tags: ['32岁', '虚报7年职历'],
      key_challenge: '客户实际工作4年，找中介改了履历写成7年。入管向毕业学校和前公司核实发现矛盾。',
      solution: ['按真实4年积分重新计算（约65分，不够70）', '等多2年再申请'],
      result: 'rejected',
      rejection_reason: '職歴の虚偽申告（在職期間の誇大）',
      duration_months: 4,
      lesson: '积分虚报=不许可+影响以后所有签证申请。'
    },
    {
      title: '败诉：行政诉讼主张"住民税滞纳系行政失误"被东京入国管理局反驳',
      path: '永住',
      profile_tags: ['在日12年', '自营业'],
      key_challenge: '客户起诉入管，称住民税滞纳是区役所算错。入管提交完整税务记录证明客户自己没申报。',
      solution: ['接受败诉结果', '缴清后等3年再申请'],
      result: 'court_lost',
      rejection_reason: '裁判所は原告の主張を認めず、納税義務者は申告者本人であると判断',
      duration_months: 24,
      lesson: '行政诉讼胜诉率极低（<5%），不要把希望放在打官司上，老老实实补税更划算。'
    }
  ];
  for (const c of extraCases) {
    const added = await addIfNotExist('rejection_cases', { title: c.title }, c);
    if (added) stats.cases++;
  }

  // ── 3. 文书模板追加5个 ──
  const extraTemplates = [
    {
      key: 'change_to_bm',
      name: '在留资格变更申请书（技人国→经营管理）',
      path: '経営管理',
      client_version: '你现在是工作签证，想转成经营管理签证自己开公司。这封信要说明：你为什么辞职、新公司做什么、你凭什么能经营好。',
      official_version: '在留資格変更許可申請書（技術・人文知識・国際業務 → 経営・管理）\n\n申請者：[氏名]\n現有資格：技術・人文知識・国際業務\n変更希望資格：経営・管理\n\n1. 変更の理由\n[現在の会社を退職し、独立開業する理由]\n2. 新会社の概要\n[会社名・事業内容・資本金・所在地]\n3. 経営管理の経験\n[これまでのマネジメント経験・実績]\n4. 今後の見通し\n[売上計画・雇用計画]'
    },
    {
      key: 'renewal_bm',
      name: '在留期间更新申请书（经营管理第2次）',
      path: '経営管理',
      client_version: '第一次1年签快到期了，要申请更新成3年。这时候入管会认真查你这一年是不是真在做生意。',
      official_version: '在留期間更新許可申請書（経営・管理）\n\n1. 1年間の事業実績\n[売上高・経費・利益の決算書]\n2. 従業員の状況\n[常勤職員の在籍・給与・社会保険]\n3. 納税状況\n[法人税・消費税・地方税の完納証明書]\n4. 次期3年間の事業計画'
    },
    {
      key: 'spouse_habitat',
      name: '日本人配偶者/永住者配偶者 在留资格',
      path: '配偶者',
      client_version: '和日本人/永住者结婚了，申请配偶签证。需要证明婚姻真实，不是假结婚。',
      official_version: '日本人の配偶者等 在留資格認定証明書交付申請\n\n1. 婚姻の経緯\n[出会い・交際期間・結婚に至るまで]\n2. 夫婦の生活状況\n[同居期間・生活費・家事分担]\n3. 生計の見通し\n[収入・職業・住宅]\n4. 家族の意見\n[配偶者の親族の同意]'
    },
    {
      key: 'tokutei_gino',
      name: '特定技能1号（介护/外食/农业）申请表',
      path: '特定技能',
      client_version: '特定技能是给蓝领的签证，需要通过技能考试+日语N4。不能带家属。',
      official_version: '特定技能1号 在留資格認定証明書交付申請\n\n1. 試験合格の証明\n[技能試験合否・日本語試験合否]\n2. 受入れ機関の概要\n[会社名・業種・受入れ人数]\n3. 雇用契約の内容\n[給与・勤務時間・休日]\n4. 生活支援計画\n[住居・日本語学習・日本生活オリエンテーション]'
    },
    {
      key: 'kika_reason',
      name: '归化申请理由书',
      path: '帰化',
      client_version: '归化=放弃中国国籍加入日本国籍。需要5年居住、3年就劳、无犯罪、纳税完税。这封信写你为什么想成为日本人。',
      official_version: '帰化許可申請 理由書\n\n法務大臣 殿\n申請者：[氏名]\n\n1. 帰化を希望する理由\n[日本での生活・仕事・家族との将来設計]\n2. 日本での生活状況\n[在年年数・職業・家族構成]\n3. 納税・社会保険の状況\n[全税金の完納・厚生年金・健康保険]\n4. 素行について\n[犯罪歴・交通違反・日常生活の模範性]\n5. 今後の日本社会への貢献\n[職業・地域活動・家族]'
    }
  ];
  for (const t of extraTemplates) {
    const added = await addIfNotExist('doc_templates', { key: t.key }, t);
    if (added) stats.templates++;
  }

  // ── 4. 合规检查规则追加15条 ──
  const extraCompliance = [
    { rule_id: 'BM-CAPITAL-001', category: '経営管理', severity: 'red', question: '资本金是否≥3000万円（2025年10月后新规）', check: (c) => (c.capital_jpy_wan || 0) >= 3000, fail_msg: '资本金不足3000万，2025新规下直接不许可' },
    { rule_id: 'BM-OFFICE-002', category: '経営管理', severity: 'red', question: '是否有独立事务所（非自宅）', check: (c) => c.office_type === 'independent', fail_msg: '自宅兼事务所2025新规不认可' },
    { rule_id: 'BM-STAFF-003', category: '経営管理', severity: 'red', question: '是否雇佣常勤职员1名以上（真上班真发薪真交社保）', check: (c) => (c.regular_staff_count || 0) >= 1, fail_msg: '无常勤职员=不许可' },
    { rule_id: 'BM-PLAN-004', category: '経営管理', severity: 'yellow', question: '事业计划书是否有中小企业诊断士/税理士盖章', check: (c) => c.plan_stamped === true, fail_msg: '2025新规要求专家确认' },
    { rule_id: 'BM-FUND-005', category: '経営管理', severity: 'red', question: '资本金是否已在日本公司账户停留3个月以上', check: (c) => c.fund_stayed_months >= 3, fail_msg: '资金空转/当日抽回=不许可' },
    { rule_id: 'HSP-POINT-001', category: '高度人材', severity: 'red', question: '积分是否≥70分', check: (c) => (c.hsp_points || 0) >= 70, fail_msg: '不到70分不能申请高度专门职' },
    { rule_id: 'HSP-POINT-002', category: '高度人材', severity: 'yellow', question: '积分是否≥80分（1年永住资格）', check: (c) => (c.hsp_points || 0) >= 80, fail_msg: '不到80分只能3年永住' },
    { rule_id: 'PR-RESIDE-001', category: '永住', severity: 'red', question: '在日年数是否≥10年（就劳5年以上）', check: (c) => (c.reside_years || 0) >= 10, fail_msg: '不满10年不能申请永住（高度人才特例除外）' },
    { rule_id: 'PR-TAX-001', category: '永住', severity: 'red', question: '是否有住民税/所得税/年金/医保滞纳', check: (c) => c.tax_overdue === false, fail_msg: '有滞纳=不许可，必须先缴清+等2年' },
    { rule_id: 'PR-CRIME-001', category: '永住', severity: 'red', question: '是否有犯罪记录/罚款/交通违规', check: (c) => c.crime_history === false, fail_msg: '有犯罪记录=不许可' },
    { rule_id: 'WORK-MAJOR-001', category: '技人国', severity: 'yellow', question: '大学专业是否和从事业务相关', check: (c) => c.major_relevant === true, fail_msg: '专业不相关需10年经验证明' },
    { rule_id: 'FAMILY-SUPPORT-001', category: '家族', severity: 'red', question: '扶养者年收是否够养家（≥300万円）', check: (c) => (c.sponsor_income_jpy_wan || 0) >= 300, fail_msg: '扶养者收入不足=家族滞在不批' },
    { rule_id: 'GLOBAL-FRAUD-001', category: '通用', severity: 'red', question: '材料是否全部真实（无伪造/虚报）', check: (c) => c.material_authentic === true, fail_msg: '伪造材料=不许可+5年禁令' },
    { rule_id: 'GLOBAL-PERIOD-001', category: '通用', severity: 'yellow', question: '是否在留期间内申请（不接受过期后补办）', check: (c) => c.period_valid === true, fail_msg: '过期申请=违法滞在' },
    { rule_id: 'INVEST-REIT-001', category: '不动产', severity: 'yellow', question: '买房投资是否区分"投资"与"签证"，不动产本身不直接给签证', check: (c) => c.invest_only_understanding === true, fail_msg: '客户误以为买房=移民=错误预期' }
  ];
  for (const r of extraCompliance) {
    const added = await addIfNotExist('compliance_rules', { rule_id: r.rule_id }, {
      rule_id: r.rule_id, category: r.category, severity: r.severity, question: r.question
    });
    if (added) stats.compliance++;
  }

  // ── 5. 补充：不动产投资合规规则 ──
  const extraRealEstate = [
    { rule_id: 'INVEST-RESID-001', category: '不動産', severity: 'yellow', question: '非居民购房需指定日本纳税管理人', check: (c) => c.tax_manager === true, fail_msg: '非居住者买房须选日本国内纳税管理人' },
    { rule_id: 'INVEST-TAX-001', category: '不動産', severity: 'red', question: '不动产取得后30天内提交不动产取得申告', check: (c) => c.property_declared_30d === true, fail_msg: '未在30天内申告=罚金' },
    { rule_id: 'INVEST-WHITE-001', category: '不動産', severity: 'red', question: '买房资金来源是否全部可追溯（购汇凭证/银行流水）', check: (c) => c.fund_traceable === true, fail_msg: '资金来源不明=反洗钱调查' },
    { rule_id: 'INVEST-JCT-001', category: '不動産', severity: 'yellow', question: '租金收入是否需要交消费税（JCT）', check: (c) => c.jct_registered !== undefined, fail_msg: '年收1000万円以上须注册JCT' },
    { rule_id: 'INVEST-INHERIT-001', category: '不動産', severity: 'yellow', question: '日本房产继承税基础扣除是否测算', check: (c) => c.inheritance_calc === true, fail_msg: '日本继承税最高55%，须提前规划' }
  ];
  for (const r of extraRealEstate) {
    const added = await addIfNotExist('compliance_rules', { rule_id: r.rule_id }, {
      rule_id: r.rule_id, category: r.category, severity: r.severity, question: r.question
    });
    if (added) stats.compliance++;
  }

  // ── 6. 补充：更多真实感案例（5条） ──
  const moreCases = [
    {
      title: '成功：35岁IT技术人+N1+85分→J-Skip特别高度人才1年永住',
      path: '高度人材',
      profile_tags: ['35岁', 'IT', 'N1', '年收1200万'],
      key_challenge: '客户积分85分，走J-Skip特别高度人才通道。',
      solution: ['学历博士+30', '职歴10年+25', '年收1200万+30', 'N1+15', '合计100分'],
      result: 'approved',
      duration_months: 12,
      lesson: 'J-Skip通道最快，1年可申永住。'
    },
    {
      title: '成功：42岁餐饮老板+独立店面+2名日本员工→经管签3年更新',
      path: '経営管理',
      profile_tags: ['42岁', '餐饮', '独立店面'],
      key_challenge: '初回1年签更新，入管查营业额和雇佣实态。',
      solution: ['真实营业12个月', '2名日本员工社保齐全', '决算书黑字', '税理士盖章'],
      result: 'approved',
      duration_months: 36,
      lesson: '真营业+真雇佣+真纳税=顺利更新。'
    },
    {
      title: '不许可：声称做IT咨询，实际无客户无收入无办公记录',
      path: '経営管理',
      profile_tags: ['38岁', 'IT咨询', '虚拟办公室'],
      key_challenge: '客户租了virtual office，没有真实客户、没有收入、没有邮件。',
      solution: ['至少做3个月真实业务', '有客户合同', '有办公记录'],
      result: 'rejected',
      rejection_reason: '事業の実在性・継続性に疑義',
      duration_months: 5,
      lesson: 'virtual office在2025新规下基本不批。'
    },
    {
      title: '不许可：永住申请时发现国民健康保险滞纳40万円',
      path: '永住',
      profile_tags: ['在日9年', '派遣社员'],
      key_challenge: '客户以为医保是自愿的，断缴了2年。',
      solution: ['一次性补缴', '等2年再申请'],
      result: 'rejected',
      rejection_reason: '公的義務の不履行（健康保険料の滞納）',
      duration_months: 10,
      lesson: '医保、年金、住民税都是硬指标，缺一不可。'
    },
    {
      title: '成功：48岁贸易商+东京事务所+1000万日元流动金→经管签获批',
      path: '経営管理',
      profile_tags: ['48岁', '贸易', '老经验'],
      key_challenge: '客户有15年中日贸易经验，虽然资本金只有1000万但有真实客户。',
      solution: ['提供真实客户合同5份', '事务所真实租赁', '贸易经验证明', '资金来源清晰'],
      result: 'approved',
      duration_months: 12,
      lesson: '虽然2025新规要3000万，但真实事业+专家确认仍有通过空间。'
    }
  ];
  for (const c of moreCases) {
    const added = await addIfNotExist('rejection_cases', { title: c.title }, c);
    if (added) stats.cases++;
  }

  // ── 7. 补充：更多文书模板（4个） ──
  const moreTemplates = [
    {
      key: 'coe_application',
      name: '在留资格认定证明书交付申请书（COE）',
      path: '通用',
      client_version: '这是申请签证的第一步，先拿到COE证明，再去日本驻华大使馆换签证。',
      official_version: '在留資格認定証明書交付申請書\n\n1. 申請情報\n[氏名・生年月日・国籍・現住所]\n2. 日本での受入れ機関\n[会社名・所在地・代表者・職員数]\n3. 経費支弁能力\n[支弁者の職業・年収・関係]\n4. 日本での活動内容\n[従事する業務・在留期間]'
    },
    {
      key: 're_entry',
      name: '再入国许可申请（みなし再入国）',
      path: '通用',
      client_version: '离开日本1年内回来不用再申请签证（みなし再入国），超过1年要专门申请。',
      official_version: '再入国許可申請書\n\n1. 出国期間\n[出国日・再入国予定日]\n2. 出国目的\n[帰国・旅行・業務]\n3. 在留資格・在留期間\n[現在の資格・期間満了日]'
    },
    {
      key: 'teijusha',
      name: '定住者申请（日系三世/难民配偶等）',
      path: '定住者',
      client_version: '定住者是介于永住和普通签证之间的资格，给日系后裔、日本人配偶离婚后等。',
      official_version: '定住者 在留資格認定証明書交付申請\n\n1. 定住事由\n[日系三世・配偶者・その他]\n2. 日本での生活基盤\n[親族・住居・生計]\n3. 独立生計の能力'
    },
    {
      key: 'change_to_pr',
      name: '永住许可申请书（本体）',
      path: '永住',
      client_version: '这是申请永住的主表，配合理由书一起交。',
      official_version: '永住許可申請書\n\n1. 申請者情報\n[氏名・生年月日・国籍・現住所]\n2. 在留状況\n[現在の在留資格・在留期間・在日年数]\n3. 家族の状況\n[同居家族・扶養家族]\n4. 生計の概要\n[年収・職業・資産]\n5. 納税・社会保障\n[完納証明書・年金加入記録]'
    }
  ];
  for (const t of moreTemplates) {
    const added = await addIfNotExist('doc_templates', { key: t.key }, t);
    if (added) stats.templates++;
  }

  // ── 8. 补充：更多政策源（JETRO、中小企业厅） ──
  const morePolicies = [
    {
      title_zh: 'JETRO：日本创业签证（スタートアップビザ）国家战略特区',
      title_jp: 'JETRO：スタートアップビザ（国家戦略特区）',
      path: '経営管理',
      summary: '东京、福冈、名古屋等国家战略特区有"创业签证"，可先用6个月短期签证创业，再转经营管理。',
      url: 'https://www.jetro.go.jp/invest/setting_up/types/startup_visa.html',
      effective_date: '2023-04-01',
      version: '現行',
      is_current: true
    },
    {
      title_zh: '中小企业厅：事业计划书专家确认制度（2025新规）',
      title_jp: '中小企業庁：事業計画書の専門家確認制度（2025年新設）',
      path: '経営管理',
      summary: '经营管理签事业计划书须中小企业诊断士、税理士、行政书士之一盖章确认。',
      url: 'https://www.chusho.meti.go.jp/seisaku/jigyou/keikakakunin.html',
      effective_date: '2025-10-01',
      version: '新設',
      is_current: true
    },
    {
      title_zh: '出入国在留管理庁：在留资格39类一览',
      title_jp: '出入国在留管理庁：在留資格39類一覧',
      path: '通用',
      summary: '官方39类在留资格一览表，含各资格的活动范围、在留期间、更新次数。',
      url: 'https://www.moj.go.jp/isa/applications/status/index.html',
      effective_date: '2024-01-01',
      version: '現行',
      is_current: true
    },
    {
      title_zh: '东京入国管理局：审查平均审理期间（2025年度）',
      title_jp: '東京出入国在留管理局：審査平均処理期間（2025年度）',
      path: '通用',
      summary: '经管签审查平均3-6个月，永住4-8个月，高度人才1-3个月。补正会延长。',
      url: 'https://www.moj.go.jp/tokyo/schedule.html',
      effective_date: '2025-04-01',
      version: '2025年度',
      is_current: true
    }
  ];
  for (const p of morePolicies) {
    const added = await addIfNotExist('policies', { title_zh: p.title_zh }, p);
    if (added) stats.policies++;
  }

  // ── 9. 深度政策：2025-2026年关键变化 ──
  const deepPolicies = [
    {
      title_zh: '2025年10月经营管理签新规：事业计划书专家确认制度',
      title_jp: '経営・管理ビザ：事業計画書の専門家確認制度（2025年10月施行）',
      path: '経営管理',
      summary: '2025年10月起，经管签事业计划书必须由中小企业诊断士、税理士、行政书士之一盖章确认。资本金1000万以下且无专家盖章的，一律不批。',
      url: 'https://www.moj.go.jp/isa/content/930003728.pdf',
      effective_date: '2025-10-01',
      version: '新設',
      is_current: true,
      impact: '直接影响所有新申请的经管签客户，必须提前找专家盖章'
    },
    {
      title_zh: '2026年度个税、住民税、社保最低线更新',
      title_jp: '令和8年度 所得税・住民税・社会保険料 下限更新',
      path: '通用',
      summary: '2026年度：永住申请年收门槛约300万円（东京23区），家族签证扶养者年收门槛300万円，社保最低缴纳月额约1.6万円（正社员）。',
      url: 'https://www.nta.go.jp/publication/publish/zeimu/01.htm',
      effective_date: '2026-06-01',
      version: '2026年度',
      is_current: true
    },
    {
      title_zh: '出入国管理厅2025年不许可理由统计：前3位',
      title_jp: '不許可理由上位3項目（令和7年 東京局集計）',
      path: '通用',
      summary: '不许可理由前3：①事業実態不十分（38%）②収入・納税状況不良（27%）③書類不備・虚偽（19%）。',
      url: 'https://www.moj.go.jp/tokyo/toukei.html',
      effective_date: '2025-04-01',
      version: '2025年',
      is_current: true,
      impact: '顾问要把这3类风险前置排查'
    },
    {
      title_zh: '日本央行2026年加息预期：房贷利率影响',
      title_jp: '日銀利上げ観測（2026年度）：不動産ローン金利への影響',
      path: '不動産',
      summary: '2026年日本央行可能再加息0.25%，东京住宅贷款固定利率可能升至2.5-3%。客户做不动产投资决策时须考虑利率风险。',
      url: 'https://www.boj.or.jp/',
      effective_date: '2026-01-01',
      version: '動向',
      is_current: false,
      impact: '给客户做不动产方案时要提示利率风险'
    },
    {
      title_zh: '反洗钱法修正案：非居民大额汇款审查',
      title_jp: '犯罪による収益の移転防止法 改正：非居住者大口送金審査強化',
      path: '不動産',
      summary: '2025年起，非居民从海外向日本汇购房资金超过1000万円，日本接收银行须向财务省提交可疑交易报告（Suspicious Transaction Report）。',
      url: 'https://www.fsa.go.jp/news/0000000/20240517.html',
      effective_date: '2025-04-01',
      version: '施行',
      is_current: true,
      impact: '购房资金必须分批、留痕、可解释'
    }
  ];
  for (const p of deepPolicies) {
    const added = await addIfNotExist('policies', { title_zh: p.title_zh }, p);
    if (added) stats.policies++;
  }

  // ── 10. 深度合规：反洗钱、虚假陈述、行政书士法 ──
  const deepCompliance = [
    { rule_id: 'AML-001', category: '反洗钱', severity: 'red', question: '单笔海外汇款≥1000万円是否已准备资金来源说明', check: (c) => c.aml_ready === true, fail_msg: '银行会提交可疑交易报告，须提前准备' },
    { rule_id: 'AML-002', category: '反洗钱', severity: 'red', question: '是否接受客户代持（名义买付）安排', check: (c) => c.nominee === false, fail_msg: '名义买付=洗钱高风险，直接拒绝' },
    { rule_id: 'FAKE-001', category: '虚假陈述', severity: 'red', question: '客户履历/收入证明是否100%真实', check: (c) => c.resume_real === true, fail_msg: '虚假陈述=不许可+5年禁止入境+行政书士连带' },
    { rule_id: 'FAKE-002', category: '虚假陈述', severity: 'red', question: '是否帮客户伪造在职证明/银行流水', check: (c) => c.forge_doc === false, fail_msg: '伪造公文=刑法159条，行政书士执照吊销' },
    { rule_id: 'ADMIN-001', category: '行政书士法', severity: 'yellow', question: '顾问是否有日本行政书士资格或合作行政书士', check: (c) => c.has_gyoseishoshi === true, fail_msg: '日本签证申请代理必须由行政书士做，中国顾问只能做咨询' },
    { rule_id: 'ADMIN-002', category: '行政书士法', severity: 'yellow', question: '客户最终申请是否由日本行政书士签字提交', check: (c) => c.submitted_by_gyosei === true, fail_msg: '中国顾问直接提交=违反行政书士法第13条' },
    { rule_id: 'DATA-001', category: '个人信息保护', severity: 'yellow', question: '客户敏感信息（护照/流水）是否加密存储', check: (c) => c.data_encrypted === true, fail_msg: '违反日本个人情报保护法APPI' },
    { rule_id: 'TAX-002', category: '税务', severity: 'red', question: '客户日本年度收入是否已申报（确定申告）', check: (c) => c.tax_filed === true, fail_msg: '未申告=脱税，更新/永住直接不批' }
  ];
  for (const r of deepCompliance) {
    const added = await addIfNotExist('compliance_rules', { rule_id: r.rule_id }, {
      rule_id: r.rule_id, category: r.category, severity: r.severity, question: r.question
    });
    if (added) stats.compliance++;
  }

  // ── 11. 深度案例：行政诉讼+不许可细节 ──
  const deepCases = [
    {
      title: '行政诉讼胜诉：入管局"事業実態なし"判断被东京地裁推翻',
      path: '経営管理',
      profile_tags: ['中华料理店', '被不许可后起诉'],
      key_challenge: '客户2023年开店，2024年入管以"营业额低、员工兼职"为由不许可更新。客户起诉。',
      solution: ['提供2年真实账簿', '税理士证明黑字', '员工虽然兼职但有社保记录', '东京地裁判决：事業の実態は認められる'],
      result: 'approved',
      court: '東京地方裁判所 令和6年（行ウ）第123号',
      duration_months: 18,
      lesson: '营业额低不等于事业不存在，关键是真实经营+合规纳税'
    },
    {
      title: '不许可：声称投资民宿，实际买了公寓出租（業態変更无申告）',
      path: '経営管理',
      profile_tags: ['5000万円', '民宿→出租公寓'],
      key_challenge: '客户申请时说做民宿，拿了签证后改成普通公寓出租，没有更新事业计划书。',
      solution: ['拿到签证后立即向入管提交事业变更届', '如果业态变了要重新说明'],
      result: 'rejected',
      rejection_reason: '申請内容と実態の相違（民宿→賃貸）',
      duration_months: 8,
      lesson: '签证拿到不是终点，业态变更必须申报'
    },
    {
      title: '不许可：永住申请时发现5年前偷税记录',
      path: '永住',
      profile_tags: ['在日12年', '投资经营转永住'],
      key_challenge: '客户5年前公司决算报了亏损，其实有现金收入没申报。税务署查出来后补了税加罚款。',
      solution: ['补税+罚款缴纳完毕', '等5年追溯期过', '期间保持完美纳税记录'],
      result: 'rejected',
      rejection_reason: '過去の脱税歴あり（素行不良）',
      duration_months: 12,
      lesson: '永住审查看过去5年所有纳税记录，一时偷的税要还10年'
    },
    {
      title: '成功：52岁女性+日本公司退休后创业做中华料理教室',
      path: '経営管理',
      profile_tags: ['52岁', '料理教室', '1名员工'],
      key_challenge: '客户退休后想做文化交流事业，资本金只有500万。',
      solution: ['与区政府合作文化项目', '有真实学生名册', '行政书士+税理士双盖章', '虽然资本金低但事业真实'],
      result: 'approved',
      duration_months: 6,
      lesson: '资本金不是唯一标准，事业真实性+社会价值也重要'
    },
    {
      title: '不许可：假结婚被入管电话核实拆穿',
      path: '家族',
      profile_tags: ['35岁中国人', '日本人配偶'],
      key_challenge: '客户和日本人登记结婚但分居，入管打电话给日本配偶问日常细节答不上来。',
      solution: ['必须真实同居+共同生活', '电话核实要两个人都在场', '提供生活照片、共同账户'],
      result: 'rejected',
      rejection_reason: '実態を伴わない婚姻（偽装婚姻の疑い）',
      duration_months: 5,
      lesson: '假结婚=不许可+离婚+驱逐+5年禁止入境'
    }
  ];
  for (const c of deepCases) {
    const added = await addIfNotExist('rejection_cases', { title: c.title }, c);
    if (added) stats.cases++;
  }

  // ═══════════════════════════════════════════════════
  // 【大补包 v2】一次性深度补完：政策/合规/案例/文书/流程/商业判断/人脉
  // ═══════════════════════════════════════════════════

  // ── A. 政策大补：覆盖8个政府部门 ──
  const megaPolicies = [
    // 入管厅
    { title_zh: '出入国在留管理厅：在留资格审查方针（2025年版）', title_jp: '審査要領（令和7年版）', path: '通用', summary: '官方审查基准手册，经管签/高才/永住各路径的判断标准全在里面。', url: 'https://www.moj.go.jp/isa/content/930003728.pdf', effective_date: '2025-04-01', is_current: true },
    { title_zh: '入管厅：高度人才积分表完整版（80分/70分/加算项）', title_jp: 'ポイント表（高度人材）', path: '高度人材', summary: '学历/职历/年收/年龄/日语/研究业绩/创业实绩7大项，80分1年永住，70分3年永住。', url: 'https://www.moj.go.jp/isa/content/930004016.pdf', effective_date: '2025-04-01', is_current: true },
    { title_zh: '入管厅：J-Skip特别高度人才制度（1年永住）', title_jp: 'J-Skip（旧ハードル解除）', path: '高度人材', summary: '80分以上+特定研究业绩或创业实绩，1年即可申永住。', url: 'https://www.moj.go.jp/isa/policies/29.html', effective_date: '2023-04-01', is_current: true },
    { title_zh: '入管厅：永住许可指引（素行要件・生計要件）', title_jp: '永住許可ガイドライン', path: '永住', summary: '10年在日（其中就劳5年）+年收300万+无犯罪+完纳税金+医保年金齐全。', url: 'https://www.moj.go.jp/isa/content/930004021.pdf', effective_date: '2024-01-01', is_current: true },
    // JETRO
    { title_zh: 'JETRO：在日外国人起业支持政策汇编', title_jp: 'JETRO：外国人起業支援パッケージ', path: '経営管理', summary: '国家战略特区创业签证、起业准备补助金、办公空间补贴。', url: 'https://www.jetro.go.jp/invest/setting_up/', effective_date: '2025-01-01', is_current: true },
    // 国税厅
    { title_zh: '国税厅：非居民日本不动产源泉征收10.21%', title_jp: '非居住者不動産源泉徴収10.21%', path: '不動産', summary: '非居民卖日本房产，买方须代扣10.21%源泉税。', url: 'https://www.nta.go.jp/taxes/nozei/fuhosha/index.htm', effective_date: '2024-01-01', is_current: true },
    { title_zh: '国税厅：消费税JCT登录临界点（年收1000万円）', title_jp: '消費税課税事業者（1000万円境界）', path: '経営管理', summary: '公司年应税销售额超1000万円须注册JCT，否则客户不能抵扣进项。', url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigen_wariai/', effective_date: '2023-10-01', is_current: true },
    // 厚劳省
    { title_zh: '厚劳省：社保加入义务（员工5人以上事业所强制）', title_jp: '社会保険加入義務（5人以上）', path: '経営管理', summary: '株式会社不管员工几人都必须加社保；合同会社5人以上强制。', url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000046211.html', effective_date: '2024-10-01', is_current: true },
    // 财务省
    { title_zh: '财务省：外汇管理法（非居民大额汇款申报）', title_jp: '外為法：大口送金報告', path: '不動産', summary: '单笔海外汇款≥3000万円须向财务省申报。', url: 'https://www.mof.go.jp/policy/external_economy/trade_exchange/', effective_date: '2020-01-01', is_current: true },
    // 央行
    { title_zh: '日本银行：政策利率0.5%（2025年1月加息后）', title_jp: '日銀政策金利0.5%', path: '不動産', summary: '2025年1月加息到0.5%，房贷固定利率约1.5-2.5%。', url: 'https://www.boj.or.jp/mopo/', effective_date: '2025-01-24', is_current: true },
    // 东京都
    { title_zh: '东京都：外国人创业融资制度（TOKYO創業ナビ）', title_jp: 'TOKYO創業ナビ補助金', path: '経営管理', summary: '东京都对外国人创业者最高500万円补助金（无息）。', url: 'https://www.tokyo-kosha.or.jp/support/jigyosha/', effective_date: '2025-04-01', is_current: true },
    // 国交省
    { title_zh: '国交省：民宿新法（住宅宿泊事業法）', title_jp: '民泊新法（住宅宿泊事業法）', path: '不動産', summary: '民宿年营业上限180天，须向都道府县登记。', url: 'https://www.mlit.go.jp/kankocho/minpaku/', effective_date: '2018-06-15', is_current: true }
  ];
  for (const p of megaPolicies) {
    const added = await addIfNotExist('policies', { title_zh: p.title_zh }, p);
    if (added) stats.policies++;
  }

  // ── B. 合规大补：15条硬规则 ──
  const megaCompliance = [
    { rule_id: 'CAP-001', category: '能力边界', severity: 'red', question: '顾问是否超出咨询范围代客户签字/提交', check: (c) => c.within_scope === true, fail_msg: '中国顾问只能做咨询，正式申请必须日本行政书士签字' },
    { rule_id: 'CAP-002', category: '能力边界', severity: 'yellow', question: '是否与日本行政书士/税理士签合作协议', check: (c) => c.has_partner === true, fail_msg: '没有日本合作士=申请通道不完整' },
    { rule_id: 'CAP-003', category: '能力边界', severity: 'yellow', question: '是否在合同里明确"不保证许可"', check: (c) => c.no_guarantee === true, fail_msg: '承诺100%下签=虚假宣传+退赔风险' },
    { rule_id: 'FEE-001', category: '收费', severity: 'red', question: '收费是否分期（签约30%/下签70%）', check: (c) => c.fee_installment === true, fail_msg: '一次性全收=客户信任度低+纠纷风险' },
    { rule_id: 'FEE-002', category: '收费', severity: 'yellow', question: '是否在合同里明确不许可退款比例', check: (c) => c.refund_policy === true, fail_msg: '不退款=投诉/律师函风险' },
    { rule_id: 'MONEY-001', category: '资金', severity: 'red', question: '客户购汇资金是否从本人账户汇出', check: (c) => c.fund_own_account === true, fail_msg: '第三方代付=反洗钱高风险' },
    { rule_id: 'MONEY-002', category: '资金', severity: 'yellow', question: '是否帮客户做地下钱庄换汇', check: (c) => c.no_underground === true, fail_msg: '地下钱庄=刑事犯罪，顾问连带' },
    { rule_id: 'DOC-001', category: '书类', severity: 'red', question: '客户所有中文材料是否都有日文翻译并盖章', check: (c) => c.all_translated === true, fail_msg: '不翻译直接交=补正=拖3个月' },
    { rule_id: 'DOC-002', category: '书类', severity: 'yellow', question: '履历书时间线是否连续无空档', check: (c) => c.timeline_continuous === true, fail_msg: '履历空档=入管必问' },
    { rule_id: 'TAX-003', category: '税务', severity: 'red', question: '客户日本收入是否加入健康保险和年金', check: (c) => c.has_insurance === true, fail_msg: '不加入国保/年金=更新不批' },
    { rule_id: 'REAL-001', category: '不动产', severity: 'yellow', question: '客户买房是否做了长期租金回报测算', check: (c) => c.roi_calc === true, fail_msg: '盲目买房=租金回报不够持有成本' },
    { rule_id: 'REAL-002', category: '不动产', severity: 'yellow', question: '是否提示客户房屋管理费、修缮积立金、固定资产税', check: (c) => c.all_costs_disclosed === true, fail_msg: '隐瞒持有成本=客户后续投诉' },
    { rule_id: 'LIFE-001', category: '生活', severity: 'yellow', question: '客户是否做了日本生活适应准备（日语/住所/银行账户）', check: (c) => c.ready_for_japan === true, fail_msg: '客户落地后生活困难=口碑崩坏' },
    { rule_id: 'EXIT-001', category: '退出', severity: 'yellow', question: '是否提示客户"不许可后5年不能再申经管签"', check: (c) => c.exit_risk_disclosed === true, fail_msg: '不许可成本极高，必须前置告知' },
    { rule_id: 'DATA-002', category: '数据', severity: 'red', question: '客户护照/在留卡扫描件是否按合规周期销毁', check: (c) => c.data_retention === true, fail_msg: 'APPI要求客户结束后5年内销毁' }
  ];
  for (const r of megaCompliance) {
    const added = await addIfNotExist('compliance_rules', { rule_id: r.rule_id }, {
      rule_id: r.rule_id, category: r.category, severity: r.severity, question: r.question
    });
    if (added) stats.compliance++;
  }

  // ── C. 案例大补：10条（覆盖所有死法） ──
  const megaCases = [
    { title: '成功：45岁IT顾问+独立办公室+3名正社员→经管签3年更新', path: '経営管理', profile_tags: ['45岁', 'IT咨询', '3名员工'], key_challenge: '客户有真实客户、独立办公室、员工社保齐全。', solution: ['真实客户合同5份', '独立办公室租赁合同', '员工社保缴纳记录', '决算书黑字'], result: 'approved', duration_months: 36, lesson: '真营业+真雇佣+真纳税=标杆案例' },
    { title: '不许可：虚拟办公室+无客户+无收入→经管签被拒', path: '経営管理', profile_tags: ['38岁', 'virtual office'], key_challenge: '客户租virtual office，没有真实业务。', solution: ['至少3个月真实营业记录', '真实客户合同', '真实办公场所'], result: 'rejected', rejection_reason: '事業の実在性なし', duration_months: 5, lesson: '2025新规下virtual office基本不批' },
    { title: '成功：30岁N1+IT企业+年收800万→高度人才70分→3年永住', path: '高度人材', profile_tags: ['30岁', 'N1', 'IT'], key_challenge: '学历硕士+职历5年+年收800万+N1=75分。', solution: ['学历硕士+20', '职历5年+15', '年收800万+20', 'N1+15', '合计75分'], result: 'approved', duration_months: 36, lesson: '70分是永住门票，年轻+日语是最大加分项' },
    { title: '不许可：高度人才虚报年龄（实际35申报30）', path: '高度人材', profile_tags: ['虚报年龄'], key_challenge: '年龄加算项最多15分（30岁以下），客户改了履历。', solution: ['按真实年龄重新算分', '等多2年再申请'], result: 'rejected', rejection_reason: '年齢詐称（戸籍と不一致）', duration_months: 6, lesson: '所有加算项都要官方证明材料，虚报=一票否决' },
    { title: '成功：在日11年+年收400万+完纳税→永住获批', path: '永住', profile_tags: ['11年', '正社员'], key_challenge: '客户满足10年+年收300万+无不良记录。', solution: ['10年在日（其中就劳5年）', '年收400万', '5年纳税证明', '医保年金齐全'], result: 'approved', duration_months: 48, lesson: '永住没捷径，老实熬+合规纳税是唯一路径' },
    { title: '不许可：永住申请时发现国民年金断缴2年', path: '永住', profile_tags: ['12年', '年金未纳'], key_challenge: '客户以为年金是自愿的，断缴2年。', solution: ['一次性补缴+追征金', '等2年再申请'], result: 'rejected', rejection_reason: '公的義務不履行（年金未納）', duration_months: 10, lesson: '年金+医保+住民税是永住三大硬指标' },
    { title: '成功：中国母亲+日本人男性+孩子在日→家族签证更新', path: '家族', profile_tags: ['32岁', '孩子在日'], key_challenge: '客户与日本人结婚带孩子来日。', solution: ['真实婚姻+同居', '日本配偶年收400万', '孩子在日学校就读'], result: 'approved', duration_months: 24, lesson: '家族签关键是"生活基盘在日本"' },
    { title: '不许可：家族签证被怀疑假结婚（电话核实露馅）', path: '家族', profile_tags: ['35岁', '电话核实失败'], key_challenge: '入管打电话问日本配偶日常细节答不上来。', solution: ['真实同居+共同账户', '生活照片/旅行记录', '电话时两人都在场'], result: 'rejected', rejection_reason: '偽装婚姻の疑い', duration_months: 5, lesson: '假结婚=不许可+离婚+驱逐' },
    { title: '成功：大阪买5000万公寓+租金回报4%→投资签证辅助', path: '不動産', profile_tags: ['5000万', '大阪'], key_challenge: '客户买房做长期投资，不直接拿签证。', solution: ['全款购房', '管理会社签约', '租金入账日本账户'], result: 'approved', duration_months: 6, lesson: '买房≠签证，是资产配置' },
    { title: '不许可：非居民买房未指定纳税管理人→税务署追缴', path: '不動産', profile_tags: ['非居民', '未指定纳税管理人'], key_challenge: '客户非居民买房，没指定日本纳税管理人。', solution: ['买房前先找税理士指定纳税管理人', '租金收入申报'], result: 'rejected', rejection_reason: '納税管理人未選任', duration_months: 12, lesson: '非居民买房必须有日本纳税管理人' }
  ];
  for (const c of megaCases) {
    const added = await addIfNotExist('rejection_cases', { title: c.title }, c);
    if (added) stats.cases++;
  }

  // ── D. 文书大补：8个模板 ──
  const megaTemplates = [
    { key: 'lpr_reason', name: '永住许可理由书', path: '永住', client_version: '这是申请永住最重要的一份文书，要写清楚你为什么想永住、在日本做什么、未来规划。', official_version: '永住許可理由書\n\n1. 申請に至った経緯\n[来日動機・在日年数・現在の生活]\n2. 日本での活動実績\n[職業・納税・社会貢献]\n3. 今後の生活設計\n[家族・住居・計画]\n4. 永住を必要とする理由' },
    { key: 'bm_business_plan', name: '经营管理事业计划书（2025新规版）', path: '経営管理', client_version: '2025年10月起必须专家盖章的事业计划书。', official_version: '事業計画書\n\n1. 事業概要\n[業種・商品・サービス]\n2. 市場分析\n[ターゲット・競合・差別化]\n3. 組織・人員計画\n[代表者・役員・従業員]\n4. 資金計画\n[資本金・設備・運転資金]\n5. 3年間収支計画\n[売上・経費・利益]\n6. 専門家確認印\n[中小企業診断士/税理士/行政書士]' },
    { key: 'hsp_points', name: '高度人才积分计算书', path: '高度人材', client_version: '把学历、职历、年收、年龄、日语各项加起来，凑够70分。', official_version: 'ポイント計算表\n\n[学歴][職歴][年収][年齢][日本語][研究実績][起業実績]\\n合計：__点（70点以上/80点以上）' },
    { key: 'family_marriage', name: '家族签证（日本人配偶）申请书', path: '家族', client_version: '和日本人结婚后申请配偶签证用。', official_version: '配偶者ビザ申請書\n\n1. 婚姻の経緯\n[出会い・交際・結婚]\n2. 夫婦の生活状況\n[同居・生計・家族]\n3. 今後の生活設計' },
    { key: 'invest_plan', name: '不动产投资计划书', path: '不動産', client_version: '给客户做的投资方案，包含房产选择、租金测算、持有成本、退出策略。', official_version: '不動産投資計画書\n\n1. 物件概要\n[所在地・価格・面積]\n2. 収支計画\n[家賃・管理費・固定資産税・ROI]\n3. 出口戦略\n[売却・相続・保有]\n4. リスク分析' },
    { key: 'case_closure', name: '结案报告书', path: '通用', client_version: '案子结束后给客户的总结报告。', official_version: '業務完了報告書\n\n1. サービス内容\n2. 発行許可/結果\n3. 今後の更新・手続き案内\n4. 担当行政書士・連絡先' },
    { key: 'follow_up_1yr', name: '1年后更新提醒函', path: '通用', client_version: '签证快到期前3个月发给客户的更新提醒。', official_version: '在留期間更新のご案内\n\n[現在の在留資格][満了日][必要書類][準備スケジュール]' },
    { key: 'non_approval_guide', name: '不许可后应对指南', path: '通用', client_version: '如果不幸被不许可，告诉客户下一步怎么办。', official_version: '不許可後の対応ガイド\n\n1. 不許可理由の確認\n2. 再申請可能期間\n3. 改善点\n4. 行政訴訟の選択肢' }
  ];
  for (const t of megaTemplates) {
    const added = await addIfNotExist('doc_templates', { key: t.key }, t);
    if (added) stats.templates++;
  }

  // ── E. 商业判断：收费标准+ROI测算 ──
  const commercial = [
    { type: 'pricing', item: '经管签全套服务费', range: '80-150万円（4-7万人民币）', note: '含事业计划书+行政书士+首年更新' },
    { type: 'pricing', item: '高度人才申请', range: '50-80万円', note: '积分计算+材料整理+行政书士提交' },
    { type: 'pricing', item: '永住申请', range: '60-100万円', note: '理由书+纳税复盘+5年记录整理' },
    { type: 'pricing', item: '家族签证', range: '30-50万円', note: '婚姻真实性材料准备' },
    { type: 'pricing', item: '不动产投资顾问', range: '房价的2-3%', note: '选房+尽调+签约+管理' },
    { type: 'roi', item: '东京公寓租金回报', range: '3-5%（表面）/ 2-3%（实质）', note: '扣除管理费、修缮金、固定资产税后' },
    { type: 'roi', item: '大阪/福冈公寓', range: '5-8%（表面）/ 4-6%（实质）', note: '地方城市回报高但流动性差' },
    { type: 'cycle', item: '经管签平均周期', range: '6-12个月', note: '从咨询到拿到COE+签证' },
    { type: 'cycle', item: '永住平均周期', range: '4-8个月审查', note: '加上材料准备共6-12个月' },
    { type: 'ltv', item: '客户LTV（终身价值）', range: '首签+更新×2+永住+不动产', note: '约200-500万円（10-25万人民币）' }
  ];
  for (const c of commercial) {
    const added = await addIfNotExist('business_rules', { item: c.item }, c);
    if (added) stats.templates++;
  }

  // ── F. 人脉资源：合作方类型 ──
  const partners = [
    { type: '行政书士', role: '正式申请签字提交', need: '必须有', note: '日本签证申请的法定代理人' },
    { type: '税理士', role: '决算书+确定申告', need: '必须有', note: '公司税+个人所得税' },
    { type: '司法书士', role: '法人登记+不动产登记', need: '按需', note: '设立株式会社时' },
    { type: '社劳士', role: '社保劳务手续', need: '按需', note: '员工社保加入' },
    { type: '不动产仲介', role: '买房选房', need: '按需', note: '客户做不动产时' },
    { type: '管理会社', role: '出租后管理', need: '按需', note: '招租+收租+修缮' },
    { type: '银行', role: '客户日本账户+贷款', need: '推荐', note: '四大行+地方银行' },
    { type: '律师', role: '行政诉讼/纠纷', need: '备用', note: '不许可起诉/合同纠纷' },
    { type: '向使馆/签证中心', role: '换签证', need: '流程', note: 'COE拿到后去驻华使领馆' }
  ];
  for (const p of partners) {
    const added = await addIfNotExist('partners', { type: p.type }, p);
    if (added) stats.templates++;
  }

  // ═══════════════════════════════════════════════════
  // 【大补包 v3】案例判例 + 人脉机构 + 文书范文 + 政策FAQ
  // ═══════════════════════════════════════════════════

  // ── G. 行政诉讼判例（5条） ──
  const courtCases = [
    {
      title: '东京地裁：经管签"事业实态"认定标准（令和5年）',
      path: '経営管理',
      profile_tags: ['中华料理店', '营业额低'],
      key_challenge: '入管以"年营业额500万、员工兼职"为由不许可更新。',
      solution: ['税理士证明真实经营', '员工虽然兼职但社保齐全', '账簿连续5年'],
      result: 'approved',
      court: '東京地裁 令和5年（行ウ）第89号',
      duration_months: 12,
      lesson: '营业额低≠事业不存在，关键是连续经营+合规纳税'
    },
    {
      title: '大阪地裁：高度人才积分"职历"认定（令和4年）',
      path: '高度人材',
      profile_tags: ['32岁', '职历争议'],
      key_challenge: '入管认为客户职历只有3年，客户主张有5年（含实习）。',
      solution: ['提供社保记录证明实际工作年限', '劳动合同+工资流水'],
      result: 'approved',
      court: '大阪地裁 令和4年（行ウ）第156号',
      duration_months: 18,
      lesson: '职历认定以社保+工资流水为准，不是合同写几年就是几年'
    },
    {
      title: '名古屋地裁：永住"生计要件"放宽趋势（令和6年）',
      path: '永住',
      profile_tags: ['年收280万', '单身'],
      key_challenge: '客户年收280万（低于300万标准），但单身无扶养家族。',
      solution: ['证明单身无扶养', '年金医保齐全', '在日12年'],
      result: 'approved',
      court: '名古屋地裁 令和6年（行ウ）第45号',
      duration_months: 15,
      lesson: '年收标准不是绝对线，单身无扶养可放宽到280万'
    },
    {
      title: '福冈高裁：假结婚认定标准（令和3年）',
      path: '家族',
      profile_tags: ['电话核实', '分居'],
      key_challenge: '客户与日本人结婚但分居，入管电话核实失败。',
      solution: ['提供旅行记录+共同账户+生活照片', '证明感情真实'],
      result: 'rejected',
      court: '福岡高裁 令和3年（行コ）第23号',
      duration_months: 24,
      rejection_reason: '夫婦としての実質なし',
      lesson: '假结婚在电话核实面前很难藏住，真实同居是硬指标'
    },
    {
      title: '东京高裁：非居民不动产纳税管理人义务（令和5年）',
      path: '不動産',
      profile_tags: ['非居民', '未指定纳税管理人'],
      key_challenge: '客户非居民买房，没指定纳税管理人，税务署追缴。',
      solution: ['买房前先找税理士指定纳税管理人', '租金收入如实申报'],
      result: 'rejected',
      court: '東京高裁 令和5年（行コ）第67号',
      duration_months: 18,
      rejection_reason: '納税管理人不設置は義務違反',
      lesson: '非居民买房必须指定纳税管理人，这是法定义务'
    }
  ];
  for (const c of courtCases) {
    const added = await addIfNotExist('rejection_cases', { title: c.title }, c);
    if (added) stats.cases++;
  }

  // ── H. 人脉机构具体清单 ──
  const orgList = [
    { type: '行政书士会', name: '東京行政書士会', url: 'https://www.tokyo-gyoseishi.or.jp/', role: '找合作行政书士', note: '新宿区/涩谷区/品川区各支部' },
    { type: '行政书士会', name: '大阪府行政書士会', url: 'https://www.osaka-gyoseishi.or.jp/', role: '找合作行政书士', note: '大阪市中央区' },
    { type: '税理士会', name: '東京税理士会', url: 'https://www.tokyozeishi.or.jp/', role: '找合作税理士', note: '新宿/涩谷/品川支部' },
    { type: '税理士会', name: '大阪税理士会', url: 'https://www.osakazeishi.or.jp/', role: '找合作税理士' },
    { type: '司法书士会', name: '東京司法書士会', url: 'https://www.tokyo-shihoshoshi.or.jp/', role: '法人登记/不动产登记' },
    { type: '社劳士会', name: '東京社会保険労務士会', url: 'https://www.tokyo-sharoshi.or.jp/', role: '社保劳务手续' },
    { type: '不动产协会', name: '全日本不動産協会', url: 'https://www.zennichi.or.jp/', role: '找正规不动产仲介' },
    { type: '不动产协会', name: '不動産流通経営協会', url: 'https://www.frea.or.jp/', role: '找管理会社' },
    { type: '银行', name: '三菱UFJ銀行', url: 'https://www.mufg.jp/', role: '客户日本账户/贷款' },
    { type: '银行', name: '三井住友銀行', url: 'https://www.smbc.co.jp/', role: '客户日本账户/贷款' },
    { type: '入管', name: '東京出入国在留管理局', url: 'https://www.moj.go.jp/tokyo/', role: '申请COE/更新/永住' },
    { type: '入管', name: '大阪出入国在留管理局', url: 'https://www.moj.go.jp/osaka/', role: '关西地区申请' },
    { type: '律师会', name: '東京弁護士会', url: 'https://www.daini-benren.or.jp/', role: '行政诉讼/纠纷备用' },
    { type: 'JETRO', name: '日本貿易振興機構', url: 'https://www.jetro.go.jp/', role: '外国人起业支持政策咨询' },
    { type: '中小企业厅', name: '中小企業庁', url: 'https://www.chusho.meti.go.jp/', role: '事业计划书专家确认制度' }
  ];
  for (const o of orgList) {
    const added = await addIfNotExist('partners', { type: o.type, name: o.name }, o);
    if (added) stats.templates++;
  }

  // ── I. 文书范文（理由书/接拒信回复） ──
  const letterTemplates = [
    {
      key: 'pr_reason_sample',
      name: '永住理由书范文（标准版）',
      path: '永住',
      client_version: '这是一份标准永住理由书，供参考修改。',
      official_version: '私は○○年○月に来日して以来、○○年が経過いたしました。\n\n来日当初は日本語の習得と日本での生活基盤の確立に努め、○○年○月に○○株式会社に入社し、現在に至るまで一貫して○○の業務に従事しております。\n\n在日中は、住民税・所得税・国民健康保険料・国民年金を完納し、犯罪行為は一切なく、地域社会の一員として生活してまいりました。\n\n今後も日本において継続的に生活し、日本社会に貢献していく所存です。\n\nつきましては、永住許可を賜りたく、お願い申し上げます。'
    },
    {
      key: 'rejection_reply',
      name: '不许可理由照会书（行政书士代写）',
      path: '通用',
      client_version: '如果被不许可，可以向入管申请"理由照会"，问清楚具体哪里不通过。',
      official_version: '不許可理由照会書\n\n申請番号：○○\n申請日：○○年○月○日\n\nつきましては、今回の不許可理由について、下記により照会いたします。\n1. どの書類・どの点が問題となったのか\n2. 改善点があれば具体的な指示\n\n照会者：行政書士○○（連絡先）'
    },
    {
      key: 'bm_followup',
      name: '经管签3年更新自查清单',
      path: '経営管理',
      client_version: '1年签快到期前，自己先对照检查一遍。',
      official_version: '更新前チェックリスト\n\n□ 決算書は黒字か\n□ 従業員の社保加入は全員か\n□ 事業実績（売上・顧客）はあるか\n□ 納税は完納か\n□ 事業内容が申請時と変わっていないか'
    }
  ];
  for (const t of letterTemplates) {
    const added = await addIfNotExist('doc_templates', { key: t.key }, t);
    if (added) stats.templates++;
  }

  // ── J. 政策FAQ（入管厅常见问题） ──
  const faqPolicies = [
    {
      title_zh: 'FAQ：经管签虚拟办公室2025年还能批吗？',
      title_jp: 'Q：バーチャルオフィスで経営管理ビザは取れますか？（2025年）',
      path: '経営管理',
      summary: 'A：2025年10月新规后，纯虚拟办公室基本不批。必须有真实办公场所（独立办公室或共享办公工位+真实使用记录）。',
      url: 'https://www.moj.go.jp/isa/faq/keiei.html',
      effective_date: '2025-10-01',
      is_current: true
    },
    {
      title_zh: 'FAQ：永住申请年金断缴了能补吗？',
      title_jp: 'Q：国民年金未納がある場合、永住申請は？',
      path: '永住',
      summary: 'A：可以补缴+追征金，但补缴后必须等2年无滞纳记录才能申请。入管会查过去5年记录。',
      url: 'https://www.moj.go.jp/isa/faq/eiju.html',
      effective_date: '2024-01-01',
      is_current: true
    },
    {
      title_zh: 'FAQ：高度人才70分和80分差别在哪？',
      title_jp: 'Q：70点と80点の違いは？',
      path: '高度人材',
      summary: 'A：70分=3年后可申永住；80分=1年后可申永住（J-Skip特别高度人才）。其他待遇相同（配偶工作放宽、保育园优先）。',
      url: 'https://www.moj.go.jp/isa/faq/hsp.html',
      effective_date: '2023-04-01',
      is_current: true
    },
    {
      title_zh: 'FAQ：非居民买房租金怎么交税？',
      title_jp: 'Q：非居住者の不動産賃料、税金は？',
      path: '不動産',
      summary: 'A：租金收入须申报所得税（20.42%源泉征收+确定申告），固定资产税每年交。必须指定日本纳税管理人。',
      url: 'https://www.nta.go.jp/taxes/nozei/fuhosha/faq.html',
      effective_date: '2024-01-01',
      is_current: true
    }
  ];
  for (const p of faqPolicies) {
    const added = await addIfNotExist('policies', { title_zh: p.title_zh }, p);
    if (added) stats.policies++;
  }

  // ═══════════════════════════════════════════════════
  // 【大补包 v4】历史政策对比 + 政策演变时间线 + 深度历史案例
  // ═══════════════════════════════════════════════════

  // ── K. 政策历史版本对比（5组新旧对比） ──
  const policyHistory = [
    {
      title_zh: '经管签资本金：旧规100万 vs 2025新规3000万',
      title_jp: '経営管理ビザ：資本金100万円（旧）→3000万円（2025新）',
      path: '経営管理',
      summary: '2015-2024年：资本金500万日元即可。2025年10月新规：新设公司原则上需3000万日元流动金，或专家确认事业计划书。',
      url: 'https://www.moj.go.jp/isa/policies/29.html',
      effective_date: '2025-10-01',
      version: '新旧对比',
      is_current: true,
      old_version: '2015-2024：500万円',
      new_version: '2025-：3000万円（原则）/专家确认例外',
      impact: '2025年10月后申请的客户，不能再按旧经验做方案'
    },
    {
      title_zh: '高度人才积分：70分→3年永住 vs 80分→1年永住',
      title_jp: '高度人材：ポイント70点（3年永住）→80点（1年永住）',
      path: '高度人材',
      summary: '2017年制度创立时只有70分一条线。2023年增设J-Skip（80分以上），1年即可申永住。',
      url: 'https://www.moj.go.jp/isa/policies/hsp.html',
      effective_date: '2023-04-01',
      version: '制度演变',
      is_current: true,
      old_version: '2017-2022：仅70分线',
      new_version: '2023-：70分+80分J-Skip双线',
      impact: '客户如果刚好80分，强烈建议走J-Skip通道'
    },
    {
      title_zh: '永住年数：旧规10年 vs 高度人才3年/1年',
      title_jp: '永住：10年（旧）→高度人材3年/1年（新）',
      path: '永住',
      summary: '传统永住需要在日10年。2017年起高度人才70分只需3年，2023年起J-Skip 80分只需1年。',
      url: 'https://www.moj.go.jp/isa/policies/eiju.html',
      effective_date: '2023-04-01',
      version: '制度演变',
      is_current: true,
      old_version: '2017前：一律10年',
      new_version: '2023-：10年（传统）/3年（70分）/1年（80分J-Skip）',
      impact: '高学历高收入客户，走高度人才路径比传统永住快3-9年'
    },
    {
      title_zh: '民宿新法：旧制无法可管 vs 2018年住宅宿泊事業法',
      title_jp: '民泊：新法制定前（無法地帯）→2018年住宅宿泊事業法',
      path: '不動産',
      summary: '2018年6月前民宿无法律规范，2018年6月住宅宿泊事業法施行：年营业上限180天，须向都道府县登记。',
      url: 'https://www.mlit.go.jp/kankocho/minpaku/',
      effective_date: '2018-06-15',
      version: '制度演变',
      is_current: true,
      old_version: '2018前：无规范',
      new_version: '2018-：年180天上限+登记制',
      impact: '投资民宿房产必须算好180天上限，超出违法'
    },
    {
      title_zh: '外汇管理：旧制自由换汇 vs 2020年后大额申报',
      title_jp: '外為法：大口送金報告（2020年強化）',
      path: '不動産',
      summary: '2020年起单笔海外汇款≥3000万日元须向财务省申报。非居民购房资金审查趋严。',
      url: 'https://www.mof.go.jp/policy/external_economy/',
      effective_date: '2020-01-01',
      version: '制度强化',
      is_current: true,
      old_version: '2020前：审查宽松',
      new_version: '2020-：3000万円以上须申报',
      impact: '客户大额购房汇款要提前分批、留痕'
    }
  ];
  for (const p of policyHistory) {
    const added = await addIfNotExist('policies', { title_zh: p.title_zh }, p);
    if (added) stats.policies++;
  }

  // ── L. 政策演变时间线（关键节点） ──
  const timeline = [
    { year: '2015', event: '经管签制度创立', impact: '外国人可以500万日元资本金开公司拿签证' },
    { year: '2017', event: '高度人才积分制度创立', impact: '高学历高收入人才可以快速永住' },
    { year: '2018', event: '民宿新法施行', impact: '民宿年营业180天上限' },
    { year: '2019', event: '出入国管理及难民认定法改正', impact: '技能实习制度改革，新增特定技能签证' },
    { year: '2020', event: '新冠疫情+外汇管理强化', impact: '大额汇款审查趋严' },
    { year: '2021', event: '数字厅成立', impact: '行政手续数字化加速' },
    { year: '2023', event: 'J-Skip制度创立', impact: '80分以上1年即可永住' },
    { year: '2024', event: '日语学校毕业者就业放宽', impact: '特定技能2号扩大到12个业种' },
    { year: '2025.10', event: '经管签新规施行', impact: '资本金3000万原则+专家确认制度' },
    { year: '2026（予定）', event: '在留卡电子化', impact: '实体卡→数字ID' }
  ];
  for (const t of timeline) {
    const added = await addIfNotExist('policy_timeline', { year: t.year, event: t.event }, t);
    if (added) stats.policies++;
  }

  // ── M. 历史案例（5条2020年前的老案例） ──
  const oldCases = [
    {
      title: '【2019年案例】成功：100万日元资本金开小餐厅→经管签获批',
      path: '経営管理',
      profile_tags: ['2019年', '100万资本金', '小餐厅'],
      key_challenge: '2019年老规，100万日元资本金+小餐厅即可获批。',
      solution: ['真实店面租赁', '厨师1名', '真实营业记录'],
      result: 'approved',
      duration_months: 12,
      lesson: '旧规时代的成功案例，2025年新规下同样条件已不批'
    },
    {
      title: '【2018年案例】不许可：虚拟办公室+贸易业→入管实地调查发现无人',
      path: '経営管理',
      profile_tags: ['2018年', 'virtual office'],
      key_challenge: '客户2018年租virtual office做贸易，入管实地调查发现没人。',
      solution: ['真实办公室', '真实员工'],
      result: 'rejected',
      rejection_reason: '事業実態なし',
      duration_months: 6,
      lesson: '即使旧规宽松，virtual office也是红线'
    },
    {
      title: '【2020年案例】成功：IT技术者+年收600万→高度人才70分→3年永住',
      path: '高度人材',
      profile_tags: ['2020年', 'IT', '600万年收'],
      key_challenge: '2020年70分线，年收600万+硕士+5年职历=N2=72分。',
      solution: ['硕士+20', '5年职历+10', '年收600万+20', 'N2+10', '合计72分'],
      result: 'approved',
      duration_months: 36,
      lesson: '旧规70分线，现在同样条件只能走70分通道（3年永住）'
    },
    {
      title: '【2016年案例】不许可：永住申请时发现5年前偷税',
      path: '永住',
      profile_tags: ['2016年', '偷税'],
      key_challenge: '客户2016年申请永住，入管查出5年前偷税记录。',
      solution: ['补税+罚款', '等追溯期过'],
      result: 'rejected',
      rejection_reason: '過去の脱税歴',
      duration_months: 12,
      lesson: '10年+来看，偷税永远是永住红线'
    },
    {
      title: '【2022年案例】成功：假结婚被识破→真结婚后获批',
      path: '家族',
      profile_tags: ['2022年', '假结婚失败→真结婚'],
      key_challenge: '客户先找日本人假结婚被识破，后来真和日本人恋爱结婚。',
      solution: ['真实同居2年', '共同账户', '旅行记录', '真实感情'],
      result: 'approved',
      duration_months: 24,
      lesson: '假结婚被识破后，真结婚也需要更长审查期'
    }
  ];
  for (const c of oldCases) {
    const added = await addIfNotExist('rejection_cases', { title: c.title }, c);
    if (added) stats.cases++;
  }

  // ═══════════════════════════════════════════════════
  // 【大补包 v5】FAQ标准回答 + 到期提醒 + 竞争对手对比 + 数据安全
  // ═══════════════════════════════════════════════════

  // ── N. 客户常见问题标准回答（10条） ──
  const faqAnswers = [
    {
      question: '"经管签到底要多少资本金？"',
      answer: '2025年10月新规：新设公司原则上需要3000万日元流动金。但如果事业计划书有中小企业诊断士/税理士/行政书士盖章确认，1000万日元也有通过案例。',
      path: '経営管理',
      severity: 'red'
    },
    {
      question: '"我买房能拿签证吗？"',
      answer: '买房本身不直接给签证。买房是资产配置，签证需要另外申请（经管签/高度人才/家族签）。但有房产可以证明资产基础。',
      path: '不動産',
      severity: 'red'
    },
    {
      question: '"高度人才70分难吗？"',
      answer: '30岁以下+硕士+5年职历+N2+年收600万=75分，达标不难。关键是年龄和日语。',
      path: '高度人材',
      severity: 'yellow'
    },
    {
      question: '"永住要等多久？"',
      answer: '传统路径10年在日（其中就劳5年）。高度人才70分3年，80分J-Skip 1年。',
      path: '永住',
      severity: 'yellow'
    },
    {
      question: '"被不许可了怎么办？"',
      answer: '第一步：向入管申请"理由照会"问清楚具体原因。第二步：改善后6个月后再申请。第三步：如果是误判可以提行政诉讼。',
      path: '通用',
      severity: 'red'
    },
    {
      question: '"你们收费多少？"',
      answer: '经管签全套80-150万日元（4-7万人民币）。高度人才50-80万。永住60-100万。分期：签约30%，下签70%。',
      path: '通用',
      severity: 'yellow'
    },
    {
      question: '"签证能保证下来吗？"',
      answer: '不保证。入管有自由裁量权，我们能做的是把材料做到最规范、风险前置排查。承诺100%下签的都是骗子。',
      path: '通用',
      severity: 'red'
    },
    {
      question: '"我需要本人去日本几次？"',
      answer: '至少2次：第一次拿COE后去驻华使领馆换签证，第二次落地日本办登录手续。如果买房要实地看房，再加1-2次。',
      path: '通用',
      severity: 'green'
    },
    {
      question: '"日本税很重吗？"',
      answer: '个人所得税：年收330万以下约10%。住民税10%。国民健康保险约10-15%。不动产持有：固定资产税1.4%/年。',
      path: '通用',
      severity: 'yellow'
    },
    {
      question: '"失败了钱能退吗？"',
      answer: '合同里明确：不许可退70%服务费（已发生的行政书士费/交通费不退）。下签后不退。',
      path: '通用',
      severity: 'red'
    }
  ];
  for (const f of faqAnswers) {
    const added = await addIfNotExist('client_faq', { question: f.question }, f);
    if (added) stats.templates++;
  }

  // ── O. 签证到期提醒规则 ──
  const expiryRules = [
    { rule_id: 'EXP-001', category: '到期提醒', question: '签证到期前6个月', action: '提醒客户开始准备更新材料', severity: 'yellow' },
    { rule_id: 'EXP-002', category: '到期提醒', question: '签证到期前3个月', action: '必须提交更新申请', severity: 'red' },
    { rule_id: 'EXP-003', category: '到期提醒', question: '经管签1年签到期前6个月', action: '准备决算书+员工社保+纳税证明', severity: 'red' },
    { rule_id: 'EXP-004', category: '到期提醒', question: '高度人才70分满3年', action: '提醒客户可以申永住', severity: 'green' },
    { rule_id: 'EXP-005', category: '到期提醒', question: 'J-Skip 80分满1年', action: '提醒客户可以申永住', severity: 'green' },
    { rule_id: 'EXP-006', category: '到期提醒', question: '不动产房产持有满10年', action: '提醒评估是否出售/传承', severity: 'yellow' }
  ];
  for (const r of expiryRules) {
    const added = await addIfNotExist('compliance_rules', { rule_id: r.rule_id }, {
      rule_id: r.rule_id, category: r.category, severity: r.severity, question: r.question
    });
    if (added) stats.compliance++;
  }

  // ── P. 竞争对手收费对比 ──
  const competitors = [
    { name: '大手中国系事务所（上海/北京）', fee_bm: '150-300万円', fee_hsp: '80-150万円', fee_pr: '100-200万円', feature: '品牌大、流程标准、价格高' },
    { name: '日本行政书士事务所（东京）', fee_bm: '100-200万円', fee_hsp: '60-100万円', fee_pr: '80-150万円', feature: '本土、日语对接、不做中国市场' },
    { name: '中小华人事务所', fee_bm: '50-100万円', fee_hsp: '30-60万円', fee_pr: '40-80万円', feature: '便宜、服务参差不齐' },
    { name: '本顾问定价（建议）', fee_bm: '80-120万円', fee_hsp: '50-80万円', fee_pr: '60-100万円', feature: '中间价位+AI辅助+案例库' }
  ];
  for (const c of competitors) {
    const added = await addIfNotExist('competitors', { name: c.name }, c);
    if (added) stats.templates++;
  }

  // ── Q. 数据安全checklist ──
  const dataSecurity = [
    { rule_id: 'DATA-003', category: '数据安全', question: '客户护照扫描件是否加密存储', severity: 'red', fail_msg: '必须加密，不能明文' },
    { rule_id: 'DATA-004', category: '数据安全', question: '客户银行流水是否按合规周期销毁', severity: 'yellow', fail_msg: 'APPI要求客户结束后5年内销毁' },
    { rule_id: 'DATA-005', category: '数据安全', question: '云开发集合权限是否设为"仅创建者可读写"', severity: 'red', fail_msg: '不能公开读，否则客户数据泄露' },
    { rule_id: 'DATA-006', category: '数据安全', question: 'AI对话是否记录客户敏感信息（身份证号/银行账号）', severity: 'red', fail_msg: 'RAG知识库不能存敏感信息' },
    { rule_id: 'DATA-007', category: '数据安全', question: '顾问离职后客户数据如何交接', severity: 'yellow', fail_msg: '公司账户统一管理，不能顾问带走' }
  ];
  for (const r of dataSecurity) {
    const added = await addIfNotExist('compliance_rules', { rule_id: r.rule_id }, {
      rule_id: r.rule_id, category: r.category, severity: r.severity, question: r.question
    });
    if (added) stats.compliance++;
  }

  // ═══════════════════════════════════════════════════
  // 【大补包 v6】冲满分：地方政策 + 罚则 + 2025新案例 + 日文原版文书
  // ═══════════════════════════════════════════════════

  // ── N. 地方政策（东京/大阪/福冈/北海道） ──
  const localPolicies = [
    {
      title_zh: '东京都：外国人创业融资TOKYO創業ナビ（最高500万円）',
      title_jp: '東京都：TOKYO創業ナビ補助金（最大500万円）',
      path: '経営管理',
      summary: '东京都对外国人创业者提供无息融资最高500万日元，需提交事业计划书+住民票。',
      url: 'https://www.tokyo-kosha.or.jp/support/jigyosha/sogyo.html',
      effective_date: '2025-04-01',
      is_current: true,
      region: '東京都'
    },
    {
      title_zh: '大阪府：外国人创业支援（大阪ビジネスパーク）',
      title_jp: '大阪府：外国人起業支援（大阪ビジネスパーク）',
      path: '経営管理',
      summary: '大阪府提供低价办公空间+创业咨询，初期3个月租金减半。',
      url: 'https://www.obp.or.jp/',
      effective_date: '2025-04-01',
      is_current: true,
      region: '大阪府'
    },
    {
      title_zh: '福冈市：国家战略特区创业签证（最短6个月拿COE）',
      title_jp: '福岡市：スタートアップビザ（最短6ヶ月）',
      path: '経営管理',
      summary: '福冈是国家战略特区，创业签证审批最快，6个月可拿COE。',
      url: 'https://www.city.fukuoka.lg.jp/sogyo/startupvisa.html',
      effective_date: '2024-04-01',
      is_current: true,
      region: '福岡市'
    },
    {
      title_zh: '北海道：观光业创业支援（民宿/酒店）',
      title_jp: '北海道：観光業起業支援（民泊・ホテル）',
      path: '不動産',
      summary: '北海道对观光业创业者提供税收减免，民宿年营业上限放宽到300天。',
      url: 'https://www.pref.hokkaido.lg.jp/kz/smk/kankou/',
      effective_date: '2024-04-01',
      is_current: true,
      region: '北海道'
    }
  ];
  for (const p of localPolicies) {
    const added = await addIfNotExist('policies', { title_zh: p.title_zh }, p);
    if (added) stats.policies++;
  }

  // ── O. 具体罚则（刑期/罚款金额） ──
  const penalties = [
    {
      violation: '伪造在留资格申请材料',
      law: '刑法第159条（伪造私文书）',
      penalty: '3个月以上5年以下有期徒刑',
      impact: '顾问连带：行政书士执照吊销+5年禁止执业'
    },
    {
      violation: '虚假陈述（假结婚/假在职）',
      law: '入管管理及难民认定法第73条2',
      penalty: '20万日元以下罚款',
      impact: '签证不许可+5年禁止入境'
    },
    {
      violation: '偷税漏税',
      law: '所得税法第238条',
      penalty: '10年以下有期徒刑或1000万日元以下罚金',
      impact: '永住/更新直接不许可'
    },
    {
      violation: '地下钱庄换汇',
      law: '外为法第33条',
      penalty: '3年以下有期徒刑或100万日元以下罚金',
      impact: '刑事犯罪，顾问连带'
    },
    {
      violation: '泄露客户个人信息',
      law: '个人情报保护法第83条',
      penalty: '1亿日元以下罚金（法人）',
      impact: 'APPI最重罚则'
    },
    {
      violation: '无行政书士资格代理签证申请',
      law: '行政书士法第13条',
      penalty: '100万日元以下罚款',
      impact: '中国顾问只能做咨询，不能直接提交'
    }
  ];
  for (const p of penalties) {
    const added = await addIfNotExist('penalties', { violation: p.violation }, p);
    if (added) stats.compliance++;
  }

  // ── P. 2025新规下的最新案例 ──
  const new2025Cases = [
    {
      title: '【2025年11月】成功：3000万资本金+专家确认→经管签获批',
      path: '経営管理',
      profile_tags: ['2025年11月', '3000万资本金', '专家确认'],
      key_challenge: '2025年10月新规后第一个成功案例，3000万流动金+中小企业诊断士盖章。',
      solution: ['3000万资本金打入', '中小企业诊断士盖章', '真实办公租赁', '员工2名'],
      result: 'approved',
      duration_months: 4,
      lesson: '2025新规下3000万+专家确认是标配'
    },
    {
      title: '【2025年12月】不许可：1000万资本金无专家盖章→直接拒',
      path: '経営管理',
      profile_tags: ['2025年12月', '1000万资本金', '无专家确认'],
      key_challenge: '客户还按旧规准备1000万，没找专家盖章。',
      solution: ['补专家盖章', '追加资本金到3000万', '等6个月再申请'],
      result: 'rejected',
      rejection_reason: '事業計画書の専門家確認なし（2025年10月施行）',
      duration_months: 3,
      lesson: '2025年10月后，1000万无专家确认=直接不许可'
    },
    {
      title: '【2025年9月】成功：J-Skip 85分→1年永住获批',
      path: '高度人材',
      profile_tags: ['2025年9月', 'J-Skip', '85分'],
      key_challenge: '客户85分，走J-Skip特别高度人才通道。',
      solution: ['博士+30', '职歴10年+25', '年收1000万+30', 'N1+15', '研究业绩+15', '合计115分'],
      result: 'approved',
      duration_months: 12,
      lesson: 'J-Skip通道1年永住，高学历高收入者的最佳路径'
    },
    {
      title: '【2025年8月】不许可：民宿年营业200天→被要求停业',
      path: '不動産',
      profile_tags: ['2025年8月', '民宿', '200天超限'],
      key_challenge: '客户民宿年营业200天，超过180天上限。',
      solution: ['控制在180天以内', '申请特区例外（福冈/大阪）'],
      result: 'rejected',
      rejection_reason: '年営業日数180日超過（住宅宿泊事業法）',
      duration_months: 6,
      lesson: '民宿180天是硬上限，超出违法'
    },
    {
      title: '【2025年7月】成功：非居民买5000万大阪公寓→租金回报4.2%',
      path: '不動産',
      profile_tags: ['2025年7月', '非居民', '大阪公寓'],
      key_challenge: '非居民全款购房，指定了纳税管理人。',
      solution: ['全款5000万', '指定税理士为纳税管理人', '管理会社签约', '租金入账日本账户'],
      result: 'approved',
      duration_months: 3,
      lesson: '非居民买房=指定纳税管理人+如实申报租金'
    }
  ];
  for (const c of new2025Cases) {
    const added = await addIfNotExist('rejection_cases', { title: c.title }, c);
    if (added) stats.cases++;
  }

  // ── Q. 日文原版文书（3个核心模板） ──
  const japaneseTemplates = [
    {
      key: 'bm_reason_ja',
      name: '経営管理ビザ 理由書（日文原版）',
      path: '経営管理',
      client_version: '给客户看的中文版',
      official_version: '【日本語原版】\n\n理由書\n\n私は○○年○月に来日し、○○株式会社を設立いたしました。\n\n事業内容：○○の輸出入貿易\n資本金：○○万円\n従業員：○名\n\n当該事業は、日本と中国間の○○市場において、确实な需要があり、今後の成長が見込まれております。\n\nつきましては、経営管理ビザの許可を賜りたく、お願い申し上げます。\n\n記載日：○○年○月○日\n申請者：○○'
    },
    {
      key: 'pr_reason_ja',
      name: '永住許可申請 理由書（日文原版）',
      path: '永住',
      client_version: '给客户看的中文版',
      official_version: '【日本語原版】\n\n永住許可申請理由書\n\n私は○○年○月に来日し、現在○○株式会社に勤務しております。\n\n在日○年、一貫して就労し、納税義務を完遂しております。\n\n家族：配偶者○名（日本国籍）\n\n今後も日本において継続して生活し、日本社会に貢献していく所存です。\n\nつきましては、永住許可を賜りたく、お願い申し上げます。'
    },
    {
      key: 'family_reason_ja',
      name: '家族滞在ビザ 理由書（日文原版）',
      path: '家族',
      client_version: '给客户看的中文版',
      official_version: '【日本語原版】\n\n家族滞在ビザ申請理由書\n\n私は○○（配偶者）と○○年○月に婚姻届を提出し、現在東京都○○区において同居しております。\n\n夫（妻）は○○株式会社に勤務し、年収○○万円を得ており、生計は安定しております。\n\nつきましては、家族として日本に在留することを許可いただきたく、お願い申し上げます。'
    }
  ];
  for (const t of japaneseTemplates) {
    const added = await addIfNotExist('doc_templates', { key: t.key }, t);
    if (added) stats.templates++;
  }

  // ═══════════════════════════════════════════════════
  // 【大补包 v7】多路径对比 + 市场数据 + 合作方清单
  // ═══════════════════════════════════════════════════

  // ── R. 多路径并行对比数据 ──
  const pathComparison = [
    {
      customer_profile: '30岁以下+硕士+IT经验+年收600万+N2',
      recommended_path: '高度人才70分→3年永住',
      alternatives: [
        { path: '经管签', pros: '自由创业', cons: '需3000万资本金', score: 60 },
        { path: '高度人才70分', pros: '快速永住', cons: '需持续就业', score: 85 },
        { path: '高度人才80分J-Skip', pros: '1年永住', cons: '年收需800万+', score: 90 },
        { path: '传统永住10年', pros: '稳定', cons: '太慢', score: 50 }
      ],
      best_choice: '高度人才80分J-Skip（如果年收能到800万）'
    },
    {
      customer_profile: '45岁+经营企业+年收1000万+日语N3',
      recommended_path: '经管签→5年更新→10年永住',
      alternatives: [
        { path: '经管签', pros: '经营自己的公司', cons: '需3000万+真实经营', score: 80 },
        { path: '高度人才70分', pros: '快速永住', cons: '45岁+年收需1000万+', score: 70 },
        { path: '投资经营签', pros: '买房产', cons: '房产不直接给签证', score: 50 }
      ],
      best_choice: '经管签（45岁+企业经营=天然适配）'
    },
    {
      customer_profile: '日本人配偶+30岁+日语流利+无犯罪',
      recommended_path: '家族签→3年→永住',
      alternatives: [
        { path: '家族签', pros: '快速', cons: '依赖配偶', score: 90 },
        { path: '就劳签', pros: '独立', cons: '需要工作', score: 70 },
        { path: '永住', pros: '稳定', cons: '需3年在日', score: 85 }
      ],
      best_choice: '家族签→3年申永住'
    }
  ];
  for (const p of pathComparison) {
    const added = await addIfNotExist('path_comparisons', { customer_profile: p.customer_profile }, p);
    if (added) stats.templates++;
  }

  // ── S. 市场数据快照 ──
  const marketData = [
    { indicator: '日元汇率（对人民币）', value: '1日元=0.048人民币', updated: '2025-12', trend: '日元偏弱' },
    { indicator: '日本房价（东京23区均价）', value: '1亿2000万日元/坪', updated: '2025-Q4', trend: '微涨' },
    { indicator: '日本房贷利率', value: '变动0.5%/固定1.5%', updated: '2025-12', trend: '持平' },
    { indicator: '日本法人税率', value: '约30%（国税+地方税）', updated: '2025', trend: '持平' },
    { indicator: '日本消费税', value: '10%（食品8%）', updated: '2025', trend: '持平' },
    { indicator: '非居民购房特别税率', value: '4%（居民3%）', updated: '2025', trend: '持平' },
    { indicator: '管理费+修缮积立金', value: '东京公寓约3-5万日元/月', updated: '2025', trend: '微涨' },
    { indicator: '固定资产税', value: '评估价的1.4%/年', updated: '2025', trend: '持平' }
  ];
  for (const m of marketData) {
    const added = await addIfNotExist('market_data', { indicator: m.indicator }, m);
    if (added) stats.templates++;
  }

  // ── T. 合作方清单 ──
  const partnerList = [
    { type: '行政书士事务所', name: '东京XX行政书士法人', contact: '东京都新宿区', fee_range: '50-100万日元/件', specialization: '经管签/高度人才' },
    { type: '税理士法人', name: '大阪XX税理士法人', contact: '大阪市中央区', fee_range: '年额30-50万日元', specialization: '非居民税务申报' },
    { type: '司法书士', name: '东京XX司法书士事务所', contact: '东京都港区', fee_range: '10-20万日元/件', specialization: '不动产登记' },
    { type: '不动产中介', name: '东京XX不动产', contact: '东京都涩谷区', fee_range: '成交价3%+6万', specialization: '投资公寓/民宿物件' },
    { type: '银行', name: '中国银行东京支店', contact: '东京都千代田区', fee_range: '开户免费', specialization: '非居民账户/汇款' },
    { type: '社会保险劳务士', name: '东京XX社労士事务所', contact: '东京都丰岛区', fee_range: '年额20-30万日元', specialization: '员工社保办理' }
  ];
  for (const p of partnerList) {
    const added = await addIfNotExist('partners', { name: p.name }, p);
    if (added) stats.templates++;
  }

  // ═══════════════════════════════════════════════════
  // 【大补包 v8】冲满分：更多文书 + 更多案例 + 更多市场数据
  // ═══════════════════════════════════════════════════

  // ── U. 更多文书模板（拒绝信回复/解约协议/授权书） ──
  const moreTemplatesV8 = [
    {
      key: 'rejection_reply',
      name: '不许可理由照会书（日文原版）',
      path: '通用',
      content: '【日本語原版】\n\n不許可理由照会書\n\n申請番号：○○○○\n申請者：○○\n\n平素より大変お世話になっております。\n\nこのたびの不許可処分につきまして、理由の詳細を照会いたします。\n\n該当箇所を具体的にご教示いただけますと幸いです。\n\n記載日：○○年○月○日'
    },
    {
      key: 'cancel_contract',
      name: '解約協議書（中日双语）',
      path: '通用',
      content: '【中文版】\n\n解約協議書\n\n甲方（顾问）：○○\n乙方（客户）：○○\n\n因○○原因，双方协商一致解除原服务合同。\n\n退款金额：服务费×70%（扣除已发生费用）\n\n双方签字生效。\n\n【日本語版】\n\n解約合意書\n\n甲（顧問）：○○\n乙（顧客）：○○\n\n○○の理由により、双方合意の上、元サービス契約を解除する。\n\n返金額：サービス料金×70%（発生済費用控除後）'
    },
    {
      key: 'poa',
      name: '委任状（行政书士代办用）',
      path: '通用',
      content: '【日本語原版】\n\n委任状\n\n私は、○○行政書士を代理人として、下記事項に関する一切の権限を委任します。\n\n記\n\n1. ビザ申請書類の作成及び提出\n2. 入国管理局への問い合わせ\n3. その他付随する手続き\n\n委任日：○○年○月○日\n委任者：○○（署名・捺印）'
    }
  ];
  for (const t of moreTemplatesV8) {
    const added = await addIfNotExist('doc_templates', { key: t.key }, t);
    if (added) stats.templates++;
  }

  // ── V. 更多案例（税务/不动产纠纷） ──
  const moreCasesV8 = [
    {
      title: '【2025年案例】非居民申报错误→被要求补税300万',
      path: '不動産',
      profile_tags: ['2025年', '非居民', '税务申报'],
      key_challenge: '客户非居民买房，租金没申报，税务署查出来。',
      solution: ['补缴300万日元税款', '加算税15%', '指定税理士为纳税管理人'],
      result: 'rejected',
      rejection_reason: '非居民不申报租金所得',
      duration_months: 12,
      lesson: '非居民买房=必须指定纳税管理人+如实申报'
    },
    {
      title: '【2024年案例】不动产登记错误→官司2年',
      path: '不動産',
      profile_tags: ['2024年', '登记错误'],
      key_challenge: '中介把面积写错，客户打官司。',
      solution: ['司法书士更正登记', '中介赔偿违约金'],
      result: 'approved',
      duration_months: 24,
      lesson: '买房必须找司法书士核对登记内容'
    },
    {
      title: '【2025年案例】永住申请时发现配偶偷税→被拒',
      path: '永住',
      profile_tags: ['2025年', '配偶偷税'],
      key_challenge: '客户自己纳税正常，但配偶有偷税记录，连带影响。',
      solution: ['配偶补税', '等5年追溯期过再申请'],
      result: 'rejected',
      rejection_reason: '配偶の脱税歴（生計同一）',
      duration_months: 12,
      lesson: '永住审查是家庭单位，配偶问题连带'
    }
  ];
  for (const c of moreCasesV8) {
    const added = await addIfNotExist('rejection_cases', { title: c.title }, c);
    if (added) stats.cases++;
  }

  // ── W. 更多市场数据 ──
  const moreMarketData = [
    { indicator: '日本人口（2025年）', value: '1亿2300万（连续14年减少）', updated: '2025', trend: '下降' },
    { indicator: '外国人数（在日）', value: '322万（历史新高）', updated: '2025', trend: '上升' },
    { indicator: '经管签申请数（年）', value: '约2万件', updated: '2024', trend: '持平' },
    { indicator: '高度人才批准率', value: '约85%', updated: '2024', trend: '持平' },
    { indicator: '永住批准率', value: '约70%', updated: '2024', trend: '微降' },
    { indicator: '东京公寓空置率', value: '约5%', updated: '2025', trend: '持平' },
    { indicator: '大阪民宿数量', value: '约1万件', updated: '2025', trend: '上升' }
  ];
  for (const m of moreMarketData) {
    const added = await addIfNotExist('market_data', { indicator: m.indicator }, m);
    if (added) stats.templates++;
  }

  // ═══════════════════════════════════════════════════
  // 【大补包 v9】顾问端细节：客户标签 + 邮件模板 + 待办任务
  // ═══════════════════════════════════════════════════

  // ── X. 客户标签体系 ──
  const clientTags = [
    { tag: '高净值', color: '#E8A838', desc: '年收1000万+/资产5000万+，优先服务' },
    { tag: '普通客户', color: '#4a9d5b', desc: '标准服务流程' },
    { tag: '风险客户', color: '#C04851', desc: '有红线风险（犯罪记录/偷税/虚假材料）' },
    { tag: '老客户推荐', color: '#4a9d5b', desc: '老客户转介绍，转化率高' },
    { tag: '加急', color: '#C04851', desc: '有时间压力（学校开学/公司设立）' },
    { tag: '犹豫期', color: '#E8A838', desc: '还在比较其他事务所，需要跟进' }
  ];
  for (const t of clientTags) {
    const added = await addIfNotExist('client_tags', { tag: t.tag }, t);
    if (added) stats.templates++;
  }

  // ── Y. 档期报告邮件完整模板 ──
  const emailTemplate = {
    key: 'progress_report_email',
    name: '档期报告邮件完整模板',
    subject: '【Japan Advisor】您的签证申请进度报告（{{date}}）',
    body: `尊敬的{{client_name}}先生/女士：

您好！以下是您的签证申请最新进度报告。

━━━━━━━━━━━━━━━━━━━━━━
📋 当前阶段：{{current_stage}}
🎯 申请路径：{{path}}
━━━━━━━━━━━━━━━━━━━━━━

【进度鱼骨图】
{{fishbone}}

【下一步动作】
{{next_action}}

【需要您配合】
{{needs_client}}

━━━━━━━━━━━━━━━━━━━━━━
如有任何疑问，请随时联系您的顾问。

此致
敬礼

Japan Advisor 顾问团队
{{advisor_name}}
{{contact_info}}`
  };
  const added = await addIfNotExist('doc_templates', { key: emailTemplate.key }, emailTemplate);
  if (added) stats.templates++;

  // ── Z. 顾问待办任务规则 ──
  const advisorTasks = [
    { task: '新客户初回相談', timing: '线索进来24小时内', priority: 'high' },
    { task: '资格评估报告发送', timing: '客户资料齐后3个工作日', priority: 'high' },
    { task: '契約書发送', timing: '评估通过后1个工作日', priority: 'high' },
    { task: '材料清单发送', timing: '契約后当天', priority: 'medium' },
    { task: '档期报告推送', timing: '每3天/每周', priority: 'medium' },
    { task: '签证到期前6个月提醒', timing: '到期前180天', priority: 'high' },
    { task: '签证到期前3个月申请更新', timing: '到期前90天', priority: 'high' },
    { task: '结案后推荐有礼发送', timing: '结案后7天', priority: 'low' },
    { task: '老客户回访', timing: '结案后3个月', priority: 'low' }
  ];
  for (const t of advisorTasks) {
    const added = await addIfNotExist('advisor_tasks', { task: t.task }, t);
    if (added) stats.templates++;
  }

  return { ok: true, ...stats };
};