const storage = require('../../utils/storage.js');
Page({
  data: {
    clientId: '',
    client: { name: '', stage: 'evaluating', stageLabel: '', tags: [], tagsText: '', occupation: '', annual_income_jpy: 0 },
    cases: [],
    pendingTasks: [],
    pendingCount: 0,
    notes: [],
    noteContent: '',
    nextFollowupAt: '',
    noteKind: 'contact',
    noteKinds: [
      { key: 'contact', label: '沟通' },
      { key: 'material', label: '材料' },
      { key: 'decision', label: '决策' },
      { key: 'note', label: '备注' }
    ],
    submitting: false,
    // 沟通日志
    commLogs: [],
    commNote: '',
    commType: '',
    commTypeLabel: '',
    commTypes: ['初回相談', '電話', 'LINE', 'メール', '面談', '進捗報告', '書類送付', 'その他']
  },

  onCommNote(e) { this.setData({ commNote: e.detail.value }); },
  onCommType(e) {
    const t = this.data.commTypes[e.detail.value];
    this.setData({ commType: t, commTypeLabel: t });
  },

  onClientEdit(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ [`client.${k}`]: e.detail.value });
  },

  toggleTag(e) {
    const tag = e.currentTarget.dataset.tag;
    let tags = this.data.client.tags || [];
    if (tags.includes(tag)) {
      tags = tags.filter(t => t !== tag);
    } else {
      tags.push(tag);
    }
    this.setData({ 'client.tags': tags });
  },

  addComm() {
    if (!this.data.commNote.trim()) {
      wx.showToast({ title: '请填沟通内容', icon: 'none' });
      return;
    }
    const log = {
      date: new Date().toLocaleDateString('zh-CN'),
      type: this.data.commType || '其他',
      note: this.data.commNote.trim(),
      created_at: new Date().toISOString()
    };

    // 写入客户记录的 comm_logs，否则离开本页就丢
    const clients = storage.getList('clients');
    const idx = clients.findIndex(c => c.id === this.data.clientId);
    if (idx >= 0) {
      if (!Array.isArray(clients[idx].comm_logs)) clients[idx].comm_logs = [];
      clients[idx].comm_logs.unshift(log);
      wx.setStorageSync('clients', clients);
    }

    this.setData({
      commLogs: [{
        _id: log.created_at,
        date: log.date,
        type: log.type,
        note: log.note
      }].concat(this.data.commLogs),
      commNote: '',
      commType: '',
      commTypeLabel: ''
    });
    wx.showToast({ title: '已记录', icon: 'success' });
  },

  genReport() {
    // 纯本地模式：简单生成报告
    const c = this.data.client;
    const report = `【客户进度报告】\n客户：${c.name}\n当前阶段：${this.stageLabel(c.stage)}\n更新时间：${new Date().toLocaleDateString()}\n\n感谢您选择我们的服务，如有疑问请随时联系。`;
    wx.setClipboardData({
      data: report,
      success: () => wx.showToast({ title: '报告已复制', icon: 'success' })
    });
  },

  onLoad(options) {
    this.setData({ clientId: options.id || '' });
  },

  // 每次回到本页都重新读：从「新建案件 / 添加记录」返回时才能看到最新数据
  onShow() {
    if (this.data.clientId) this.loadClient();
  },

  loadClient() {
    const clients = storage.getList('clients');
    const client = clients.find(c => c.id === this.data.clientId);
    if (!client) {
      wx.showToast({ title: '客户不存在', icon: 'none' });
      return;
    }

    const notes = (client.notes || []).map((n, i) => ({
      _id: n.created_at || ('note-' + i),
      kindLabel: this.kindLabel(n.kind),
      date: String(n.created_at || '').slice(0, 10),
      content: n.content || '',
      next_followup_at: n.next_followup_at || ''
    }));

    // 待办：带「下次跟进时间」的记录
    const pendingTasks = notes
      .filter(n => n.next_followup_at)
      .map(n => ({ _id: n._id, title: n.content, due_date: n.next_followup_at }));

    // 关联案件：按 client_id 关联；老案件没有 client_id 时退回按姓名匹配
    const allCases = storage.getList('customCases');
    const cases = allCases
      .filter(c => c && (c.client_id === this.data.clientId
        || (!c.client_id && c.client_name && c.client_name === client.name)))
      .map(c => ({
        case_id: c.id,
        pathLabel: this.pathLabel(c.path),
        started_at: String(c.created_at || '').slice(0, 10),
        expected_result_at: c.expected || '—'
      }));

    const commLogs = (client.comm_logs || []).map((g, i) => ({
      _id: g.created_at || ('comm-' + i),
      date: g.date || String(g.created_at || '').slice(0, 10),
      type: g.type || '其他',
      note: g.note || ''
    }));

    this.setData({
      client: Object.assign({}, client, {
        stageLabel: this.stageLabel(client.stage),
        tags: client.tags || [],
        tagsText: (client.tags || []).join(' · ') || '待补充'
      }),
      cases,
      notes,
      pendingTasks,
      pendingCount: pendingTasks.length,
      commLogs
    });
  },

  stageLabel(stage) {
    const map = { evaluating: '評価中', confirmed: '契約済', executing: '執行中', landed: '落地中', closed: '完了' };
    return map[stage] || stage;
  },

  pathLabel(path) {
    const map = {
      bm: '経営管理ビザ',
      business_manager: '経営管理ビザ',
      hsp: '高度専門職',
      pr: '永住申請',
      work: '技術・人文知識・国際業務',
      family: '家族滞在',
      realestate: '不動産取得'
    };
    return map[path] || path || '—';
  },

  kindLabel(kind) {
    const map = { contact: '沟通', material: '材料', decision: '决策', note: '备注' };
    return map[kind] || '沟通';
  },

  // ── 跟进记录 ──
  onNoteInput(e) { this.setData({ noteContent: e.detail.value }); },
  onNextFollowup(e) { this.setData({ nextFollowupAt: e.detail.value }); },

  setNoteKind(e) { this.setData({ noteKind: e.currentTarget.dataset.k }); },

  async addNote() {
    const content = (this.data.noteContent || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入记录内容', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    const clients = storage.getList('clients');
    const idx = clients.findIndex(c => c.id === this.data.clientId);
    if (idx >= 0) {
      if (!clients[idx].notes) clients[idx].notes = [];
      clients[idx].notes.push({
        content: content,
        kind: this.data.noteKind,
        next_followup_at: this.data.nextFollowupAt || '',
        created_at: new Date().toISOString()
      });
      wx.setStorageSync('clients', clients);
    }

    // 清空输入并重新加载，让「跟进记录 / 待办任务」立即刷新
    this.setData({ noteContent: '', nextFollowupAt: '', submitting: false });
    this.loadClient();
    wx.showToast({ title: '已记录', icon: 'success' });
  },

  goCase(e) {
    const caseId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/case-workbench/case-workbench?id=' + caseId });
  },

  goNewCase() {
    wx.navigateTo({
      url: '/pages/case-new/case-new?clientId=' + this.data.clientId + '&clientName=' + (this.data.client.name || '')
    });
  },

  goAssess() {
    const c = this.data.client;
    const tags = (c.tags || []).join(',');
    let path = 'business_manager';
    if (tags.includes('高度') || tags.includes('高才')) path = 'hsp';
    else if (tags.includes('永住')) path = 'pr';
    else if (tags.includes('房产') || tags.includes('不动产')) path = 'realestate';
    const q = [
      'clientId=' + (this.data.clientId || ''),
      'name=' + encodeURIComponent(c.name || ''),
      'path=' + path,
      'income=' + (c.annual_income_jpy || '')
    ].join('&');
    wx.navigateTo({ url: '/pages/assessment/assessment?' + q });
  },

  copyReferral() {
    const code = this.data.client.referralCode || 'JP-' + this.data.clientId;
    wx.setClipboardData({ data: code, success: () => wx.showToast({ title: '推荐码已复制', icon: 'success' }) });
  },

  shareReferral() {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    wx.showToast({ title: '点右上角分享给朋友', icon: 'none' });
  },

  onShareAppMessage() {
    const code = this.data.client.referralCode || 'JP-' + this.data.clientId;
    return {
      title: '我在日本移民置业有专属顾问，推荐你也聊聊',
      path: '/pages/leads/leads?ref=' + code
    };
  }
});
