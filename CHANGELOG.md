# 更新日志

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-10-29

首个开源版本。

### 新增

- 开源发布：31 个页面 + 44 个历史云函数 + 本地政策/案例数据
- 政策研判：官方政策源抓取、历史溯源对比、现行政策允许性分析
- 个案工作台：客户档案、积分测算（HSP / 经营管理）、文书模板、案例库
- BYOK：支持 13 家国内外大模型，顾问自行配置 Key

### 开源前处理

- 软著登记材料（含签字件与个人信息）移出仓库并加入 `.gitignore`
- 真实 AppID 替换为占位符 `wxYOUR_APPID_HERE`
  - 补齐 LICENSE(AGPL-3.0) / SECURITY / CONTRIBUTING / CHANGELOG
