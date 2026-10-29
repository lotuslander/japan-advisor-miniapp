const localData = require('../../utils/local-data.js');

Page({
  data: {
    list: [],
    filtered: [],
    categories: ['全部', '信息获取', '产权核验', '收益测算', '行情判断', '学习成本', '对比决策', '产权风险', '区域潜力', '隐患排查', '改造限制', '跨境税务', '远程尽调', '后续持有', '退出出售'],
    currentCat: '全部'
  },

  onLoad() {
    const list = localData.realEstatePainPoints || [];
    this.setData({ list, filtered: list });
  },

  setCat(e) {
    const cat = e.currentTarget.dataset.cat;
    this.setData({ currentCat: cat });
    if (cat === '全部') {
      this.setData({ filtered: this.data.list });
    } else {
      this.setData({ filtered: this.data.list.filter(item => item.category === cat) });
    }
  },

  askAI(e) {
    const item = e.currentTarget.dataset.item;
    const prompt = `我现在遇到一个日本不动产投资的问题：${item.title}。具体情况是：${item.description}。请你结合我们内置的知识库，给我详细的解决方法和注意事项。`;
    wx.setStorageSync('pendingAIQuery', prompt);
    wx.navigateTo({ url: '/pages/chat/chat' });
  }
});