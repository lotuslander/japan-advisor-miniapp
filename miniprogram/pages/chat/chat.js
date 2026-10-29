const localData = require('../../utils/local-data.js');
const storage = require('../../utils/storage.js');

Page({
  data: {
    input: '',
    messages: [
      {
        id: 0,
        role: 'bot',
        content: '您好，我是投资日本AI小助理\n\n我是您的智能顾问助手，可以帮您：\n\n1. 客户评估：描述客户情况，我帮您分析可行性\n2. 文书生成：根据客户情况生成理由书、事业计划书框架\n3. 政策解读：日本签证政策最新变化解读\n4. 方案建议：推荐最合适的签证路线\n5. 风险预警：提前发现申请中的风险点\n\n您可以直接和我对话，或者试试下面的快捷指令'
      }
    ],
    scrollTo: '',
    quickActions: [
      { label: '🎯 客户评估', prompt: '我有一个客户想申请日本签证，帮我评估一下可行性' },
      { label: '📝 生成理由书', prompt: '帮我生成一份经营管理签证的理由书框架' },
      { label: '📊 政策解读', prompt: '最新日本签证政策有什么变化？' },
      { label: '💡 推荐路线', prompt: '根据客户情况推荐最合适的签证路线' }
    ]
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  // 快捷指令
  onQuickAction(e) {
    const prompt = e.currentTarget.dataset.prompt;
    this.setData({ input: prompt });
    this.onSend();
  },

  async onSend() {
    const q = this.data.input.trim();
    if (!q) return;

    const userMsg = { id: Date.now(), role: 'user', content: q };
    this.setData({
      messages: [...this.data.messages, userMsg],
      input: '',
      scrollTo: 'bottom-anchor'
    });

    // 离线FAQ匹配：最常见问题直接本地回答，不用调API
    const offlineFAQ = [
      { kws: ['外国人', '买房'], ans: '外国人可以在日本买房，没有国籍限制，不需要签证，交易流程和日本人一样。' },
      { kws: ['买房', '签证'], ans: '单纯买房不能直接办经营管理签，需要有实际经营的公司和业务，买房可以作为公司资产是加分项，但不是充分条件。' },
      { kws: ['固定资产税'], ans: '固定资产税每年交评价额的1.4%，加都市计划税0.3%，一套3000万日元的房子一年大概交8-10万日元。' },
      { kws: ['表面利回', '高'], ans: '表面利回7%以上的房子要特别小心，一般房龄老、地段偏、有隐藏修缮费，扣除空置率、托管费、修缮金之后实际利回可能只有2-3%。' },
      { kws: ['托管费'], ans: '正常托管费是月租金的5%，空置期正规公司不收，超过8%就是坑。' },
      { kws: ['经营管理签', '资金'], ans: '经营管理签需要资本金500万日元（约25万人民币），必须实际到账用于公司经营，不能走账后转走。' },
      { kws: ['高度人才', '积分'], ans: '高度人才需要积分70分以上申请1年签，80分以上申请3年签，80分以上最快1年就能申请永住。' }
    ];
    const hit = offlineFAQ.find(f => f.kws.some(k => q.includes(k)));
    if (hit) {
      this.pushBot(hit.ans + '\n\n（离线快速回答，如需更详细分析请继续提问）', []);
      return;
    }

    wx.showLoading({ title: 'AI思考中…' });
    try {
      // 统一读取 llmConfig；未配置时提示去配置，绝不用占位 Key 发请求
      const config = storage.getMap('llmConfig');
      if (!config.apiKey) {
        wx.hideLoading();
        wx.showModal({
          title: '需要先配置大模型',
          content: 'AI 对话需要使用你自己的大模型 API Key，请先在「API 配置」中填写。',
          confirmText: '去配置',
          cancelText: '取消',
          success: (r) => {
            if (r.confirm) wx.navigateTo({ url: '/pages/api-config/api-config' });
          }
        });
        return;
      }
      if (!config.apiBaseUrl) config.apiBaseUrl = 'https://open.bigmodel.cn/api/paas/v4';
      if (!config.model) config.model = 'glm-4-flash';

      // 本地知识库检索（更智能）
      const relevant = this.searchLocalKnowledge(q);
      const context = this.buildContext(relevant);

      // 构建更专业的system prompt
      const systemPrompt = `你是一位资深的日本移民+不动产投资顾问助手，有10年以上行业经验，同时精通日本签证政策和不动产投资全流程。

你的任务分两大模块：
【身份办理模块】
1. 解答经营管理签/高度人才/永住等签证相关问题
2. 基于内置政策库和案例库回答，不编造政策
3. 主动指出签证申请中的风险点
【不动产投资模块】
1. 解答日本不动产投资的产权、税费、收益、风险问题
2. 基于内置不动产政策、案例、合规红线回答
3. 主动指出高风险投资陷阱（旧耐震、借地权、土壤污染、民宿政策等）
4. 收益测算必须考虑所有持有成本，不能只说表面利回
【风险自动预警规则】
当用户提到以下关键词时，必须在回答开头单独一段弹出风险提示：
- 旧耐震/昭和56年之前建的房子 → 提醒耐震风险
- 表面利回超过7% → 提醒高利回背后的隐藏成本
- 借地权 → 提醒土地不是自己的，到期要还
- 民宿/民泊 → 提醒区域管制和管理组合限制
- 年租金回报超过8% → 大概率是坑，必须提醒
【客户信息自动提取规则】
对话过程中如果用户提到预算、城市、目的（自住/投资/办签证），最后单独一段帮客户整理：
"根据你的情况：预算XX万、目标城市XX、需求XX，建议你下一步先做XX"
【通用规则】
1. 用专业但易懂的中文回答
2. 给出可操作的建议
3. 如果信息不足，主动提问补充

回答要求：
- 必须用序号1、2、3分点说明，不要用Markdown
- 每段之间空一行，结构清晰
- 关键信息直接写出来，不要用**加粗**符号
- 最后单独一段给出行动建议
- 明确标注哪些是确定的，哪些需要进一步确认
- 不要用任何Markdown语法，就是纯文本，正常分段换行
- 涉及收益的地方必须提醒"预估收益，不构成投资建议"

内置知识库参考：
${context}`;

      // 直接调大模型API
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: config.apiBaseUrl + '/chat/completions',
          method: 'POST',
          header: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + config.apiKey
          },
          data: {
            model: config.model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...this.data.messages
                .filter(m => m.role === 'user' || m.role === 'bot')
                .slice(-6)
                .map(m => ({
                  role: m.role === 'bot' ? 'assistant' : 'user',
                  content: m.content
                })),
              { role: 'user', content: q }
            ],
            temperature: 0.7,
            max_tokens: 2000
          },
          success: resolve,
          fail: reject
        });
      });

      wx.hideLoading();
      if (res.data && res.data.choices && res.data.choices[0]) {
        this.pushBot(res.data.choices[0].message.content, relevant);
      } else {
        this.pushBot('（返回格式异常，请检查API配置）', []);
      }
    } catch (e) {
      wx.hideLoading();
      this.pushBot('⚠️ 网络异常：' + e.message + '\n\n请检查：\n1. API Key是否正确\n2. 域名白名单是否配置\n3. 网络连接是否正常', []);
    }
  },

  // 更智能的本地知识库检索（带权重）
  searchLocalKnowledge(query) {
    const typeWeight = { '政策': 3, '合规': 2.5, '案例': 2, '文书': 1.5 };
    const all = [
      ...localData.policies.map(p => ({ ...p, type: '政策' })),
      ...localData.compliance.map(c => ({ ...c, type: '合规' })),
      ...localData.cases.map(c => ({ ...c, type: '案例' })),
      ...localData.documents.map(d => ({ ...d, type: '文书' }))
    ];

    // 关键词分词
    const kws = query.split(/[\s,，。？？!！、；;：:]/).filter(w => w.length >= 2);

    // 按相关性+权重排序
    const scored = all.map(item => {
      const text = (item.title_zh + item.title + item.summary + (item.lessons || '') + item.rule + (item.solution || '')).toLowerCase();
      let score = 0;
      kws.forEach(k => {
        if (text.includes(k.toLowerCase())) {
          score += 1 * (typeWeight[item.type] || 1);
        }
      });
      // 政策类结果权重额外加成
      if (item.is_current) score += 0.5;
      return { item, score };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

    return scored.slice(0, 6).map(s => s.item);
  },

  // 构建上下文
  buildContext(relevant) {
    if (!relevant.length) return '暂无相关知识库内容';
    return relevant.map(r => {
      if (r.type === '政策') return `【政策-${r.source}】${r.title_zh}：${r.summary}`;
      if (r.type === '案例') return `【案例-${r.result}】${r.title}：${r.lessons || r.client_profile}`;
      if (r.type === '文书') return `【文书-${r.type}】${r.title}`;
      if (r.type === '合规') return `【合规-${r.severity}】${r.rule}：${r.consequence}`;
      return '';
    }).join('\n');
  },

  // 格式化大模型返回的内容，让它更易读
  formatContent(text) {
    if (!text) return '';
    let result = text;
    
    // 把Markdown标题转成易读的格式
    result = result.replace(/^### /gm, '\n\n▸ ');
    result = result.replace(/^## /gm, '\n\n【');
    result = result.replace(/^# /gm, '\n\n【');
    
    // 列表项前面加换行和项目符号
    result = result.replace(/^[-•*] /gm, '\n  • ');
    
    // 多个空行合并成两个
    result = result.replace(/\n{3,}/g, '\n\n');
    
    // 去掉Markdown加粗符号，保留文字
    result = result.replace(/\*\*(.*?)\*\*/g, '$1');
    
    // 去掉首尾空行
    result = result.trim();
    
    return result;
  },

  pushBot(content, citations) {
    const formatted = this.formatContent(content);
    this.setData({
      messages: [...this.data.messages, {
        id: Date.now() + 1,
        role: 'bot',
        content: formatted,
        citations
      }],
      scrollTo: 'bottom-anchor'
    });
  }
});

