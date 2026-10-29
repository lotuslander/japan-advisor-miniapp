// 不动产收益测算完整版：表面利回/净利回 + 一次性税费明细 + 持有成本 + 5/10年回报
Page({
  data: {
    form: {
      price_wan: '',        // 物件价格 万日元
      rent_wan: '',         // 月租金 万日元
      mgmt: '',             // 月管理费+修缮金 日元
      property_tax: '',     // 年固定资产税·都市计划税 日元
      vacancy: '',          // 空室率 %
      management_fee: '',   // 托管费占租金比例 %
      repair_reserve: ''    // 年修缮预备金 日元
    },
    result: null
  },

  onLoad() { this.calc(); },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value });
    this.calc();
  },

  calc() {
    const f = this.data.form;
    const price = Number(f.price_wan) * 10000;
    const rent = Number(f.rent_wan) * 10000;
    const mgmt = Number(f.mgmt) || 0;
    const pTax = Number(f.property_tax) || 0;
    const vacancy = Number(f.vacancy) || 0;
    const mgmtFeePct = Number(f.management_fee) || 0;
    const repairReserve = Number(f.repair_reserve) || 0;

    if (!price || !rent) { this.setData({ result: null }); return; }

    const yearGross = rent * 12;
    const surface = (yearGross / price * 100);

    // 年持有成本明细
    const yearMgmt = mgmt * 12;
    const vacancyLoss = yearGross * vacancy / 100;
    const yearMgmtFee = yearGross * mgmtFeePct / 100;
    const yearCost = yearMgmt + pTax + vacancyLoss + yearMgmtFee + repairReserve;
    const yearNet = yearGross - yearCost;

    // 一次性取得费用明细
    const brokerage = (price * 0.03 + 60000) * 1.1; // 中介费3%+6万+消费税
    const registrationTax = price * 0.02; // 登记许可税
    const acquisitionTax = price * 0.03; // 不动产取得税
    const stampTax = 10000; // 印花税（3000万档）
    const acquisitionCost = brokerage + registrationTax + acquisitionTax + stampTax;
    const totalInvest = price + acquisitionCost;

    const effective = (yearNet / totalInvest * 100);

    // 5年/10年总回报
    const fiveYearNet = yearNet * 5 - price * 0.1; // 假设5年房价跌10%
    const tenYearNet = yearNet * 10 + price * 0.2; // 假设10年房价涨20%

    this.setData({
      result: {
        yearGross: Math.round(yearGross).toLocaleString(),
        surface: surface.toFixed(2),
        yearMgmt: Math.round(yearMgmt).toLocaleString(),
        pTax: pTax.toLocaleString(),
        vacancyLoss: Math.round(vacancyLoss).toLocaleString(),
        yearMgmtFee: Math.round(yearMgmtFee).toLocaleString(),
        repairReserve: repairReserve.toLocaleString(),
        yearCost: Math.round(yearCost).toLocaleString(),
        yearNet: Math.round(yearNet).toLocaleString(),
        brokerage: Math.round(brokerage).toLocaleString(),
        registrationTax: Math.round(registrationTax).toLocaleString(),
        acquisitionTax: Math.round(acquisitionTax).toLocaleString(),
        stampTax: stampTax.toLocaleString(),
        acquisitionCost: Math.round(acquisitionCost).toLocaleString(),
        totalInvest: Math.round(totalInvest).toLocaleString(),
        effective: effective.toFixed(2),
        fiveYearNet: Math.round(fiveYearNet).toLocaleString(),
        tenYearNet: Math.round(tenYearNet).toLocaleString()
      }
    });
  }
});