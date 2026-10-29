const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 默认任务模板：按签证路径生成
const TASK_TEMPLATES = {
  business_manager: [
    { title: '事业计划书专家确认（中小企业诊断士）', urgent: true, sort: 1 },
    { title: '资本金 3000 万日元入金证明', urgent: true, sort: 2 },
    { title: '事务所租赁合同签订 + 实态照片', urgent: true, sort: 3 },
    { title: '常勤职员 1 名雇佣 + 社保加入', urgent: false, sort: 4 },
    { title: '申请人或职员日语 B2 证书确认', urgent: false, sort: 5 },
    { title: '法人设立登记（登记事项证明书）', urgent: false, sort: 6 },
    { title: '公司银行账户开户', urgent: false, sort: 7 },
    { title: '入管厅 COE 递交（预计）', urgent: false, sort: 8 },
    { title: 'COE 取得后在留资格认定申请', urgent: false, sort: 9 }
  ],
  hsp: [
    { title: '积分计算表自算 + 专家核验', urgent: true, sort: 1 },
    { title: '学历证明（毕业证明+学位）', urgent: false, sort: 2 },
    { title: '职历证明（在职/离职证明）', urgent: false, sort: 3 },
    { title: '年收证明（源泉徴収票/课税证明）', urgent: false, sort: 4 },
    { title: '日语证书（N1/N2/BJT）', urgent: false, sort: 5 },
    { title: '雇用证明书（雇主出具）', urgent: false, sort: 6 },
    { title: '入管厅递交', urgent: false, sort: 7 }
  ],
  pr: [
    { title: '纳税证明 5 年分（住民税+国税）', urgent: true, sort: 1 },
    { title: '年金加入记录（直近）', urgent: true, sort: 2 },
    { title: '理由书起草', urgent: false, sort: 3 },
    { title: '在留履历确认（各在留期间连续）', urgent: false, sort: 4 },
    { title: '健康保险证 + 标记缴纳记录', urgent: false, sort: 5 },
    { title: '入管厅递交', urgent: false, sort: 6 }
  ],
  realestate: [
    { title: '资金来源证明（完税+银行流水）', urgent: true, sort: 1 },
    { title: '不动产购买契约书', urgent: false, sort: 2 },
    { title: '非居住者：外汇法 20 天报告（如适用）', urgent: false, sort: 3 },
    { title: '登记相关资料（司法书士对接）', urgent: false, sort: 4 }
  ]
};

// 默认材料模板
const DOC_TEMPLATES = {
  business_manager: [
    { name: '护照复印件', status: 'pending' },
    { name: '在留资格认定申请书', status: 'pending' },
    { name: '履历书（最终学历·职历）', status: 'pending' },
    { name: '事业计划书（专家确认版）', status: 'pending' },
    { name: '资本金入金证明（3000 万）', status: 'pending' },
    { name: '事务所租赁合同 + 实态照片', status: 'pending' },
    { name: '常勤职员雇佣合同 + 社保加入证明', status: 'pending' },
    { name: '法人登记簿誊本', status: 'pending' },
    { name: '专家确认书（诊断士/税理士）', status: 'pending' },
    { name: '公司银行账户残高证明', status: 'pending' }
  ],
  hsp: [
    { name: '护照复印件', status: 'pending' },
    { name: '在留资格变更申请书', status: 'pending' },
    { name: '积分计算表（专家核验版）', status: 'pending' },
    { name: '学历证明（毕业+学位）', status: 'pending' },
    { name: '职历证明', status: 'pending' },
    { name: '年收证明（源泉徴収票）', status: 'pending' },
    { name: '日语证书（N1/N2）', status: 'pending' },
    { name: '雇用证明书', status: 'pending' }
  ],
  pr: [
    { name: '护照 + 在留卡复印件', status: 'pending' },
    { name: '永住许可申请书', status: 'pending' },
    { name: '理由书', status: 'pending' },
    { name: '纳税证明 5 年分', status: 'pending' },
    { name: '年金加入记录', status: 'pending' },
    { name: '健康保险证复印件', status: 'pending' },
    { name: '在职证明 / 营业证明', status: 'pending' }
  ],
  realestate: [
    { name: '护照复印件', status: 'pending' },
    { name: '购买契约书', status: 'pending' },
    { name: '资金来源证明（完税+流水）', status: 'pending' },
    { name: '外汇法 20 天报告（非居住者）', status: 'pending' },
    { name: '登记相关资料', status: 'pending' }
  ]
};

function dueDateFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

exports.main = async (event) => {
  const { client_name, path, package_price_jpy, deposit_jpy, expected_result_at } = event;
  if (!client_name) return { ok: false, error: '客户姓名必填' };

  try {
    const openid = cloud.getWXContext().OPENID || '';
    const caseId = 'case_' + Date.now();
    const res = await db.collection('cases').add({
      data: {
        case_id: caseId,
        client_name,
        path: path || 'business_manager',
        stage: 'evaluating',
        package_price_jpy: package_price_jpy || 0,
        deposit_jpy: deposit_jpy || 0,
        expected_result_at: expected_result_at || '',
        started_at: new Date().toISOString().slice(0, 10),
        score_estimate: null,
        owner_openid: openid,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });

    // 同步生成默认任务
    const tasks = TASK_TEMPLATES[path] || TASK_TEMPLATES.business_manager;
    for (const t of tasks) {
      await db.collection('case_tasks').add({
        data: {
          case_id: caseId,
          title: t.title,
          due_date: dueDateFromNow(t.sort * 10),
          urgent: t.urgent,
          done: false,
          sort: t.sort,
          owner_openid: openid
        }
      });
    }

    // 同步生成默认材料清单
    const docs = DOC_TEMPLATES[path] || DOC_TEMPLATES.business_manager;
    for (const d of docs) {
      await db.collection('case_documents').add({
        data: { case_id: caseId, name: d.name, status: d.status, owner_openid: openid }
      });
    }

    return { ok: true, id: res._id, case_id: caseId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
