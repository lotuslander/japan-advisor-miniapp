// 应用入口（纯端侧架构）
//
// 说明：本项目不依赖微信云开发。唯一的外部请求是用户自己配置的大模型 API，
// 因此这里**不再初始化 wx.cloud**，也不拉取云端快照，避免在未配置云环境时
// 产生无意义的报错与网络请求。
const localData = require('./utils/local-data.js');

App({
  onLaunch() {
    this.globalData = {
      advisor: {
        name: wx.getStorageSync('advisorName') || '',
        org: '',
        role: ''
      },
      policySnapshot: null
    };
    this.migrateLegacyCases();
    this.refreshPolicyCache();
  },

  /**
   * 一次性迁移：旧版本把「AI 更新的案例」和「用户自建案件」都存在 customCases 里，
   * 两者字段结构不同（AI 用 title_zh/summary，案件用 client_name/path/price），
   * 混存会导致知识库页把案件标题渲染为空。此处按特征把 AI 条目拆到 aiCases。
   */
  migrateLegacyCases() {
    try {
      const raw = wx.getStorageSync('customCases');
      if (!Array.isArray(raw) || raw.length === 0) return;

      const userCases = [];
      const aiCases = [];
      raw.forEach((c) => {
        if (c && c.title_zh && !c.client_name) aiCases.push(c);
        else userCases.push(c);
      });

      if (aiCases.length === 0) return;

      const existing = wx.getStorageSync('aiCases');
      const merged = Array.isArray(existing) ? existing.slice() : [];
      const seen = {};
      merged.forEach((c) => {
        if (c && c.id) seen[c.id] = true;
      });
      aiCases.forEach((c) => {
        if (!c || !c.id) return;
        if (seen[c.id]) return;
        seen[c.id] = true;
        merged.push(c);
      });

      wx.setStorageSync('aiCases', merged);
      wx.setStorageSync('customCases', userCases);
    } catch (e) {
      // 迁移失败不应阻塞启动
    }
  },

  /**
   * 汇总本地政策缓存：内置政策 + 用户通过大模型更新得到的政策。
   * 完全离线可用，不发起任何网络请求。
   */
  refreshPolicyCache() {
    try {
      const builtin = localData.policies || [];
      // AI 更新结果（可能为空）
      const aiPolicies = wx.getStorageSync('customPolicies');
      const ai = Array.isArray(aiPolicies) ? aiPolicies : [];

      this.globalData.policySnapshot = {
        count: builtin.length + ai.length,
        builtinCount: builtin.length,
        aiCount: ai.length,
        snapshot_at: Date.now()
      };
    } catch (e) {
      // 任何异常都不应阻塞启动
      this.globalData.policySnapshot = null;
    }
  }
});
