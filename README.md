# 日本移民置业顾问智能工作台 · Japan Advisor

> B 端移民·置业顾问工作台。核心能力是**政策研判的客观性**：自动拉取日本官方政策源、历史溯源对比、现行政策允许性分析、个案评估回链原文——**不代顾问做审批结论**。

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-WeChat%20MiniProgram-07C160.svg)](#)
[![Architecture](https://img.shields.io/badge/architecture-on--device%20%C2%B7%20BYOK-informational.svg)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

原名「日本移民置业顾问小程序（顧問業務室）」。

B 端移民·置业顾问工作台，核心能力是**政策研判的客观性**：自动拉取日本官方政策源、历史溯源对比、现行政策允许性分析、个案评估回链原文，不代顾问做审批结论。

## 技术栈
- 微信小程序（原生） + 微信云开发（云函数 + 云数据库）
- **31 个页面 · 44 个云函数 · 11 个数据库集合**
- UI：日式风格（和纸米白 #F8F4EC / 朱赤 #C04851），仅限本项目使用

> **运行架构（重要）**
>
> 本项目**已从云开发切换为纯端侧运行**：
>
> - 数据来自 `miniprogram/utils/local-data.js` + `wx.getStorageSync`，不经过云数据库。
> - **唯一的外部调用是用户自己选择的大模型**：顾问在「API 配置」页填写自己的 API Key（支持 13 家国内外模型），
>   该模型是小程序智能化的核心。
> - `cloudfunctions/` 下的 44 个云函数是**历史云架构遗留**，已不再被页面调用，仅作参考保留
>   （`seed-extra-data` 等仍有数据资产价值）。部署与维护云函数不是本项目的运行前提。


## 目录结构
```
Japan Advisor/
├── project.config.json          # 导入用配置（miniprogramRoot / cloudfunctionRoot）
├── miniprogram/
│   ├── app.js                   # wx.cloud.init（env 占位）
│   ├── app.json                 # 页面注册 + tabBar（工作台/我的）
│   ├── app.wxss                 # 日式全局样式
│   ├── sitemap.json
│   └── pages/                   # 20 个页面（含政策审核、个案评估、文书、资源、话术、隐私）
└── cloudfunctions/              # 20 个云函数
```

## 部署步骤（微信开发者工具）
1. **导入项目**：开发者工具 → 导入 → 选择本目录 `Japan Advisor`，填自己的 AppID
2. **填云环境**：`miniprogram/app.js` 中 `wx.cloud.init({ env: 'YOUR_ENV_ID' })` 改为你的云环境 ID
3. **建数据库集合**（11 个）：`policies`、`policy_versions`、`timeline_nodes`、`clients`、`cases`、`case_tasks`、`case_documents`、`cases_library`、`leads`、`client_notes`、`partners`
4. **部署云函数**：右键每个云函数目录 → 上传并部署（云端安装依赖）
   - 顺序：先部署并运行 `db-seed`（一次性灌入全部初始数据），再部署其余云函数
   - **重灌数据**：云开发控制台调用 `db-seed` 时传参 `{ "force": true }` 可清空 11 个集合后重新灌入（v0.10 新数据）
5. **配置 ai-chat**：云函数 `ai-chat` 环境变量加 `ZHIPU_API_KEY`（智谱开放平台 Key）
6. **定时抓取**：给 `fetch-policies` 配置定时触发器（建议每天 09:00），自动拉取日本官方政策页

## 商用上线前必办

> 本项目是纯端侧应用，没有服务端、没有游客/登录态，也不依赖云开发。
> 上线只涉及「域名白名单」一件事，其余都是可选的收尾。

**必须做（否则真机请求会失败）**

1. **配置唯一需要的白名单**：公众平台 → 开发 → 开发设置 → 服务器域名 → request 合法域名，
   只填你实际使用的大模型 API 域名（如 `https://open.bigmodel.cn`）。
   日本官网**不需要**配（全部由大模型自行访问），该白名单可在你其它端侧小程序间复用。

**按需做**

2. **上传发布前**，把 `project.config.json` 的 `appid` 换成你自己的 AppID。
   当前是 DevTools 在未填 AppID 时自动写入的占位值 `touristappid` ——
   它不影响本地运行与代码本身，只在需要「配白名单 / 上传发布」时才必须替换。
3. **真机预览一次**：`setting.urlCheck` 只是开发者工具「模拟器是否校验域名」的本地开关，
   不随代码上传、不影响线上（真机始终按白名单校验）。所以不要只信模拟器，
   上线前用真机跑一遍 AI 对话与政策更新，确认请求确实通。
4. **不要部署云函数**：`cloudfunctions/` 是历史资产，端侧模式不依赖它；
   `project.config.json` 的 `cloudfunctionRoot` 保留无害，如需彻底清理可移除。

**模型选择**

5. 政策/案例更新依赖大模型能否读取网页；纯对话模型会返回 `no_web_access` 并提示换模型，
   不会写入编造内容。建议选支持 Web 检索的接口。

（历史说明：早期云架构下还需更换云函数里的 API Key 与数据库权限，端侧模式已不再需要。）

## 云函数清单（历史云架构 · 已不参与运行）

> 以下为切换端侧前的云函数实现，现仅作参考与数据资产保留。
> 端侧替代方案见上文「政策更新链路」。实际数量为 44 个（下表为早期 20 个核心函数）。
| 函数 | 作用 |
|---|---|
| get-dashboard | 工作台/统计页汇总数据（含真实待办数） |
| get-timeline | 政策时间线节点 + 近期政策 + **历史版本对比（policy_versions 动态驱动）** |
| get-clients | 客户列表（筛选 + **关键词搜索** + 计数） |
| get-client | 客户详情 + 关联案件/任务 |
| get-case | 案件详情 + 任务 + 材料 |
| get-case-library | 案例库列表（按路径筛选）+ 案例详情（含审查过程·补正应对） |
| save-lead | 线索录入（自动同步进入客户库） |
| create-case | 新建案件（自动生成默认任务+材料清单） |
| toggle-task | 任务勾选 |
| close-case | 结案 + 反哺案例库（自动提取客户标签与已完成任务） |
| ai-chat | 智谱 GLM 政策问答（带原文引用 + 历史版本参考 + 关键词检索增强） |
| get-pending-policies | 待审政策列表 + 详情（fetch-policies 抓取入库后 status=pending_review） |
| approve-policy | 政策审核确认（→ effective + 结构化字段）/ 驳回（→ rejected 留痕） |
| add-client-note | 客户跟进记录新增（时间线） |
| import-csv | CSV 批量导入客户（UTF-8，表头 name,occupation,annual_income_jpy,tags,initial_intent） |
| export-data | 导出当前顾问客户为 CSV（不含联系方式） |
| fetch-policies | 定时抓取日本官方政策页（**15 个官方源**，支持重定向，正文从核心段落抽取，可选 AI 摘要） |
| assess-client | **综合评估引擎**：客户画像 × 现行政策 × 历史案例 → 可行性分级 + 风险 + 相似案例 + 政策依据回链 |
| get-partners | 资源协作层：行政书士/税理士/司法书士/银行/中介/律师 名录（本人可管，多顾问隔离） |
| db-seed | 一次性初始化 11 个集合（政策 21 / 案例库 18 / 版本 5 / 时间线 11 / 客户 8 / 线索 6 / 跟进记录 7 / 资源 6） |

## 政策审核工作流（v0.9 核心）
- **闭环**：fetch-policies 定时抓取 → 入库 `status=pending_review` → 工作台显示"政策待审 N 条" → 顾问在「政策審査」页逐条确认/驳回 → 确认后写入结构化字段并转 `effective`
- **结构化字段**（确认时可录入）：资本金、日语要求、常勤职员、专家确认、过渡期截止、影响提示——供历史对比/积分测算/检索引用
- **AI 摘要**：fetch-policies 配置 `ZHIPU_API_KEY` 环境变量后，抓取时自动对官方原文生成中文摘要（审核页可见，需人工核验）；未配置则跳过不影响抓取
- **驳回留痕**：驳回政策保留为 `rejected`，不进入现行库，可追溯

## 政策研判引擎说明
- **客观性三层保障**：官方源（moj.go.jp / isa 出入国在留管理庁 / 国土交通省 / 国税庁）→ 历史溯源（policy_versions 版本对比，数据库动态生成）→ 现行允许性（status 标记 + AI 分析仅回链原文）
- **政策源覆盖**（fetch-policies SOURCES 15 个）：经营管理签（含 2025 改制官方页 + Q&A）、高度人才积分制、J-Skip 特别高度人才、永住指南（2026 改订版）+ 申请手续、定住、技术人文知识国际业务、入管法政策、法务大臣记者会见、**入管厅新闻稿（isa_press）、在留资格一览（isa_status_index）**、不动产（国土交通省）、税制（国税厅）
- **时间线**：timeline_nodes 覆盖经营管理签 2006 创设 → 2015 更名 → 2025-10-16 史上最严改革，及高度人才/永住/不动产新规（2025-07 国籍申报、2026-04 外汇法报告义务、2026-10 登记国籍申报）等 11 个节点
- **历史对比**：时间线页"历史溯源 · 版本对比"表由 policy_versions 集合动态生成，政策更新只改数据不改代码
- **案例库**：18 个脱敏案例（10 内部 + 8 公开报道，含 2026 最新续签补正/高才永住案例），公开案例卡标注"公开报道"徽标与来源链接；部分案例含**审查过程·补正应对**（review_notes）
- **AI 约束**：ai-chat 系统提示硬性要求"不编造条文、区分现行/历史、不代做审批结论"，并携带历史版本数据辅助回答
- **容错**：全部页面加载失败有提示 + 空态 + 重试入口，不再静默吞错

## 个案评估引擎（v0.10 核心）
- **入口**：工作台「個案評価」→ 选择路径（経営管理 / 高度人材 / 永住 / 不動産）→ 填写客户画像 → 生成评估
- **客观性**：检查项逐条回链政策原文（sources）；相似案例来自脱敏案例库；可行性分级（高/中/低/不建议）由规则推演，不代顾问作审批结论
- **经营管理**：资本金 ≥3000 万 / 日语 B2 任一方 / 常勤职员 / 专家确认 / 学历或 3 年管理经验 / 事业具体性，共 6 项
- **高度人才**：积分 70 可申请 1 号、80 可 1 年永住（双时点核验提示）
- **永住**：在留 10 年（高才可缩短）/ 独立生计 / 纳税·年金·医保履行
- **不动产**：原则无限制 + 外汇法 20 天报告 / 国籍申报 / 资金来源合规 + "置业不挂钩签证"警示
- **风险清单**：硬性条件未满足 = 高风险；相似案例有撤回记录 = 中风险并提示复盘

## 文书与协作（v0.10）
- **文書作成**：経営管理/高度人材/永住三类理由书·事业计划书框架生成，□ 项为待补全内容，可复制全文
- **協力リソース**：行政书士/税理士/司法书士/律师/银行/不动产中介名录，按类型筛选、增删改，多顾问数据隔离
- **相談スクリプト**：四大路径常见咨询 24 问应答要点（客观口径、可追踪依据），可复制

## 多顾问与数据隔离（v0.9）
- 写操作（线索/案件/任务/材料/跟进记录/资源）自动记录 `owner_openid`（云函数端）
- 读操作（客户列表/案件/统计）按当前顾问过滤；无归属的 seed 演示数据对所有顾问可见；案例库全局共享（脱敏）
- 「我的」页显示当前顾问 ID（openid 尾号）

## 数据导入导出（v0.9，v0.10.6 重写）

**CSV（客户表）**
- 客户页「导出 CSV」：复制当前顾问客户表（无联系方式）粘贴保存
- 客户页「导入 CSV」：选择 .csv/.txt 文件（UTF-8），表头 `name,occupation,annual_income_jpy,tags,initial_intent`，tags 用「；」分隔，同名自动跳过

**JSON 全量备份（「我的」→ 导出/导入数据）**
- 格式 v2.0：`{ version, exported_at, keys: {...}, meta: {...}, stats: {...} }`
- 覆盖 **12 个用户数据键**：`clients` / `leads` / `partners` / `customPolicies` / `customCases` / `aiCases` /
  `policyReviews` / `policySources` / `chatHistory` / `llmConfig` / `advisorName` / `renewal_done`
- 另存 3 个元数据键：`lastPolicyUpdateTime` / `policyUpdateLog` / `lastCaseUpdateTime`

> 旧版只导出 5 个键，导致**政策审核结论、自定义政策源、线索、合作方、顾问信息在换机后全部丢失**，
> 这是本轮修掉的一个真实数据丢失隐患。旧版备份（v1.0 平铺格式）仍可正常导入。

- 不再导出内置知识库快照（静态数据，随代码发布；旧版导出它会平白增加几十 MB）
- 导入返回「恢复 N 项 / 跳过项」，失败原因可读

## 隐私合规（v0.9）
- 数据库权限：建议全部集合设为「仅云函数可读写」，客户端不可直接访问
- 客户列表/导出不含手机号等联系信息；案例反哺自动脱敏；「我的」→ 隐私与数据保护声明
- 合规依据：《个人信息保护法》+ 日本《個人情報の保護に関する法律》；顾问须取得客户同意后录入

## 政策更新链路（端侧核心能力）

原来由云函数 `fetch-policies` 完成的「抓官网 → 入库」，现在改为**端侧 + 大模型**：

```
utils/policy-sources.js        48 个官方来源（单一事实来源，含 20 条精确政策页深链）
        │
        ▼  分批（每批 12 个源，最多 6 批）
utils/ai-updater.js            组装提示词 → 调用用户配置的大模型 → 解析 → 去重 → 写本地库
        │
        ▼
wx.setStorageSync('customPolicies')   本地政策库（另记 lastPolicyUpdateTime / policyUpdateLog）
        │
        ├──► pages/policy-review   政策審査：AI 条目默认「待核验」，确认后才算生效
        ├──► pages/timeline        政策年表：带「AI 更新」徽标，可按分类筛选
        ├──► pages/workbench       工作台：合并进近期政策、显示上次更新时间
        ├──► pages/news            政策·新闻列表：AI 更新 + 官方动态合并
        ├──► components/policy-scroll-news  首页顶部滚动条（AI 优先）
        └──► pages/knowledge-admin 知识库管理：查看/删除 AI 政策
```

### 地址清单（`utils/policy-sources.js`）

| 分组 | 数量 | 说明 |
| --- | --- | --- |
| `DEEP_SOURCES` | 20 | 精确政策页深链（来自原 `fetch-policies`，价值最高） |
| `ORG_SOURCES` | 28 | 政府机构 / 地方入管局 / 行业协会 / 金融官网 |
| `CASE_SOURCES` | 7 | 案例·判例检索源，**全部带已验证的确切检索页地址** |
| `LEGACY_DOMAIN_HINTS` | 25 | 历史裸域名提示（原样保留，不丢弃） |

政策类去重后共 **48 个唯一 https 地址**，案例类 7 个，全部交给大模型。
任何页面都必须从这里取地址，**禁止再硬编码**。

### 为什么只需要一个白名单（重要设计前提）

微信小程序要求所有被请求的域名都必须在公众平台配置为 request 合法域名。如果把 48 个日本官网
逐个加白名单，工作量大、强依赖后端配置，而且每新建一个小程序都要重配一遍。

因此本项目（以及同一套端侧小程序的统一做法）是：

```
小程序  ──请求──►  用户自选的大模型 API 域名（唯一需要白名单的域名）
                        │
                        └──模型自行──►  48 个日本官网 / 7 个判例检索页
```

- **只需在白名单里配置模型 API 这一个域名**，官网全部由模型去访问。
- 该白名单可在多个小程序之间**直接复制复用**，不必为每个小程序单独维护。
- 也正因如此，官网清单必须是**精确、可直接检索的完整 URL** —— 它们是给模型看的，
  不是给小程序发请求的。清单里出现裸域名或空地址，模型就找不到页面。

### 案例源地址核对（2026-10 实测）

| 源 | 地址 | 状态 |
| --- | --- | --- |
| 裁判所｜裁判例検索（入口） | `https://www.courts.go.jp/hanrei/index.html` | ✅ 200 |
| 裁判所｜裁判例検索（条件指定） | `https://www.courts.go.jp/hanrei/search2/index.html` | ✅ 200 |
| 国税庁｜課税関係判決 | `https://www.nta.go.jp/about/organization/ntc/soshoshiryo/kazei/index.htm` | ✅ 200 |
| 国税庁｜税務訴訟資料 | `https://www.nta.go.jp/about/organization/ntc/soshoshiryo/` | ✅ 200 |
| 東京都行政書士会 | `https://www.tokyo-gyosei.or.jp/` | ✅ 200 |
| 大阪府行政書士会 | `https://www.osaka-gyoseishoshi.or.jp/` | ✅ 200 |
| 総務省｜行政不服審査会 答申一覧 | `https://www.soumu.go.jp/main_sosiki/singi/fufukushinsa/toushin.html` | ✅ 200 |

> 原清单里的「法務省判例検索」在法務省官网**不存在面向公众的判例检索页**；
> 入管处分的不服申立て实际由总务省行政不服審査会审理并公开答申，故该项映射到该答申一览。
> 原「国税庁税法判例集」拆为课税关系判决 + 税务诉讼资料两页。

### 防幻觉设计

模型不一定具备联网能力，因此链路里加了三道约束：

1. 系统提示明确「只能引用给定 URL 清单」，并约定无联网时返回 `{"items":[],"no_web_access":true}`。
2. 每条结果带 `verified` 字段：只有模型确实读过原文才为 true；为 false 时页面会提示「需人工核验」。
3. AI 条目一律进 `policy-review` 的「待核验」队列，人工确认后才转为现行。

若模型声明无联网能力，会明确提示换用支持检索的模型，而不是把模型记忆当成新政策写入。

### 触发方式

- 手动：工作台「AI政策更新检查」卡片（显示进度与上次更新时间）
- 到期提醒：超过 7 天未更新时弹窗询问（只在有 API Key 时提示，且必须用户点击才发请求，避免静默消耗额度）
- 案例：同一引擎复用，写入 `customCases`

## 首页滚动新闻

首页（工作台）顶部有一条垂直自动滚动的政策·新闻条，组件为
`components/policy-scroll-news/`，已在 `app.json` 全局注册，任何页面都可复用。

**两路数据合并，AI 更新优先：**

| 顺序 | 来源 | 标签 | 内容 |
| --- | --- | --- | --- |
| 1 | `customPolicies`（大模型更新结果） | 🔴 AI | 标题 + 摘要 + 机关·日期 + 原文链接 |
| 2 | `local-data.js` 的 `news`（内置官方动态） | 🔵 官方 | `title_ja` + `summary_zh` + 机关·日期 |

**关键实现：**

- 属性：`limit`（条数，默认 5）、`showAI`（是否并入 AI 更新，默认 true）
- 交互：点击条目 → 弹窗看摘要与来源，有链接可一键复制；点击标题/「全部」→ 跳 `pages/news`
- 自动在 `pageLifetimes.show` 时刷新，AI 更新完回首页即可看到新条目
- **原文链接不编造**：内置 `news` 只有机关名没有 URL，用 `policySources.findSourceByName()` 把
  机关名映射回机构**官网首页**（优先 ORG 源，其次深链），匹配不到就不显示链接。
  当前 6 个发布机关 **6/6 全部可映射**。
- `wx:key` 使用真实 `id`（此前是无效的 `index`/`_id`）；标签此前读 `item.type` 而数据里没有该字段，
  导致永远显示「前瞻」，现按真实来源区分 AI / 官方。

## 代码质量门禁（tools/）

五个零依赖的 Node 检查/测试脚本，改完代码跑一遍即可发现绝大部分低级错误：

```bash
node tools/check-miniprogram.js   .   # 页面完整性 / 组件引用 / JS 语法 / JSON / 资源引用
node tools/check-bindings.js      .   # wxml 事件与数据绑定 -> js 方法/data 一致性
node tools/check-reachability.js  .   # 页面可达性（有无孤立页面）
node tools/check-contracts.js    .   # 契约一致性（data-* ↔ dataset.X、组件属性 ↔ properties）
node tools/check-cloudfunctions.js .  # 云函数语法 / package.json / 依赖声明一致性
node tools/smoke-test.js          .   # cases-library / policy-review 运行时逻辑
node tools/test-policy-update.js  .   # 端侧政策更新引擎（地址完整性 / 分批 / 解析 / 去重 / 消费端）
node tools/audit-completeness.js  .   # 实现完备性审计（页面实现度 / 死文件 / 云遗留 / 缺失样式 / 外部请求）
node tools/check-release.js      .   # 发布就绪度（wx:key、空处理器、setData 键名、导航传参、死方法、废弃 API、包体积）
node tools/check-interaction.js  .   # 交互完备性（假成功提示、列表空态、死样式、无上限增长）
node tools/check-integrity.js    .   # 数据完整性（重复提交、字段契约、ID 碰撞）
node tools/test-integration.js   .   # 跨页面集成：录入客户 → 列表 → 新建案件 → 客户详情 → 案件工作台 → 备份还原
node tools/test-robustness.js    .   # 健壮性：脏数据 / 缺失参数 / 数值边界 / 畸形备份
node tools/test-checkers.js      .   # 检查器有效性（给每个检查器注入已知缺陷，验证它会报错）
```

全部通过时退出码为 0，可直接接入 CI 或本地 git hook。

当前状态：

| 检查 | 结果 |
| --- | --- |
| 结构完整性（页面四件套、组件注册、require、@import、图片、导航目标） | ✅ 0 问题 |
| 绑定一致性（事件处理器、模板变量、自定义标签） | ✅ 0 错误 0 警告 |
| 页面可达性 | ✅ 31/31 有入口，无孤立页 |
| 契约一致性 | ✅ 241 处绑定 / 116 个 data-* / 46 处 dataset 读取，0 处错配 |
| 云函数（语法 + 依赖声明） | ✅ 44/44 通过（历史资产，不参与运行） |
| 页面运行时冒烟 | ✅ 88 项断言（含防重复提交与 ID 唯一性） |
| 跨页面集成 | ✅ 31 项断言（客户录入→列表→建案→详情→工作台→阶段推进→备份还原） |
| 交互完备性 | ✅ 假成功提示 0、列表空态缺失 0、死样式 0、无上限增长 0 |
| 数据完整性 | ✅ 重复提交风险 0、字段契约漂移 0、ID 碰撞 0 |
| 健壮性 | ✅ 88 项断言（脏数据容错、参数容错、数值边界、畸形备份） |
| 检查器有效性 | ✅ 11/11 注入缺陷均被对应检查器检出（mutation test） |
| 政策更新引擎 | ✅ 60 项断言（含 48/48 政策地址 + 7/7 案例地址全部进入提示词） |
| 实现完备性审计 | ✅ 样式缺失 0、云遗留 0、死文件 0、**违反单白名单 0**；8 个「无生命周期/无数据源」均为静态或纯计算页 |
| 发布就绪度 | ✅ 0 错误 0 警告；wx:key 违规 0、空处理器 0、setData 键错 0、导航传参错配 0、死方法 0、废弃 API 0；包体积 428 KB / 上限 2048 KB |

## 本次体检修复记录

体检发现的真实缺陷与修复：

| # | 文件 | 问题 | 修复 |
| --- | --- | --- | --- |
| 1 | `pages/cases-library/cases-library.js` | wxml 是完整设计（分类筛选/搜索/进详情），js 只有 16 行桩：`setCat`/`onSearchInput`/`load`/`goDetail` 全缺失，`cat`/`keyword` 无数据字段，且字段契约错配（wxml 用云端 `_id`/`profile_tags`/`pathLabel`/`duration_months`，本地数据只有 `id`/`client_profile`/`path`/`result`） | 重写 js：补全 4 个处理器 + 字段映射 + 9 种签证路径归纳为 5 个分类；wxml 去掉不存在的 `duration_months`，加成功/不許可徽标与「清空搜索」空态 |
| 2 | `pages/policy-review/policy-review.js` | 缺 9 个处理器（`copyUrl`/`onCapitalInput`/`onJapaneseInput`/`onEmployeeChange`/`onExpertChange`/`onTransitionInput`/`onImpactInput`/`doApprove`/`doReject`）与 `loading`/`error` 状态，审核按钮点了无反应 | 全部补全，并把审核结论持久化到 `policyReviews` storage，列表状态随之更新（本地模式真正生效） |
| 3 | `pages/case-workbench/case-workbench.wxml` | 用 `{{idx}}` 但循环没声明 `wx:for-index`（微信默认索引名是 `index`），阶段进度条全部失效、序号显示 NaN | 加 `wx:for-index="idx"` |
| 4 | `pages/landing/landing.wxml` | 嵌套 `wx:for` 内外都用默认 `index`，内层遮蔽外层；`data-ti="{{tindex}}"` 变量根本不存在 → 勾选落到错误的下标 | 外层 `wx:for-index="si"`、内层 `wx:for-index="ti"`，`wx:key` 改为 `text` |
| 5 | `pages/client-intake/client-intake.wxml/.js` | `{{recording}}` 无数据字段（录音态永远不显示）；更严重的是 `onTranscriptInput` **从未被绑定**，用户无法录入任何内容，导致后续 AI 提取永远无数据 | 补 `recording` 状态并在 start/endRecord 中切换；新增 textarea 绑定 `onTranscriptInput` + 字数提示 |
| 6 | `cloudfunctions/seed-extra-data/index.js` | 第 265 行把代码写进了注释（`// ── 4. … ──  const extraCompliance = [`），导致整个云函数语法错误无法部署 | 拆行修复 |
| 7 | `cloudfunctions/seed-extra-data/index.js` | 多次「补包」拼接造成重复 `const` 声明：`partners`(×2)、`moreTemplates`(×2)、`moreCases`(×2) | 后一组改名 `partnerList` / `moreTemplatesV8` / `moreCasesV8` 并同步引用 |

> 说明：`seed-extra-data` 的语法错误意味着该云函数此前**无法部署**，属于阻断级问题。

## 端侧政策更新改造记录（v0.10.3）

| # | 内容 | 说明 |
| --- | --- | --- |
| 1 | 新增 `utils/policy-sources.js` | 地址清单单一事实来源。此前三套并存且互有冲突（workbench 25 条裸域名 / sources-admin 27 条完整 URL / 云函数 20 条深链）。现全部保留：20 深链 + 27 机构 + 7 案例 + 25 历史域名提示，去重后 47 个唯一 https 地址 |
| 2 | 重写 `utils/ai-updater.js` | 由「一次塞 25 个裸域名 + 不解析结果」改为：分批（12/批）、严格 JSON 输出、`no_web_access` 防幻觉、`verified` 标记、规范化为政策记录、按「标题+日期」去重合并、写更新日志、可复用同一引擎处理案例 |
| 3 | 修 `workbench` | 两处硬编码清单改为引用共享模块；更新入口显示实时进度与上次更新时间；到期提醒改为「有 Key 才提示 + 用户点击才请求」 |
| 4 | 修 `timeline` | 合并 AI 更新条目并加「AI 更新」徽标与未核验提示；顺带修复 `switchCat` 此前完全没生效（筛选忽略 currentCat）的问题 |
| 5 | 修 `policy-review` | AI 条目进入列表并默认「待核验」，详情页可打开、可确认/驳回；此前 AI 结果在审核页完全不可见 |
| 6 | 修 `sources-admin` | 导入改为读共享清单（含深链），新增「恢复内置清单」；`copyDomains` 不再依赖 `URL` 构造函数（小程序环境可能缺失） |
| 7 | 补全案例源地址 | 原 5 条里 3 条只有名称没地址（模型拿不到入口）。现补成 7 条**实测可达**的确切检索页：裁判例検索入口 + 条件指定检索、国税庁課税関係判決 + 税務訴訟資料、東京都/大阪府行政書士会、総務省行政不服審査会答申一覧（替代并不存在的「法務省判例検索」） |

## 实现完备性审计记录（v0.10.4）

这一轮不是查「绑定是否断裂」，而是查「**页面是否真的实现了**」，由 `tools/audit-completeness.js` 输出。

| # | 位置 | 问题 | 修复 |
| --- | --- | --- | --- |
| 1 | `pages/profile/profile.js` | **配置割裂（功能性 bug）**：「我的」页把 Key 写入独立键 `llmKey`/`llmUrl`，而 `chat`/`plan-generator`/`ai-updater` 只读 `llmConfig` → 在「我的」填的 Key 对 AI 功能完全无效 | 统一读写 `llmConfig`；对旧 `llmKey`/`llmUrl` 做一次性迁移并清理；测试连接也走统一配置 |
| 2 | `miniprogram/app.js` | 仍在 `wx.cloud.init({ env: 'YOUR_ENV_ID' })` 并调用云函数 `get-policies-snapshot` —— 纯端侧架构下会产生无意义报错与请求 | 移除云初始化与云快照；改为本地汇总「内置政策 + AI 更新政策」 |
| 3 | `components/policy-scroll-news/policy-scroll-news.js` | 调用云函数 `get-news`，且该组件**未被任何页面引用** | 改为读本地 `local-data.news`，消除云依赖（文件保留备用） |
| 4 | 5 个页面 wxss | wxml 使用了但样式从未定义，导致渲染缺样式：`chat.cite-item`、`client-detail.meta/.stage-tag/.tip/.btn.primary/.empty`、`news.empty-text`、`assessment.btn.primary/.empty-text`、`profile.info` | 按项目配色补齐全部缺失样式 |

审计同时确认（非缺陷，属页面性质）：

- `compare` / `privacy` 为**纯静态页**（条件矩阵、隐私声明），`Page({})` 合理；
- `calculator` / `assessment` / `scripts` / `fees` / `rei-calc` 为**纯计算/静态内容页**，不读外部数据属正常；
- `chat` / `landing` / `plan-generator` 用初始 `data` 渲染，无需生命周期钩子。

仍待你决定的两处**死文件**（无 git，我未删除）：

| 文件 | 情况 | 建议 |
| --- | --- | --- |
| `utils/i18n.js` | 全项目 0 处引用 | 若要中/日双语则接入 profile 的语言切换；否则删除 |
| `components/policy-scroll-news/` | 0 处引用（已去掉云依赖） | 若要首页滚动新闻则启用；否则删除 |

## 版本
v0.10.1（v0.10 基础上新增费用报价、不动产利回り测算、经营管理续签检查清单三工具页；v0.10 全面能力补足轮：综合评估引擎 + 个案评估页、文书框架生成、资源协作层、咨询话术库、政策源扩至 15、案例库扩至 18 并含审查过程、政策检索关键词增强、工作台入口扩充至 13 项）

v0.10.2 — 代码体检轮：补齐 `cases-library`（4 个断链处理器 + 字段契约映射）与 `policy-review`（9 个处理器 + 审核结果持久化）两个「wxml 完整、js 是桩」的页面；修复 `case-workbench` 循环索引、`landing` 嵌套循环索引遮蔽、`client-intake` 无法录入文字三处交互缺陷；修复 `seed-extra-data` 云函数的注释吞代码与 3 组重复 `const` 声明（此前该函数无法部署）。新增 `tools/` 下静态检查脚本作为质量门禁。

v0.10.3 — 端侧政策更新落地：架构明确为「纯端侧 + 用户自带 LLM Key」，云函数正式退役。新增 `utils/policy-sources.js` 统一 48 个官方地址（此前分裂成三套且域名冲突），重写 `ai-updater` 为分批 + 严格 JSON + 防幻觉 + 去重的端侧引擎，打通「工作台触发 → 本地政策库 → 政策審査待核验 → 政策年表展示」闭环。测试：`test-policy-update.js` 60 项断言全部通过，其中验证 48/48 政策地址与 7/7 案例地址均真实进入提示词。
v0.10.4 — 实现完备性审计轮：新增 `tools/audit-completeness.js`（页面实现度 / 死文件 / 云遗留 / 缺失样式 / storage key 清单）。修复「我的」页与 AI 功能的大模型配置割裂（写 `llmKey` 但功能读 `llmConfig`，属功能性 bug）、`app.js` 的云初始化与云快照遗留、未使用组件里的云函数调用，并补齐 8 处从未定义的 wxml 样式。样式缺失降为 0、云遗留降为 0。

v0.10.5 — 移除中日双语切换（删除 `utils/i18n.js`、`profile` 的语言切换区块与 `lang` 存储/globalData，该功能此前只写不读、切了也不生效）；启用并完善首页滚动新闻：`policy-scroll-news` 从无用死代码改为工作台顶部滚动条，合并「AI 更新政策 + 内置官方动态」，修复 `wx:key` 无效与标签字段不存在两个 bug，补点击详情/复制原文/跳转列表交互；`news` 页同步修复并接入 AI 更新；为让新闻机关 6/6 可映射官网，补充 `デジタル庁` 来源（政策源 47 → 48）。死文件与样式缺失均降为 0。

v0.10.6 — 首页滚动条位置调整（移到两个 AI 更新入口下方，不抢视觉焦点）。完备性复查中又修 3 处实质问题：①`data-transfer` 导出漏了 6 个键（政策审核结论/自定义源/线索/合作方/顾问信息/续期标记），换机会丢数据 —— 重写为 v2.0 格式覆盖 11 个用户键并兼容旧备份；②删除死代码 `fetchPolicyUpdates()`，它直接 `wx.request` 日本政府网站，与「只白名单模型域名」的架构冲突；③`chat` / `plan-generator` 用占位 Key `YOUR_ZHIPU_API_KEY` 兜底，未配置时会拿假 Key 发请求报 401 —— 改为明确提示并跳转配置页。审计工具新增「外部请求目标」检查，作为单白名单架构的永久守卫。

v0.10.7 — 删除全部示例静态数据（未触碰 `utils/local-data.js` 内置知识库/案例与 `utils/policy-sources.js` 基础网址）：`profile` 的假顾问档案（含虚构业绩 32/28/4）、`workbench` 的 3 条假待办与假计数、`calculator`/`case-new`/`rei-calc`/`fees` 表单预填的示例数字（年龄35/年收600/物件3000万等）、`assessment` 预选的学历与 N2（此前会默认白送 15 分）。改为由真实数据推导：待办数量取自实际客户/线索/AI 待核验政策，执业记录取自真实客户统计，`calculator` 未填年龄年收时不再计分。另修 `customCases` 键被两类数据混用的问题（用户案件 vs AI 案例字段结构不同，导致知识库页案件标题空白），AI 案例改存 `aiCases` 并提供旧数据一次性迁移；备份覆盖 11 → 12 个用户键。

v0.10.8 — 最终完备性检查（发布就绪度维度）：新增 `tools/check-release.js`，覆盖 appid/urlCheck 发布配置、wx:key 规范、被绑定的空处理器、setData 顶层键拼写、导航传参契约、列表页返回刷新、tabBar 一致性、包体积（430 KB / 2048 KB）。据此修 3 处真问题：①`documents` 的「AI 口述填表」整块是死的（`endDictation` 空函数 + 从未设置 recording + 无任何输入框，transcript 永远为空）—— 补录音态、输入框与 `onTranscriptInput`；②`case-workbench` 把原始 path 代码（bm/hsp）当标签显示，映射方法写了却没用 —— 改为调用 `this.pathLabel()` 并补全映射；③`api-config` 的 `whitelistDomain` 与 `case-workbench` 的 `pathLabel` 未在 data 声明（wxml 有引用），补齐声明；另清理 `profile` 一处无用 setData。发布阻断项仅剩两项需你提供：正式 AppID、urlCheck 改 true。

v0.10.9 — 发布就绪度维度复查（第 8 个检查器 `check-release.js` 已扩到 13 项）：新增 wx:key 规范、被绑定空处理器、setData 顶层键拼写、Page 对象重复键、导航传参契约、死方法、未使用 data 键、废弃 wx API、工作台入口映射覆盖、包体积等检查。据此清理：`knowledge-admin` 11 个云时代遗留统计键与 `loadStats`；`workbench`/`leads`/`case-new`/`assessment`/`partners`/`api-config`/`fees`/`dashboard`/`timeline`/`policy-review` 共 14 个死方法与 9 个无用 data 键；`global-ai-float` 改用 `wx.getWindowInfo`（旧库回退）。补齐两处「有方法无入口」：`profile` 增加「清除 Key」按钮与「政策源管理」入口；`case-new` 恢复 `clientId` 参数并写入案件的 `client_id`（客户详情→新建案件的关联真正生效）。appid/urlCheck 改为 INFO 提示（纯端侧运行不受影响，仅上传发布与白名单配置时才需要）。当前 8 个检查器全部 exit=0。

## 页面生命周期约定（维护必读）

- `onLoad`：只用来接收路由参数、做一次性初始化。**不要在这里读业务数据**（除非页面不再变化）。
- `onShow`：用来读 storage / 重新计算展示数据。**所有展示列表的页面都应该在 onShow 里加载**，否则从子页返回时列表是旧数据（小程序返回不会重建页面实例，onLoad 不会重跑）。
- 纯表单页（无 wx:for 业务列表）可以只在 onLoad 初始化，不需要 onShow。

> `tools/check-release.js` 会检查这一点：用 wx:for 渲染业务列表却没有 onShow 的页面会被报 WARN。

v0.10.10 — 生命周期与数据链路修复：`client-detail` 此前「备注存了不显示、沟通记录只存内存、关联案件恒为空、待办恒为 0」——现全部改为从真实数据读取，并补 `onShow` 刷新；`case-workbench` 此前「启动日/预计完成/合同金额」三行字段名不匹配显示为空、材料清单与待办恒为空、阶段推进与任务勾选不落库——现按路径从内置 `visaChecklists` 生成材料清单、任务=未就绪材料、勾选与阶段持久化回 `customCases`；`sources-admin` 补 `onShow`。检查器 `check-release` 的「列表页刷新」判断改为只对真的用 wx:for 渲染业务列表的页面报警。冒烟断言 63 → 81 项。

v0.10.11 — 新增第 9 个检查器 `tools/test-integration.js`（跨页面集成，31 项断言），验证「语音录入客户 → 客户列表 → 从客户详情建案 → 案件工作台材料/任务/阶段 → 备份导出导入」整条链路的数据契约。据此又修 3 处真问题：①`client-intake` 姓名正则写错（`([^\\s，,。]{2,4})(先生|女士|小姐)` 要求至少 2 字姓氏，导致「陈先生」这类单姓永远提取失败 → 客户名变成「未命名客户」），改为 1-4 字并连称谓一起捕获；②`client-intake` 写的是 `annual_income`，而列表/详情/CSV 都读 `annual_income_jpy` → 新建客户年收一直显示空，已统一为规范字段；③`case-new` 创建案件时没写 `stage` 字段 → 案件工作台拿不到当前阶段、点「推进阶段」直接跳到结案，已补 `stage/stage_idx`，并让 `advanceStage` 对老案件缺字段时兜底为「评估中」。客户列表年收为空时改为显示「年收待补充」而非「· 円」。

v0.10.12 — 新增第 10 个检查器 `tools/check-interaction.js`（交互完备性），查「交互是否真的有效果」而非「代码能否运行」：假成功提示、列表空态缺失、死样式、storage 数组无上限增长。据此修 2 处真问题：①`calculator` 的「保存到客户档案」是**假的** —— 页面文案写「可一键同步到客户档案」，但 handler 只弹了个 toast、没写任何数据；现补客户选择器，真正把积分测算结果写入 `client.hsp`；②`sources-admin` 列表补空态提示。另清理 62 条从未被使用的 wxss 规则（workbench 30 条 RSS/快捷入口图标、timeline 7 条旧对比表、client-detail 2 条、knowledge-admin 4 条等），并保留 `.low`/`.btn.disabled` 这类会被动态切换的状态修饰类。当前 10 个检查器全部 exit=0。

v0.10.13 — 新增第 11 个检查器 `tools/check-integrity.js`（数据完整性：重复提交风险 / 字段契约漂移 / ID 碰撞）。据此修一类此前所有维度都查不到的真缺陷：**7 个保存处理器没有提交锁** —— `client-intake.saveClient` / `leads.save` / `case-new.save` / `partners.save` / `knowledge-admin.saveCustomPolicy` 快速双击会写入两条重复数据（客户、案件、线索、合作方、自定义政策）。现统一加 `submitting` 提交锁：校验通过后上锁、成功路径**不释放**（页面即将返回，释放反而会让同一 tick 的第二次点击写重复），仅在重新打开表单时解锁。同时给所有 `xxx- + Date.now()` 形式的主键追加随机后缀，消除同毫秒 ID 碰撞。冒烟测试补 7 项（双击只写 1 条、ID 不重复），88 项断言。

v0.10.14 — 新增第 12 个检查器 `tools/test-robustness.js`（健壮性：脏数据 / 缺失参数 / 数值边界 / 畸形备份，88 项断言）。这一维度查的是「真实环境才会出现、但前面所有测试都假设数据正确」的场景，一次抓出 14 处崩溃：**当 storage 里 `clients`/`customCases` 不是数组时（旧版本遗留数据、用户手动清缓存残留、畸形备份），页面直接抛 `clients.map is not a function` 白屏**。修复：新增 `utils/storage.js` 统一安全读取（`getList/getMap/getString`，类型不对一律退回空容器），并用脚本把 19 个文件里的 `wx.getStorageSync('x') || []` 批量替换为 `storage.getList('x')`（含备份与语法校验）；`data-transfer.importAll` 增加类型校验，畸形备份里的错误类型直接拒收、不再写脏 storage；`calculator` 的加分项补 `Array.isArray` 守卫。同时修测试桩两处 `global.wx` 同步问题（utils 模块引用全局 wx）。

v0.10.15 — 新增第 13 个检查器 `tools/check-contracts.js`（契约一致性）：验证 `data-*` 属性与处理器里 `dataset.X` 读取是否对得上（写错一个字母点击就静默失效、不报错不崩），以及自定义组件被传的属性是否在 `properties` 里声明（未声明会被静默忽略）。实测覆盖 241 处绑定 / 116 个 data-* 属性 / 46 处 dataset 读取 / 4 个组件，**0 处错配** —— 这一维度本身是干净的，作为常驻守卫保留。当前 13 个检查器全部 exit=0：静态检查 9 个 + 运行时测试 4 个（88 + 61 + 31 + 88 = 268 项断言）。

v0.10.16 — 新增第 14 个检查器 `tools/test-checkers.js`（检查器有效性 / mutation test）：把整个工程复制到临时目录，对每个检查器**注入一个已知缺陷**，验证它确实会报错，而不是空转打印 0 项。覆盖 11 个注入用例：结构性缺必需文件 / JSON 损坏 / 不存在的事件处理器 / 孤立页面 / dataset 错配 / 云函数语法错 / 死文件 / `wx:key="index"` / 假成功提示 / 去掉提交锁 / storage 不再做类型归一。结果 **11/11 全部检出**。这一步验证的是「工具本身可信」——否则前面所有「全绿」都可能只是检查器失效。至此 14 个检查器全部 exit=0：静态 9 个 + 运行时测试 5 个（88 + 61 + 31 + 88 + 11 = 279 项断言）。
---

## 版本 1.0（软件著作权登记版本）

v1.0.0 — 正式版。相对 v0.10.16 的变更：

1. **清理内置 API Key**：移除 `cloudfunctions/` 下 9 个云函数中硬编码的占位密钥
   `YOUR_ZHIPU_API_KEY`（ai-chat / embed-knowledge / fetch-news / fetch-policies /
   generate-plan / generate-script / rag-fact-check / summarize-policy / voice-to-text），
   统一改为从环境变量 `process.env.ZHIPU_API_KEY` 读取。至此全项目零硬编码密钥。

2. **保留应用内置案例文件**：`utils/local-data.js`（25 组 234 条：政策库 25 条、
   案例 15 条、文书模板、合规红线、不动产政策与案例、签证材料清单等）属于软件内置
   业务数据集，非示例数据，按需求全部保留。

3. **软件著作权登记材料**（`copyright/` 目录）：
   包含源程序鉴别材料、软件说明书与 R11 申请表填报信息。
   ⚠️ 该目录含签字件与个人信息，**已在开源前移出仓库**并写入 `.gitignore`，
   不随本项目分发；生成工具 `tools/gen-copyright.js` 保留在仓库中。

4. **新增工具**：`tools/gen-copyright.js`（生成鉴别材料）、`tools/txt2pdf.py`
   （文本转 PDF，内嵌中文字体，不依赖 LibreOffice）

检查结果：14 个检查器全部 exit=0，279 项断言通过。

---

## 项目结构（开源版）

```
Japan Advisor/
├── project.config.json        开发者工具配置（AppID 为占位符）
├── miniprogram/
│   ├── app.js / app.json / app.wxss
│   ├── pages/                 31 个页面（工作台、政策审核、个案评估、文书、话术…）
│   ├── utils/
│   │   ├── local-data.js      内置业务数据集（政策 25 条 / 案例 15 组 / 文书模板 / 合规红线）
│   │   ├── policy-sources.js  官方政策源定义
│   │   ├── data-transfer.js   本地数据导入导出与类型校验
│   │   ├── storage.js         安全读取（类型不对退回空容器）
│   │   └── ai-updater.js      政策增量更新
│   └── components/ custom-tab-bar/ images/
├── cloudfunctions/            44 个历史云函数（页面已不再调用，仅作参考）
├── tools/                     14 个自检脚本 + 软著材料生成器
└── BACKLOG.md                 产品待办
```

## 隐私说明

- 顾问录入的客户档案、个案、话术只写入**本机 storage**，不上传任何自有服务端
- 唯一外部调用是顾问自行配置的第三方大模型接口（BYOK），Key 存本机
- 政策抓取只访问日本官方公开信息源
- 仓库中不含真实 AppID、不含任何 API Key、不含真实客户信息、不含软著签字件

## 许可证

以 **GNU Affero General Public License v3.0（AGPL-3.0）** 发布，全文见 [LICENSE](LICENSE)。

你可以自由使用、修改、分发；若将修改版作为网络服务提供给他人使用，必须同样以 AGPL-3.0 公开修改。闭源商用需单独联系作者获取商业授权。

> 内置的政策条文、案例与文书模板用于辅助研判，**不构成法律意见或审批结论**。

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)；安全漏洞请走 [SECURITY.md](SECURITY.md) 的私密渠道。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

