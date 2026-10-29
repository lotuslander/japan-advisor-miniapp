Component({
  data: { selected: 0 },
  methods: {
    goWorkbench() {
      wx.switchTab({ url: '/pages/workbench/workbench' });
    },
    goProfile() {
      wx.switchTab({ url: '/pages/profile/profile' });
    }
  }
});
