const storage = require('../../utils/storage.js');
// 资源协作层：行政书士/税理士/司法书士/银行/中介/律师
Page({
  data: {
    type: 'all',
    types: [
      { key: 'all', label: '全部' },
      { key: 'gyosei', label: '行政書士' },
      { key: 'tax', label: '税理士' },
      { key: 'judicial', label: '司法書士' },
      { key: 'lawyer', label: '弁護士' },
      { key: 'bank', label: '銀行' },
      { key: 'agency', label: '不動産中介' },
      { key: 'other', label: '其他' }
    ],
    list: [],
    counts: {},
    showForm: false,
    form: {
      _id: '',
      name: '',
      type: 'gyosei',
      city: '',
      specialty: '',
      note: '',
      status: 'active'
    },
    loading: false,
    error: false,
    submitting: false
  },

  onShow() { this.load(); },

  load() {
    // 纯本地模式：从storage读
    let list = storage.getList('partners');
    if (this.data.type !== 'all') {
      list = list.filter(p => p.type === this.data.type);
    }
    this.setData({ list, loading: false });
  },

  setType(e) {
    this.setData({ type: e.currentTarget.dataset.key });
    this.load();
  },

  typeLabel(t) {
    const map = { gyosei: '行政書士', tax: '税理士', judicial: '司法書士', lawyer: '弁護士', bank: '銀行', agency: '不動産中介', other: '其他' };
    return map[t] || t;
  },

  openForm() {
    this.setData({
      showForm: true,
      // 新开一次表单 → 解除上一次保存的提交锁
      submitting: false,
      form: { _id: '', name: '', type: 'gyosei', city: '', specialty: '', note: '', status: 'active' }
    });
  },

  closeForm() { this.setData({ showForm: false }); },

  editItem(e) {
    const p = this.data.list.find(x => x._id === e.currentTarget.dataset.id);
    if (!p) return;
    this.setData({
      showForm: true,
      submitting: false,
      form: {
        _id: p._id, name: p.name, type: p.type, city: p.city || '',
        specialty: p.specialty || '', note: p.note || '', status: p.status || 'active'
      }
    });
  },

  onFormInput(e) {
    const key = e.currentTarget.dataset.k;
    this.setData({ ['form.' + key]: e.detail.value });
  },

  onTypeChange(e) { this.setData({ 'form.type': e.detail.value }); },

  save() {
    // 防重复提交：快速双击只允许写入一次
    if (this.data.submitting) return;
    const f = this.data.form;
    if (!f.name) { wx.showToast({ title: '名称必填', icon: 'none' }); return; }
    this.setData({ submitting: true });

    // 纯本地模式：保存到storage
    const partners = storage.getList('partners');
    if (f._id) {
      // 编辑
      const idx = partners.findIndex(p => p._id === f._id);
      if (idx >= 0) partners[idx] = f;
    } else {
      // 新增
      partners.push({ ...f, _id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) });
    }
    wx.setStorageSync('partners', partners);
    // 成功后不释放提交锁；重新打开表单时再解锁（openForm/setEdit）
    this.setData({ showForm: false });
    wx.showToast({ title: '已保存', icon: 'success' });
    this.load();
  },

  removeItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除该资源？',
      content: '删除后不可恢复。',
      confirmText: '删除',
      confirmColor: '#C04851',
      success: (r) => {
        if (!r.confirm) return;
        const partners = storage.getList('partners');
        const filtered = partners.filter(p => p._id !== id);
        wx.setStorageSync('partners', filtered);
        this.load();
      }
    });
  }
});
