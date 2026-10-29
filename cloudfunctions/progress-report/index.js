// 档期报告生成器：一键生成客户进度报告（HTML格式，可转发微信/邮件）
exports.main = async (event) => {
  const c = event.client || {};
  const stageMap = {
    lead: '初回相談', evaluating: '资格评估', confirmed: '契約締結',
    documents: '書類準備', submitted: '提出済', reviewing: '審査中',
    approved: '許可', rejected: '不許可', landed: '来日・住居', closed: '完了'
  };
  const currentStage = stageMap[c.stage] || c.stage || '初回相談';

  // 8阶段鱼骨图
  const stages = ['lead', 'evaluating', 'confirmed', 'documents', 'submitted', 'reviewing', 'approved', 'landed', 'closed'];
  const stageLabels = ['初回相談', '資格評価', '契約締結', '書類準備', '提出済', '審査中', '許可/不許可', '来日・住居', '完了'];
  const currentIdx = stages.indexOf(c.stage) >= 0 ? stages.indexOf(c.stage) : 0;

  let fishbone = '';
  for (let i = 0; i < stages.length; i++) {
    const cls = i < currentIdx ? 'done' : (i === currentIdx ? 'current' : 'todo');
    fishbone += `<div class="stage ${cls}"><div class="dot"></div><div class="lbl">${stageLabels[i]}</div></div>`;
  }

  // 下一步动作
  const nextActions = {
    lead: '安排初回相談（30分钟免费咨询）',
    evaluating: '提交客户资料做资格评估（3个工作日）',
    confirmed: '签约+支付30%服务费',
    documents: '准备申请材料（1-2个月）',
    submitted: '等待入管审查（2-6个月）',
    reviewing: '审查中，保持电话畅通',
    approved: '拿到COE，去驻华使领馆换签证',
    landed: '落地日本，区役所登记+银行开户',
    closed: '案子结束，感谢信任'
  };

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { font-family: -apple-system, "Hiragino Sans", "Noto Sans CJK JP", sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #F8F4EC; }
.header { background: #C04851; color: #fff; padding: 20px; text-align: center; }
.header h1 { margin: 0; font-size: 20px; }
.client { background: #fff; padding: 20px; margin: 10px 0; border-left: 4px solid #C04851; }
.client h2 { margin: 0 0 10px; font-size: 16px; color: #C04851; }
.fishbone { background: #fff; padding: 20px; margin: 10px 0; }
.stage { display: inline-block; text-align: center; width: 60px; vertical-align: top; }
.stage .dot { width: 16px; height: 16px; border-radius: 50%; margin: 0 auto 5px; }
.stage.done .dot { background: #4a9d5b; }
.stage.current .dot { background: #E8A838; box-shadow: 0 0 0 4px rgba(232,168,56,0.3); }
.stage.todo .dot { background: #ddd; }
.stage .lbl { font-size: 10px; color: #666; }
.next { background: #fff8e8; padding: 20px; margin: 10px 0; border-left: 4px solid #E8A838; }
.next h3 { margin: 0 0 10px; font-size: 14px; color: #E8A838; }
.footer { text-align: center; font-size: 12px; color: #999; padding: 20px; }
</style></head>
<body>
<div class="header">
  <h1>顧問進捗レポート</h1>
  <div>${new Date().toLocaleDateString('zh-CN')}</div>
</div>
<div class="client">
  <h2>${c.name || '尊敬的客户'}</h2>
  <div>当前阶段：<strong style="color:#C04851">${currentStage}</strong></div>
  <div>申请路径：${c.path || '待定'}</div>
</div>
<div class="fishbone">
  <h3>📋 进度主线</h3>
  ${fishbone}
</div>
<div class="next">
  <h3>➡️ 下一步动作</h3>
  <div>${nextActions[c.stage] || '顾问将主动联系您'}</div>
</div>
<div class="footer">
  此报告由 Japan Advisor 自动生成<br/>
  如有疑问请联系您的顾问
</div>
</body></html>`;

  return {
    ok: true,
    report: {
      client_name: c.name,
      current_stage: currentStage,
      next_action: nextActions[c.stage] || '',
      html: html
    }
  };
};
