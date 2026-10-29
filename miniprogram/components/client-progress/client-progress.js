Component({
  properties: {
    currentStage: {
      type: Number,
      value: 3
    }
  },
  data: {
    stages: [
      { key: 'lead', label: '线索' },
      { key: 'contact', label: '初接触' },
      { key: 'assess', label: '评估' },
      { key: 'confirm', label: '签约' },
      { key: 'prepare', label: '材料' },
      { key: 'submit', label: '递交' },
      { key: 'result', label: '结果' },
      { key: 'land', label: '落地' },
      { key: 'archive', label: '归档' }
    ]
  }
});