const localData = require('../../utils/local-data.js');
const storage = require('../../utils/storage.js');

Page({
  data: {
    stats: { activeCases: 0, pendingTasks: 0, pendingLeads: 0, closedCases: 0 },
    stageBars: [],
    feed: [],
    pathDist: []
  },

  onShow() { this.load(); },

  load() {
    // 纯本地模式：从storage读客户数据，从local-data读内置案例
    const clients = storage.getList('clients');
    const evaluating = clients.filter(c => c.stage === 'evaluating').length;
    const active = clients.filter(c => c.stage === 'executing' || c.stage === 'landed').length;
    const closed = clients.filter(c => c.stage === 'closed').length;
    const total = clients.length || 1;

    this.setData({
      stats: {
        activeCases: active,
        pendingTasks: 3,
        pendingLeads: evaluating,
        closedCases: closed,
        totalLeads: clients.length
      },
      stageBars: [
        { label: '評価中', count: evaluating, pct: Math.round(evaluating / total * 100) },
        { label: '執行中', count: active, pct: Math.round(active / total * 100) },
        { label: '已結案', count: closed, pct: Math.round(closed / total * 100) }
      ],
      pathDist: [
        { label: '政策数', count: localData.policies.length },
        { label: '案例数', count: localData.cases.length },
        { label: '文书模板', count: localData.documents.length },
        { label: '合规红线', count: localData.compliance.length }
      ],
      feed: localData.cases.slice(0, 3).map(c => ({
        title: c.title,
        date: c.result,
        type: c.type === 'success' ? '成功' : '不许可'
      }))
    });
  }
});
