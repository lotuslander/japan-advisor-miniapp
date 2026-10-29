# 安全策略

## 报告漏洞

请勿公开提 Issue，改用 GitHub Private vulnerability reporting，或邮件 `lotuslander@users.noreply.github.com`。

## 数据流向（威胁模型）

```
小程序（端侧）
  ├── 政策/案例数据  ← miniprogram/utils/local-data.js（内置，只读）
  ├── 顾问录入数据   ← wx.getStorageSync（仅本机）
  └── 大模型调用     → 顾问自己配置的第三方 API（BYOK）
```

- 不存在自有服务端，因此没有「服务端被拖库」风险
- `cloudfunctions/` 是历史遗留，页面已不再调用；**不要**把新逻辑放进去
- 客户档案属于敏感个人信息，任何导出功能必须由顾问显式触发

## 红线

仓库中永远不应出现：真实 AppID、`sk-`/`AIza` 形式的 Key、微信云环境 ID、真实客户姓名与联系方式、软著申请表与签字件。

## 支持范围

仅维护 `main` 最新版本。
