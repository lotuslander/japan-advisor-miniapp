Component({
  data: {
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
    moved: false
  },
  lifetimes: {
    attached() {
      // 新版基础库已废弃 wx.getSystemInfoSync，优先用 wx.getWindowInfo，旧库回退
      let info = null;
      if (typeof wx.getWindowInfo === 'function') {
        info = wx.getWindowInfo();
      } else if (typeof wx.getSystemInfoSync === 'function') {
        info = wx.getSystemInfoSync();
      }
      const screenWidth = (info && info.windowWidth) || 375;
      const screenHeight = (info && info.windowHeight) || 667;
      this.setData({
        x: Math.max(0, screenWidth - 140),
        y: Math.max(0, screenHeight - 200)
      });
    }
  },
  methods: {
    onTouchStart(e) {
      this.setData({
        startX: e.touches[0].clientX - this.data.x,
        startY: e.touches[0].clientY - this.data.y,
        moved: false
      });
    },
    onTouchMove(e) {
      this.setData({
        x: e.touches[0].clientX - this.data.startX,
        y: e.touches[0].clientY - this.data.startY,
        moved: true
      });
    },
    onTouchEnd() {
      if (!this.data.moved) {
        wx.navigateTo({ url: '/pages/chat/chat' });
      }
    }
  }
});