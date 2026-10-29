const localData = require('../../utils/local-data.js');
const aiUpdater = require('../../utils/ai-updater.js');
const policySources = require('../../utils/policy-sources.js');
const storage = require('../../utils/storage.js');

// 政策源与案例源统一由 utils/policy-sources.js 提供（单一事实来源，禁止在此硬编码网址）
const POLICY_SITES = policySources.displayTags();
const POLICY_SOURCE_COUNT = policySources.allPolicySources().length;

Page({
  data: {
    todoCount: 0,
    newPolicies: 0,
    todayFollowups: 0,
    recentPolicies: [],
    reportReminders: [],
    // 全部政策源网站（展示用，来自共享清单）
    policySites: POLICY_SITES,
    policySourceCount: POLICY_SOURCE_COUNT,
    lastPolicyUpdateText: '尚未更新',
    policyUpdateMsg: '',
    // 今日待办：不再内置示例任务，改为由真实数据计算（见 buildTodos）
    todayTodos: [],
    quickEntries: [
      { key: 'intake', label: '🎙 语音录入' },
      { key: 'plan', label: 'AI方案生成' },
      { key: 'lead', label: '新規線索' },
      { key: 'client', label: '顧客名簿', count: 0 },
      { key: 'calc', label: '点数計算' },
      { key: 'assess', label: '個案評価' },
      { key: 'case', label: '案件台帳' },
      { key: 'doc', label: '文書作成' },
      { key: 'renewal', label: 'ビザ更新' },
      { key: 'caseLib', label: '事例集', count: 0 },
      { key: 'policy', label: '政策年表' },
      { key: 'review', label: '政策審査', count: 0 },
      { key: 'compare', label: 'ルート比較' },
      { key: 'script', label: '相談話術' },
      { key: 'fees', label: '費用見積' },
      { key: 'reicalc', label: '利回り計算' },
      { key: 'partner', label: '協力資源' },
      { key: 'landing', label: '落地支援' },
      { key: 'dashboard', label: '統計' },
      { key: 'chat', label: 'AI 相談' },
      { key: 'realEstateIssues', label: '🏠 不動産問題庫' }
    ],
    recentClients: [],
    newsList: [],
    aiSearching: false,
    caseSearching: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    // 纯本地模式：直接读内置数据
    this.setData({
      recentPolicies: localData.policies.slice(0, 3),
      newsList: localData.news
    });
    // 从本地storage读客户数据
    const clients = storage.getList('clients');
    this.setData({ recentClients: clients.slice(0, 3) });

    // AI 更新的政策合并进「近期政策」
    const aiPolicies = aiUpdater.readPolicies();
    if (aiPolicies.length > 0) {
      this.setData({
        recentPolicies: aiPolicies.slice(0, 3),
        lastPolicyUpdateText: this.formatTime(aiPolicies[0].fetchedAt)
      });
    } else {
      this.setData({ lastPolicyUpdateText: this.formatTime(aiUpdater.lastUpdateTime()) });
    }

    // 今日待办与计数：全部由真实数据推导（不内置示例任务）
    this.buildTodos(clients, aiPolicies);

    // 检查是否需要自动更新（每7天一次）
    this.checkAutoUpdate();
  },

  /**
   * 由真实数据推导「今日待办」，避免界面上出现写死的示例内容。
   * 只做客观计数，不臆测业务状态。
   */
  buildTodos(clients, aiPolicies) {
    const CLOSED = ['closed', 'done', 'rejected', 'failed'];
    const list = (clients || []).filter((c) => c && c.stage);
    const active = list.filter((c) => CLOSED.indexOf(c.stage) < 0);

    let leads = [];
    try {
      leads = storage.getList('leads');
    } catch (e) {
      leads = [];
    }

    // AI 政策中尚未审核的条目
    let reviews = {};
    try {
      reviews = storage.getMap('policyReviews');
    } catch (e) {
      reviews = {};
    }
    const pendingPolicies = (aiPolicies || []).filter((p) => !reviews[p.id]).length;

    const todos = [];
    if (active.length > 0) {
      todos.push({ task: `跟进进行中客户 ${active.length} 位`, priority: 'high' });
    }
    if (leads.length > 0) {
      todos.push({ task: `跟进新线索 ${leads.length} 条`, priority: 'high' });
    }
    if (pendingPolicies > 0) {
      todos.push({ task: `核验 AI 更新的政策 ${pendingPolicies} 条`, priority: 'medium' });
    }

    this.setData({
      todayTodos: todos,
      todoCount: todos.length,
      newPolicies: pendingPolicies
    });
  },

  // 到期自动提醒（实际请求由用户点击触发，避免静默消耗额度）
  checkAutoUpdate() {
    if (this.data._autoUpdateChecked) return;
    this.data._autoUpdateChecked = true;
    if (!aiUpdater.hasApiKey()) return;

    aiUpdater.checkAutoUpdate(7, () => {
      this.checkPolicyUpdates();
    });
  },

  async loadReminders() {
    // 纯本地模式：从storage读
    const clients = storage.getList('clients');
    const reminders = clients.filter(c => c.stage === 'processing' && c.email);
    this.setData({ reportReminders: reminders.slice(0, 3) });
  },

  async refreshRss() {
    wx.showToast({ title: '纯本地模式，请手动更新', icon: 'none' });
  },

  async loadNews() {
    this.setData({ newsList: localData.news });
  },

  // AI政策更新检查（端侧引擎：分批把官网清单交给大模型）
  checkPolicyUpdates() {
    if (this.data.aiSearching) return;

    if (!aiUpdater.hasApiKey()) {
      wx.showModal({
        title: '需要先配置大模型',
        content: '政策更新由大模型读取官方网站完成，请先在「API 配置」中填写你自己的 API Key。',
        confirmText: '去配置',
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: '/pages/api-config/api-config' });
        }
      });
      return;
    }

    this.setData({ aiSearching: true, policyUpdateMsg: '正在准备…' });

    aiUpdater.run({
      days: 30,
      onProgress: (text, done, total) => {
        this.setData({ policyUpdateMsg: text });
      },
      onSuccess: (result) => {
        this.setData({
          aiSearching: false,
          policyUpdateMsg: '',
          lastPolicyUpdateText: this.formatTime(result.updatedAt)
        });
        wx.showModal({
          title: '政策更新完成',
          content: `已核查 ${result.sources} 个官方来源（${result.batches} 批），新增 ${result.added} 条政策。\n\n`
            + '可在「政策審査」「政策年表」中查看，标记 AI 更新的条目需人工核验原文。',
          confirmText: '查看',
          cancelText: '知道了',
          success: (r) => {
            if (r.confirm) wx.navigateTo({ url: '/pages/policy-review/policy-review' });
          }
        });
      },
      onError: (message) => {
        this.setData({ aiSearching: false, policyUpdateMsg: '' });
        wx.showModal({ title: '未获取到政策', content: message, showCancel: false });
      }
    });
  },

  // AI案例更新检查（同一引擎，写入 customCases）
  checkCaseUpdates() {
    if (this.data.caseSearching) return;

    if (!aiUpdater.hasApiKey()) {
      wx.showToast({ title: '请先配置 API Key', icon: 'none' });
      return;
    }

    this.setData({ caseSearching: true });

    aiUpdater.run({
      days: 90,
      sources: policySources.allCaseSources(),
      // AI 案例单独存 aiCases，避免与用户自建案件（customCases）混在一起：
      // 两者字段结构不同（AI 是 title_zh/summary，案件是 client_name/path/price），
      // 共用同一键会让知识库页把案件标题渲染成空。
      storageKey: 'aiCases',
      lastUpdateKey: 'lastCaseUpdateTime',
      logKey: 'caseUpdateLog',
      onProgress: () => {},
      onSuccess: (result) => {
        this.setData({ caseSearching: false });
        wx.showToast({ title: `新增 ${result.added} 条案例`, icon: 'none' });
      },
      onError: (message) => {
        this.setData({ caseSearching: false });
        wx.showModal({ title: '未获取到案例', content: message, showCancel: false });
      }
    });
  },

  formatTime(ts) {
    if (!ts) return '尚未更新';
    const d = new Date(ts);
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },  openNews(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '链接已复制', icon: 'none' }) });
  },

  async loadDashboard() {
    // 纯本地模式：从storage读客户数
    const clients = storage.getList('clients');
    const quickEntries = this.data.quickEntries.map(q => {
      if (q.key === 'client') return { ...q, count: clients.length };
      if (q.key === 'caseLib') return { ...q, count: localData.cases.length };
      if (q.key === 'review') return { ...q, count: localData.policies.length };
      return q;
    });
    this.setData({
      todoCount: 3,
      newPolicies: localData.policies.length,
      quickEntries
    });
  },  async loadClients() {
    // 纯本地模式：从storage读
    const clients = storage.getList('clients');
    const recentClients = clients.slice(0, 3).map(c => ({
      id: c._id || c.id,
      name: c.name,
      path: c.path || '新客',
      note: (c.tags || []).join(' · ') || '新客户',
      deadline: '',
      urgent: false
    }));
    this.setData({ recentClients });
  },  async loadRecentPolicies() {
    this.setData({ recentPolicies: localData.policies.slice(0, 3) });
  },

  directionLabel(d) {
    const map = { tighten: '收緊', relax: '放寬', clarify: '明確化', create: '創設' };
    return map[d] || '政策';
  },

  onQuickEntry(e) {
    const key = e.currentTarget.dataset.key;
    const routes = {
      intake: '/pages/client-intake/client-intake',
      plan: '/pages/plan-generator/plan-generator',
      lead: '/pages/leads/leads',
      policy: '/pages/timeline/timeline',
      chat: '/pages/chat/chat',
      client: '/pages/clients/clients',
      case: '/pages/case-workbench/case-workbench',
      caseLib: '/pages/cases-library/cases-library',
      calc: '/pages/calculator/calculator',
      assess: '/pages/assessment/assessment',
      doc: '/pages/documents/documents',
      review: '/pages/policy-review/policy-review',
      partner: '/pages/partners/partners',
      script: '/pages/scripts/scripts',
      fees: '/pages/fees/fees',
      reicalc: '/pages/rei-calc/rei-calc',
      renewal: '/pages/renewal/renewal',
      compare: '/pages/compare/compare',
      landing: '/pages/landing/landing',
      dashboard: '/pages/dashboard/dashboard',
      realEstateIssues: '/pages/real-estate-issues/real-estate-issues'
    };
    if (routes[key]) wx.navigateTo({ url: routes[key] });
    else wx.showToast({ title: '準備中', icon: 'none' });
  },

  goPolicyReview() {
    wx.navigateTo({ url: '/pages/policy-review/policy-review' });
  },

  goTimeline() {
    wx.navigateTo({ url: '/pages/timeline/timeline' });
  },

  goClients() {
    wx.navigateTo({ url: '/pages/clients/clients' });
  },

  goClientDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/client-detail/client-detail?id=' + id });
  },

  goClient(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/client-detail/client-detail?id=' + id });
    else wx.navigateTo({ url: '/pages/clients/clients' });
  }
});
