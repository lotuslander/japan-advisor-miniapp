// 案件工作台：阶段推进 / 材料清单 / 待办任务
//
// 数据来源：customCases 里的用户案件（由 case-new 创建）。
// 材料清单按案件路径从内置 localData.visaChecklists 取，任务 = 尚未准备好的材料。
// 阶段与任务勾选状态持久化回 customCases，离开页面不丢。
const localData = require('../../utils/local-data.js');
const storage = require('../../utils/storage.js');

// 案件 path -> 内置清单的签证类型
const PATH_TO_VISA = {
  bm: '经营管理签',
  business_manager: '经营管理签',
  hsp: '高度人才',
  pr: '永住申请',
  work: '技术人文知识',
  family: ''
};

// 案件 stage -> 阶段条下标（stages: 咨询/评分/定案/执行/落地/归档）
const STAGE_INDEX = {
  evaluating: 1,
  confirmed: 2,
  executing: 3,
  landed: 4,
  closed: 5
};

Page({
  data: {
    stages: ['咨询', '评分', '定案', '执行', '落地', '归档'],
    stageIdx: 0,
    caseId: '',
    case: null,
    pathLabel: '',
    tasks: [],
    documents: []
  },

  onLoad(options) {
    this.setData({ caseId: options.id || '' });
  },

  // 每次回到本页重新读（从文书/客户页返回时能看到最新状态）
  onShow() {
    if (this.data.caseId) this.loadCase();
  },

  loadCase() {
    const cases = storage.getList('customCases');
    const caseItem = cases.find(c => c.id === this.data.caseId);
    if (!caseItem) {
      wx.showToast({ title: '案件不存在', icon: 'none' });
      return;
    }

    const documents = this.buildDocuments(caseItem);
    const doneMap = caseItem.task_done || {};
    const expected = caseItem.expected || '—';

    // 待办任务 = 尚未就绪的材料
    const tasks = documents
      .filter(d => d.status !== 'ready')
      .map(d => ({
        _id: d.name,
        title: '准备材料：' + d.name,
        done: !!doneMap[d.name],
        due_date: expected,
        urgent: false
      }));

    this.setData({
      // 映射到 wxml 期望的字段名（原来直接用原始记录，三行显示为空）
      case: Object.assign({}, caseItem, {
        started_at: String(caseItem.created_at || '').slice(0, 10) || '—',
        expected_result_at: expected,
        package_price_jpy: caseItem.price || 0
      }),
      pathLabel: this.pathLabel(caseItem.path),
      stageIdx: typeof caseItem.stage_idx === 'number'
        ? caseItem.stage_idx
        : (STAGE_INDEX[caseItem.stage] !== undefined ? STAGE_INDEX[caseItem.stage] : 0),
      documents,
      tasks
    });
  },

  /** 按案件路径取内置材料清单，并结合已保存的就绪状态 */
  buildDocuments(caseItem) {
    const visa = PATH_TO_VISA[caseItem.path] || '';
    const lists = localData.visaChecklists || [];
    const hit = visa ? lists.find(v => (v.visa_type || '').indexOf(visa) >= 0) : null;
    const statusMap = caseItem.doc_status || {};
    return (hit ? hit.materials : []).map(name => ({
      name,
      status: statusMap[name] || 'pending'
    }));
  },

  /** 把改动持久化回 customCases */
  updateCase(patch) {
    const cases = storage.getList('customCases');
    const idx = cases.findIndex(c => c.id === this.data.caseId);
    if (idx < 0) return;
    Object.assign(cases[idx], patch);
    wx.setStorageSync('customCases', cases);
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

  toggleTask(e) {
    const taskId = e.currentTarget.dataset.id;
    const tasks = this.data.tasks.map(t =>
      (t._id === taskId ? Object.assign({}, t, { done: !t.done }) : t)
    );

    // 勾选状态持久化（key=材料名），并把该材料标记为已就绪
    const doneMap = {};
    tasks.forEach(t => { if (t.done) doneMap[t._id] = true; });
    const docStatus = {};
    this.data.documents.forEach(d => {
      docStatus[d.name] = doneMap[d.name] ? 'ready' : (d.status === 'ready' ? 'ready' : 'pending');
    });

    this.updateCase({ task_done: doneMap, doc_status: docStatus });
    this.setData({
      tasks,
      documents: this.data.documents.map(d => Object.assign({}, d, {
        status: doneMap[d.name] ? 'ready' : d.status
      }))
    });
  },

  goTimeline() {
    wx.navigateTo({ url: '/pages/timeline/timeline' });
  },

  advanceStage() {
    // 老案件可能没有 stage 字段，按「评估中」处理，避免直接跳到结案
    const cur = (this.data.case && this.data.case.stage) || 'evaluating';
    const nextMap = {
      evaluating: 'confirmed',
      confirmed: 'executing',
      executing: 'landed'
    };
    const next = nextMap[cur];
    if (!next) {
      this.closeCase();
      return;
    }
    const nextLabel = {
      confirmed: '定案（签约）',
      executing: '执行（材料/申请）',
      landed: '落地（在留卡/定居）'
    }[next];

    wx.showModal({
      title: '推进阶段',
      content: '确认将案件推进到「' + nextLabel + '」？',
      success: (r) => {
        if (!r.confirm) return;
        this.updateCase({ stage: next, stage_idx: STAGE_INDEX[next] });
        this.loadCase();
        wx.showToast({ title: '已推进', icon: 'success' });
      }
    });
  },

  closeCase() {
    wx.showModal({
      title: '案件結案',
      content: '確認結案並歸檔？結案後案件會標記為已結束。',
      success: (r) => {
        if (!r.confirm) return;
        this.updateCase({ stage: 'closed', stage_idx: 5, closed_at: new Date().toISOString() });
        wx.showToast({ title: '已結案', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1200);
      }
    });
  }
});
