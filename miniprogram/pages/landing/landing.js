Page({
  data: {
    sections: [
      { title: '在留資格取得後', items: [
        { text: '入国管理局で在留カード受け取り', done: false },
        { text: '住所登録（区役所）', done: false },
        { text: 'マイナンバー申請', done: false }
      ]},
      { title: '事業運営', items: [
        { text: '法務局で会社設立登記', done: false },
        { text: '税理士と顧問契約', done: false },
        { text: '決算・納税スケジュール確認', done: false }
      ]},
      { title: '住居・生活', items: [
        { text: '賃貸契約（保証会社経由）', done: false },
        { text: '銀行口座開設（在留カード必須）', done: false },
        { text: '子供の学校手続き（該当時）', done: false }
      ]},
      { title: '更新・永住準備', items: [
        { text: '在留期間更新（3ヶ月前に開始）', done: false },
        { text: '年金・健康保険加入確認', done: false },
        { text: '永住申請のための納税証明保管', done: false }
      ]}
    ]
  },
  toggle(e) {
    const si = e.currentTarget.dataset.si;
    const ti = e.currentTarget.dataset.ti;
    const key = `sections[${si}].items[${ti}].done`;
    const val = !this.data.sections[si].items[ti].done;
    this.setData({ [key]: val });
  }
});
