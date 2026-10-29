const storage = require('../../utils/storage.js');
// 文书工作台：理由书/事业计划书框架生成（本地模板组装，顾问补充后使用）
const TEMPLATES = {
  business_manager: {
    title: '在留資格認定証明書交付申請 · 理由書（框架）',
    sections: [
      { h: '一、申請人概要', t: ['氏名・年齢・国籍・現住所', '最終学歴・経営管理関連の経験（年数）', '日本語能力（N2/BJT400 等）'] },
      { h: '二、事業の概要', t: ['事業内容（業種・商品・サービス）', '市場分析と需要根拠', '売上・利益の見込み（3年間）'] },
      { h: '三、資本金と資金計画', t: ['資本金（法人の場合）/投下資金総額（個人の場合）', '資金の出所（預金履歴・売却・融資）', '入金・使用計画'] },
      { h: '四、事務所と従業員', t: ['事務所所在地・賃貸契約の状況', '常勤職員の雇用計画（1名以上）', '事業の実在性証明（写真・契約書）'] },
      { h: '五、専門家による確認', t: ['中小企業診断士・公認会計士・税理士による事業計画書確認', '確認書・証明書の添付'] },
      { h: '六、将来の見通し', t: ['経営の安定性と継続性', '地域経済への貢献', '納税・社会保険への対応方針'] }
    ]
  },
  hsp: {
    title: '高度専門職 在留資格申請 · 理由書（框架）',
    sections: [
      { h: '一、申請人概要', t: ['氏名・年齢・国籍', '最終学歴・職歴（年数）', '年収・雇用形態'] },
      { h: '二、ポイント計算の明細', t: ['学歴（博士/修士/学士）', '職歴（3/5/7/10年以上）', '年収（区分）', '年齢（加点）', '日本語能力（N1/N2）', '合計ポイント（70点以上必須）'] },
      { h: '三、活動内容', t: ['高度専門職 1号イ/ロ/ハ 該当区分', '具体的な業務内容', '研究・技術・経営の専門性'] },
      { h: '四、将来計画', t: ['在留期間内の活動予定', '更新時のポイント維持方針', '永住申請の見通し（80点なら1年）'] }
    ]
  },
  pr: {
    title: '永住許可申請 · 理由書（框架）',
    sections: [
      { h: '一、申請人概要', t: ['氏名・年齢・国籍・在留資格・在留期間', '在日年数（10年以上/就労5年以上）'] },
      { h: '二、素行の証明', t: ['刑事処分・罰金の有無', '届出義務の履行状況'] },
      { h: '三、独立生計', t: ['年収・資産・技能', '家族の扶養状況'] },
      { h: '四、公的義務の履行', t: ['納税（住民税・国税）', '年金・健康保険の加入・納付', '過去の滞納・補正の有無'] },
      { h: '五、永住を希望する理由', t: ['生活基盤・事業基盤', '家族との関係', '日本への定着意思'] }
    ]
  },
  work: {
    title: '技術・人文知識・国際業務 在留資格申請 · 理由書（框架）',
    sections: [
      { h: '一、申請人概要', t: ['氏名・年齢・国籍', '最終学歴・専攻分野', 'これまでの職務経歴（年数）'] },
      { h: '二、従事しようとする業務', t: ['具体的な職務内容（図面・マニュアル）', '大学での専攻・実務経験との関連性', '日本人従業員との役割分担'] },
      { h: '三、雇用機関の概要', t: ['会社概要・資本金・売上高', '事業内容・外国籍社員の実績', '従業員数・社会保険加入状況'] },
      { h: '四、なぜその外国人でなければならないか', t: ['外国語・専門知識・海外ネットワークの必要性', '代替性のない理由', '処遇（給与・勤務地）の合理性'] }
    ]
  },
  family: {
    title: '家族滞在 在留資格申請 · 理由書（框架）',
    sections: [
      { h: '一、申請人（扶養者）概要', t: ['氏名・在留資格・在留期間', '年収・職業・勤務先', '配偶者/子との関係'] },
      { h: '二、呼び寄せる家族の状況', t: ['家族構成・氏名・年齢・現住所', '本国での生活状況・別居期間'] },
      { h: '三、扶養計画', t: ['生活費・住居の手配', '日本での生活サポート体制', '家族の就学・医療の予定'] },
      { h: '四、日本での生活予定', t: ['住居・通学・通院先', '在留期間中の更新予定'] }
    ]
  },
  recruit: {
    title: '高度専門職 ロ（技術·人文）招聘说明书（框架）',
    sections: [
      { h: '一、募集の背景', t: ['事業拡大・海外展開の必要性', '求める人材像'] },
      { h: '二、職務内容', t: ['具体的な業務内容（図面・組織図）', '部下・チームの規模', '裁量の範囲'] },
      { h: '三、処遇とキャリアパス', t: ['年収・賞与・諸手当', '昇進・昇格の制度', '将来の経営参画の道筋'] },
      { h: '四、ポイント加点の該当性', t: ['年収・学歴・職歴・日本語の各加点', '特別高度人材（J-Skip）該当の有無'] }
    ]
  }
};

Page({
  data: {
    path: 'business_manager',
    paths: [
      { key: 'business_manager', label: '経営管理' },
      { key: 'hsp', label: '高度人材' },
      { key: 'pr', label: '永住' },
      { key: 'work', label: '技術人文' },
      { key: 'family', label: '家族滞在' },
      { key: 'recruit', label: '招聘説明書' }
    ],
    form: { name: '', extra: '' },
    clientList: [],
    clientIndex: -1,
    doc: null,
    copied: false,
    recording: false,
    transcript: '',
    _recorder: null
  },

  onShow() {
    this.loadClients();
    // 纯本地模式：语音识别用微信原生键盘语音输入
  },

  startDictation() {
    this.setData({ recording: true });
    // 只提示一次，避免每次按住都弹窗
    if (!this._dictationHinted) {
      this._dictationHinted = true;
      wx.showModal({
        title: '语音输入',
        content: '请使用微信键盘的语音输入功能，说完后文字会进入下方输入框；也可以直接打字输入。',
        showCancel: false
      });
    }
  },

  endDictation() {
    this.setData({ recording: false });
  },

  onTranscriptInput(e) {
    this.setData({ transcript: e.detail.value });
  },

  resetTranscript() { this.setData({ transcript: '' }); },

  applyTranscript() {
    if (!this.data.transcript) return;
    // 注意：这里必须用分组 (?:先生|女士|小姐)，写成 [先生|女士|小姐] 是字符类，
    // 只会匹配单字，导致「陈先生」被截成「陈先」。
    const m = this.data.transcript.match(/^([^\s，,]{0,10}?(?:先生|女士|小姐))/);
    if (m) this.setData({ 'form.name': m[1] });
    this.setData({ 'form.extra': this.data.transcript });
    wx.showToast({ title: '已填入，点生成', icon: 'success' });
  },

  loadClients() {
    // 纯本地模式：从storage读客户
    const clients = storage.getList('clients');
    this.setData({ clientList: clients.slice(0, 50) });
  },

  onPickClient(e) {
    const idx = Number(e.detail.value);
    const c = this.data.clientList[idx];
    if (!c) return;
    const tags = (c.tags || []).join('·');
    this.setData({
      clientIndex: idx,
      'form.name': c.name,
      'form.extra': (c.occupation || '') + (tags ? '（' + tags + '）' : '')
    });
  },

  setPath(e) {
    this.setData({ path: e.currentTarget.dataset.key, doc: null, copied: false });
  },

  onInput(e) {
    const key = e.currentTarget.dataset.k;
    this.setData({ ['form.' + key]: e.detail.value });
  },

  generate() {
    const tpl = TEMPLATES[this.data.path];
    if (!tpl) return;
    const f = this.data.form;
    const name = f.name || '＿＿＿＿';
    const extra = f.extra || '（職業・事業内容）';
    const intro = {
      business_manager: '申請人 ' + name + ' は、' + extra + ' として日本において事業を営むため、経営・管理ビザの在留資格認定を申請する。本書面は、事業の概要・資本金の出所・従業員体制・日本語能力について説明するものである。',
      hsp: '申請人 ' + name + ' は、' + extra + ' として高度専門職 1 号に該当するところ、その積算根拠（学歴・職歴・年収・日本語）を以下に示す。',
      pr: '申請人 ' + name + ' は、' + extra + ' として日本に継続して ' + '10' + ' 年以上在留し、納税・年金・健康保険を履行してきた。永住許可を希望する理由を以下に述べる。',
      work: '申請人 ' + name + ' は、' + extra + ' として本邦企業 ' + '（勤務先名）' + ' に雇用されることとなった。職務内容・処遇・雇用の必要性について以下に説明する。',
      family: '申請人（扶養者）' + name + ' は、' + extra + ' として日本で在留している。本国にいる家族（配偶者・子）を呼び寄せ、安定した生活を共にするため本申請を行う。',
      recruit: '申請人 ' + name + ' は、' + extra + ' として高度専門職 ロにて採用される。募集背景・職務内容・処遇・ポイント加点該当性について以下に示す。'
    };
    const lines = [tpl.title, '', '申請人：' + name, '作成日：' + this.today()];
    lines.push('', 'はじめに', intro[this.data.path] || '');
    lines.push('', '────────────────────');
    for (const s of tpl.sections) {
      lines.push('', s.h);
      for (const t of s.t) { lines.push('□ ' + t); }
    }
    lines.push('', '────────────────────');
    lines.push('※ 本框架由「顧問業務室」生成，需由顾问结合客户实态补全后使用，不构成法律意见。');
    this.setData({ doc: lines.join('\n'), copied: false });
  },

  today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  copyDoc() {
    if (!this.data.doc) return;
    wx.setClipboardData({
      data: this.data.doc,
      success: () => this.setData({ copied: true })
    });
  }
});
