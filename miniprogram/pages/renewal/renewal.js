// 经营管理签续签检查清单（2025-10-16 新规后）
Page({
  data: {
    groups: [
      {
        title: '决算与经营实态',
        items: [
          { text: '决算期赤字非持续，营业利润/分红有合理性', tip: '连续赤字易被质疑事业实态' },
          { text: '事业内容与申请时事业计划书一致或有合理变更说明', tip: '明显偏离事业计划书需补说明' },
          { text: '有实际营业记录（发票/合同/客户往来）', tip: '空壳公司是补正重灾区' },
          { text: '资本金/运营资金未长期休眠', tip: '资金在账户躺着不动会被质疑' }
        ]
      },
      {
        title: '纳税与社会保险',
        items: [
          { text: '法人税/消费税按期申告并缴纳', tip: '滞纳是续签不许可高频原因' },
          { text: '源泉徴収按月缴纳（若雇用员工）', tip: '未缴会被要求补税' },
          { text: '代表者与常勤职员加入社会保険', tip: '2025 后社保加入审查趋严' },
          { text: '住民税·个人所得税无滞纳', tip: '申请人个人纳税记录同步核查' }
        ]
      },
      {
        title: '事务所与人员（新规硬要求）',
        items: [
          { text: '事务所租赁合同在有效期内', tip: '自宅兼事务所原则上不认可' },
          { text: '事务所实态照片（门牌/办公区/设备）', tip: '补正时必交' },
          { text: '常勤职员 1 名以上（或申请人一方满足日语 B2）', tip: '新规硬性要求，2025-10-16 起' },
          { text: '申请人本人或常勤职员具备日语 B2（N2/BJT400）', tip: '任一方满足即可' }
        ]
      },
      {
        title: '申请人与材料',
        items: [
          { text: '申请人居住実态与在留地一致', tip: '长期不在日会被质疑' },
          { text: '履历/职务内容更新（最新 1 期决算）', tip: '与初申请比对变化点' },
          { text: '无刑事处分/重大违反届出义务', tip: '素行要件' },
          { text: '确认过渡期：旧持卡人更新不因新规一票否决（至 2028-10-16）', tip: '过渡期内旧标准续期，更新时仍需满足基本要件' }
        ]
      }
    ],
    done: {}
  },

  onLoad() {
    try {
      const saved = wx.getStorageSync('renewal_done') || {};
      this.setData({ done: saved });
    } catch (e) {}
  },

  toggle(e) {
    const { gi, ii } = e.currentTarget.dataset;
    const key = gi + '_' + ii;
    const done = { ...this.data.done, [key]: !this.data.done[key] };
    this.setData({ done });
    try { wx.setStorageSync('renewal_done', done); } catch (e) {}
  },

  reset() {
    wx.showModal({
      title: '清空勾选？',
      content: '所有检查项将重置为未完成。',
      success: (r) => {
        if (r.confirm) {
          this.setData({ done: {} });
          try { wx.removeStorageSync('renewal_done'); } catch (e) {}
        }
      }
    });
  }
});
