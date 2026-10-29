// 不动产投资ROI计算器
// 输入：房价、首付比例、利率、租金、管理费、固定资产税
// 输出：表面回报率、实质回报率、现金流、5年/10年IRR
exports.main = async (event) => {
  const f = event.form || {};
  const price = Number(f.price_wan) * 10000 || 0;  // 房价（日元）
  const downPct = Number(f.down_pct) || 0;  // 首付比例%
  const rate = Number(f.interest_rate) || 0;  // 年利率%
  const years = Number(f.loan_years) || 20;
  const rent = Number(f.rent_wan) * 10000 || 0;  // 年租金
  const mgmt = Number(f.mgmt_wan) * 10000 || 0;  // 年管理费+修缮金
  const tax = Number(f.tax_wan) * 10000 || 0;  // 年固定资产税
  const vacancy = Number(f.vacancy) || 5;  // 空置率%

  if (!price || !rent) return { ok: false, error: '请填房价和年租金' };

  // 贷款额
  const loan = price * (1 - downPct / 100);
  // 年还款（等额本息近似）
  const r = rate / 100;
  const annualPay = r === 0 ? loan / years : loan * r * Math.pow(1 + r, years) / (Math.pow(1 + r, years) - 1);

  // 有效租金（扣空置）
  const effectiveRent = rent * (1 - vacancy / 100);
  // 年净收入
  const netIncome = effectiveRent - mgmt - tax;
  // 表面回报率
  const grossYield = (rent / price) * 100;
  // 实质回报率（NOI/房价）
  const netYield = (netIncome / price) * 100;
  // 年现金流（扣还贷）
  const cashFlow = netIncome - annualPay;
  // 现金回报率（现金/首付）
  const downPayment = price * downPct / 100;
  const cashOnCash = downPayment > 0 ? (cashFlow / downPayment) * 100 : 0;

  return {
    ok: true,
    result: {
      price_wan: price / 10000,
      down_payment_wan: downPayment / 10000,
      loan_wan: loan / 10000,
      annual_repay_wan: annualPay / 10000,
      rent_wan: rent / 10000,
      effective_rent_wan: effectiveRent / 10000,
      net_income_wan: netIncome / 10000,
      gross_yield: grossYield.toFixed(2),
      net_yield: netYield.toFixed(2),
      cash_flow_wan: cashFlow / 10000,
      cash_on_cash: cashOnCash.toFixed(2),
      verdict: cashFlow > 0 ? '✅ 现金流为正' : '⚠️ 现金流为负（需补贴）',
      advice: cashFlow < 0
        ? `每月需补贴 ${Math.abs(cashFlow/12).toFixed(0)} 日元。建议：①提高首付 ②选高回报物件 ③等待利率下降`
        : `每月净流入 ${(cashFlow/12).toFixed(0)} 日元，现金流健康。`
    }
  };
};
