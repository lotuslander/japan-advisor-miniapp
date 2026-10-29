/**
 * 政策审核（純本地モード）
 *
 * 原实现只有列表/详情读取与 goDetail、saveReview，wxml 中的
 * copyUrl / onCapitalInput / onJapaneseInput / onEmployeeChange /
 * onExpertChange / onTransitionInput / onImpactInput / doApprove / doReject
 * 共 9 个绑定全部断裂，loading / error 两个状态字段也缺失。
 *
 * 本版本补全全部交互，并把审核结论持久化到本地 storage（key: policyReviews），
 * 使「确认生效 / 驳回」在本地模式下也有实际效果，列表状态随之更新。
 */

const localData = require('../../utils/local-data.js');
const aiUpdater = require('../../utils/ai-updater.js');

const REVIEW_KEY = 'policyReviews';

Page({
  data: {
    id: '',
    mode: 'list',
    loading: false,
    error: false,
    list: [],
    policy: null,
    form: {
      capital_min_jpy_wan: '',
      japanese_level: '',
      employee_required: true,
      expert_review: true,
      transition_until: '',
      impact: ''
    }
  },

  onLoad(options) {
    if (options && options.id) {
      this.setData({ id: options.id, mode: 'detail' });
      this.loadDetail(options.id);
    } else {
      this.loadList();
    }
  },

  onShow() {
    // 从详情页返回时刷新列表状态
    if (this.data.mode === 'list' && this.data.list.length > 0) {
      this.loadList();
    }
  },

  // ---------------- 读取 ----------------

  loadList() {
    this.setData({ loading: true, error: false });
    try {
      const reviews = this.readReviews();

      const visaPolicies = (localData.policies || []).map(p => {
        const review = reviews[p.id];
        return {
          ...p,
          _id: p.id,
          published_at: p.date,
          source_name_zh: p.source,
          status: review ? review.status : 'effective',
          statusLabel: this.statusLabel(review ? review.status : 'effective'),
          catLabel: p.directionLabel || '签证政策',
          has_ai: !!p.summary
        };
      });

      const reiPolicies = (localData.realEstatePolicies || []).map(p => {
        const review = reviews[p.id];
        return {
          ...p,
          _id: p.id,
          title_zh: p.title,
          title_ja: '',
          published_at: p.published_at || '2026',
          source_name_zh: p.source || '不动产政策',
          status: review ? review.status : 'effective',
          statusLabel: this.statusLabel(review ? review.status : 'effective'),
          catLabel: '不动产政策',
          has_ai: !!p.summary
        };
      });

      // AI 端侧更新得到的政策：默认进入「待核验」，人工确认后才算生效
      const aiPolicies = aiUpdater.readPolicies().map((p) => {
        const review = reviews[p.id];
        const status = review ? review.status : 'pending_review';
        return {
          ...p,
          _id: p.id,
          published_at: p.date || '',
          source_name_zh: p.source || 'AI 整理',
          status: status,
          statusLabel: review ? this.statusLabel(status) : '待核验',
          catLabel: 'AI 联网整理',
          has_ai: true
        };
      });

      this.setData({
        list: [...aiPolicies, ...visaPolicies, ...reiPolicies],
        loading: false,
        error: false
      });
    } catch (err) {
      console.error('[policy-review] loadList failed', err);
      this.setData({ list: [], loading: false, error: true });
    }
  },

  loadDetail(id) {
    const targetId = id || this.data.id;
    const reviews = this.readReviews();
    const review = reviews[targetId];

    let policy = (localData.policies || []).find(p => p.id === targetId);
    let catLabel = policy ? (policy.directionLabel || '签证政策') : '';

    // AI 更新条目优先在本地 AI 政策库里找
    let isAI = false;
    let aiRecord = null;
    if (!policy) {
      aiRecord = aiUpdater.readPolicies().find(p => p.id === targetId);
      if (aiRecord) {
        policy = {
          ...aiRecord,
          date: aiRecord.date || '',
          source: aiRecord.source || 'AI 整理'
        };
        catLabel = 'AI 联网整理';
        isAI = true;
      }
    }

    if (!policy) {
      const rei = (localData.realEstatePolicies || []).find(p => p.id === targetId);
      if (rei) {
        policy = {
          ...rei,
          title_zh: rei.title,
          title_ja: '',
          date: rei.published_at || '2026',
          source: rei.source || '不动产政策'
        };
        catLabel = '不动产政策';
      }
    }

    if (!policy) {
      wx.showToast({ title: '政策不存在', icon: 'none' });
      this.setData({ policy: null });
      return;
    }

    // 已审核过的政策回填结构化字段
    const form = Object.assign({
      capital_min_jpy_wan: '',
      japanese_level: '',
      employee_required: true,
      expert_review: true,
      transition_until: '',
      impact: ''
    }, (review && review.form) || {});

    this.setData({
      id: targetId,
      policy: {
        ...policy,
        published_at: policy.date,
        source_name_zh: policy.source,
        catLabel,
        url: policy.url || policy.source_url || '',
        isAI: isAI,
        verified: policy.verified === true,
        status: review ? review.status : (isAI ? 'pending_review' : 'effective'),
        statusLabel: review
          ? this.statusLabel(review.status)
          : (isAI ? '待核验' : '现行')
      },
      form
    });
  },

  // ---------------- 表单输入 ----------------

  onCapitalInput(e) {
    this.setData({ 'form.capital_min_jpy_wan': e.detail.value });
  },

  onJapaneseInput(e) {
    this.setData({ 'form.japanese_level': e.detail.value });
  },

  onEmployeeChange(e) {
    this.setData({ 'form.employee_required': e.detail.value });
  },

  onExpertChange(e) {
    this.setData({ 'form.expert_review': e.detail.value });
  },

  onTransitionInput(e) {
    this.setData({ 'form.transition_until': e.detail.value });
  },

  onImpactInput(e) {
    this.setData({ 'form.impact': e.detail.value });
  },

  // ---------------- 动作 ----------------

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/policy-review/policy-review?id=' + id });
  },

  /** 复制原文链接；本地模式无直达链接时退化为复制出处 */
  copyUrl() {
    const policy = this.data.policy || {};
    const text = policy.url || policy.source_url || policy.source_name_zh || '';
    if (!text) {
      wx.showToast({ title: '暂无出处信息', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({
          title: policy.url || policy.source_url ? '链接已复制' : '出处已复制',
          icon: 'none'
        });
      },
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
    });
  },

  /** 确认生效 */
  doApprove() {
    const policy = this.data.policy;
    if (!policy) return;

    const form = this.data.form;
    const capital = (form.capital_min_jpy_wan || '').trim();
    if (capital && !/^\d+$/.test(capital)) {
      wx.showToast({ title: '最低资本金需为数字', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认生效',
      content: '确认后将写入结构化字段，并标记为「现行」。',
      confirmText: '确认',
      success: (res) => {
        if (!res.confirm) return;
        this.writeReview(policy.id || this.data.id, 'effective', form);
        wx.showToast({ title: '已确认生效', icon: 'success' });
        setTimeout(() => wx.navigateBack({ delta: 1 }), 600);
      }
    });
  },

  /** 驳回 */
  doReject() {
    const policy = this.data.policy;
    if (!policy) return;
    const id = policy.id || this.data.id;

    wx.showModal({
      title: '驳回该政策',
      content: '驳回后不会进入现行库，但会保留留痕可追溯。',
      confirmText: '驳回',
      confirmColor: '#C04851',
      success: (res) => {
        if (!res.confirm) return;
        this.writeReview(id, 'rejected', this.data.form);
        wx.showToast({ title: '已驳回', icon: 'none' });
        setTimeout(() => wx.navigateBack({ delta: 1 }), 600);
      }
    });
  },

  /** 兼容旧绑定：本地模式提示 */
  // ---------------- 本地持久化 ----------------

  readReviews() {
    try {
      return wx.getStorageSync(REVIEW_KEY) || {};
    } catch (err) {
      return {};
    }
  },

  writeReview(id, status, form) {
    if (!id) return;
    try {
      const reviews = this.readReviews();
      reviews[id] = {
        status,
        form: {
          capital_min_jpy_wan: form.capital_min_jpy_wan || '',
          japanese_level: form.japanese_level || '',
          employee_required: !!form.employee_required,
          expert_review: !!form.expert_review,
          transition_until: form.transition_until || '',
          impact: form.impact || ''
        },
        reviewedAt: Date.now()
      };
      wx.setStorageSync(REVIEW_KEY, reviews);
    } catch (err) {
      console.error('[policy-review] writeReview failed', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  statusLabel(status) {
    const map = {
      effective: '现行',
      pending_review: '待审',
      rejected: '已驳回'
    };
    return map[status] || '现行';
  }
});
