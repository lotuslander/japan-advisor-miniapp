// 签证全流程timeline：每阶段平均天数
const TIMELINE = {
  business_manager: {
    name: '经营管理签',
    stages: [
      { stage: '初回相談', days: 7, desc: '需求面谈、可行性初判' },
      { stage: '企画書作成', days: 30, desc: '事业计划书+专家盖章' },
      { stage: '法人設立', days: 14, desc: '株式会社登记+资本金打入' },
      { stage: 'COE申請', days: 60, desc: '入管交付证明书（平均2-3个月）' },
      { stage: 'ビザ発給', days: 7, desc: '驻华使领馆换签证' },
      { stage: '来日・住居', days: 14, desc: '落地、区役所登记、银行开户' },
      { stage: '初回審査', days: 365, desc: '1年后更新（2025新规看实态）' }
    ]
  },
  hsp: {
    name: '高度人才',
    stages: [
      { stage: '初回相談', days: 7, desc: '积分初算' },
      { stage: '書類準備', days: 30, desc: '学历认证、在职证明、收入证明' },
      { stage: 'COE申請', days: 45, desc: '高度人才审查快（1-2个月）' },
      { stage: 'ビザ発給', days: 7, desc: '换签证' },
      { stage: '来日', days: 14, desc: '落地' },
      { stage: '永住申請', days: 365, desc: 'J-Skip 80分1年后；70分3年后' }
    ]
  },
  pr: {
    name: '永住',
    stages: [
      { stage: '要件確認', days: 14, desc: '年数/年收/纳税/社保自查' },
      { stage: '書類準備', days: 60, desc: '理由书+5年纳税证明+历年履历' },
      { stage: '申請', days: 120, desc: '入管审查（4-8个月）' },
      { stage: '許可通知', days: 30, desc: '收到许可通知后去入管换卡' },
      { stage: '完了', days: 7, desc: '拿到新在留卡（永住者）' }
    ]
  },
  family: {
    name: '家族签证',
    stages: [
      { stage: '初回相談', days: 7, desc: '婚姻真实性评估' },
      { stage: '書類準備', days: 30, desc: '婚姻证明、照片、同居证据' },
      { stage: 'COE申請', days: 60, desc: '入管审查（会电话核实）' },
      { stage: 'ビザ発給', days: 7, desc: '换签证' },
      { stage: '来日', days: 14, desc: '落地同居' },
      { stage: '更新', days: 365, desc: '3年更新一次' }
    ]
  },
  realestate: {
    name: '不动产投资',
    stages: [
      { stage: '物件選定', days: 30, desc: '选房+实地看房' },
      { stage: '資金計画', days: 14, desc: '融资/全款准备' },
      { stage: '契約', days: 7, desc: '重要事项说明+签约' },
      { stage: '決済・登記', days: 14, desc: '尾款+所有权转移登记' },
      { stage: '管理開始', days: 7, desc: '管理会社签约+招租' },
      { stage: '運用', days: 3650, desc: '长期持有（10年+）' }
    ]
  }
};

exports.main = async (event) => {
  if (event.path && TIMELINE[event.path]) {
    return { ok: true, timeline: TIMELINE[event.path] };
  }
  return { ok: true, all: TIMELINE };
};
