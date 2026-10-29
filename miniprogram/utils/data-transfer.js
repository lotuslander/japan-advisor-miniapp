// 数据导出导入工具（端侧备份）
//
// 用途：「我的」页导出/导入，用于换机、备份、多个小程序间迁移。
//
// 设计要点：
// 1. 覆盖**全部用户自建数据**，不只是 clients。早期版本只导出 5 个键，
//    导致政策审核结论（policyReviews）、自定义政策源（policySources）、
//    线索（leads）、合作方（partners）、顾问信息（advisorName）在换机后全部丢失。
// 2. 不再导出内置知识库快照（builtin）—— 那是随代码发布的静态数据，
//    重复导出会让备份文件从几十 KB 涨到几十 MB，且导入时也用不到。
// 3. 导入保持向后兼容：旧版本备份（含 builtin / 只有 5 个键）仍可正常导入。

const FORMAT_VERSION = '2.0';

// 用户自建数据键（导出/导入都基于这张表，避免以后再漏）
const USER_DATA_KEYS = [
  'clients',
  'leads',
  'partners',
  'customPolicies',
  'customCases',
  'aiCases',
  'policyReviews',
  'policySources',
  'chatHistory',
  'llmConfig',
  'advisorName',
  'renewal_done'
];

// 附带元数据（导出便于排查，导入非必需）
const META_KEYS = ['lastPolicyUpdateTime', 'policyUpdateLog', 'lastCaseUpdateTime'];

// 各键的期望类型：导入时做强校验，避免畸形备份把 storage 写脏
// （脏数据的典型后果：页面 .map/.filter 直接抛错白屏）
const LIST_KEYS = ['clients', 'leads', 'partners', 'customPolicies', 'customCases',
  'aiCases', 'policySources', 'chatHistory', 'policyUpdateLog'];
const MAP_KEYS = ['policyReviews', 'llmConfig', 'renewal_done'];

/** 按期望类型判断导入值是否可用 */
function typeOk(key, val) {
  if (LIST_KEYS.indexOf(key) >= 0) return Array.isArray(val);
  if (MAP_KEYS.indexOf(key) >= 0) return !!val && typeof val === 'object' && !Array.isArray(val);
  return true; // 标量键（advisorName / 时间戳）
}

module.exports = {
  FORMAT_VERSION,
  USER_DATA_KEYS,

  /** 导出全部用户数据为 JSON 字符串 */
  exportAll() {
    const data = {
      version: FORMAT_VERSION,
      exported_at: new Date().toISOString(),
      keys: {}
    };

    USER_DATA_KEYS.forEach((key) => {
      const val = wx.getStorageSync(key);
      if (val !== '' && val !== undefined && val !== null) {
        data.keys[key] = val;
      }
    });

    const meta = {};
    META_KEYS.forEach((key) => {
      const val = wx.getStorageSync(key);
      if (val !== '' && val !== undefined && val !== null) meta[key] = val;
    });
    if (Object.keys(meta).length > 0) data.meta = meta;

    // 统计，便于导入时展示「恢复了多少」
    data.stats = {
      clients: (data.keys.clients || []).length,
      customPolicies: (data.keys.customPolicies || []).length,
      customCases: (data.keys.customCases || []).length,
      aiCases: (data.keys.aiCases || []).length,
      policyReviews: Object.keys(data.keys.policyReviews || {}).length
    };

    return JSON.stringify(data, null, 2);
  },

  /**
   * 导入备份。
   * 兼容两种格式：
   *   - v2.0：{ version, keys: {...} }
   *   - v1.0：{ clients, llmConfig, customCases, customPolicies, chatHistory, builtin }
   */
  importAll(jsonStr) {
    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch (e) {
      return { ok: false, message: '导入失败：不是合法 JSON' };
    }
    if (!data || typeof data !== 'object') {
      return { ok: false, message: '导入失败：文件内容为空' };
    }

    // 归一化：v2 用 keys，v1 直接平铺在顶层
    const source = (data.keys && typeof data.keys === 'object') ? data.keys : data;

    const restored = [];
    const skipped = [];
    USER_DATA_KEYS.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(source, key)) return;
      const val = source[key];
      if (val === '' || val === undefined || val === null) {
        skipped.push(key);
        return;
      }
      // 类型校验：畸形备份里的错误类型直接拒收，不写进 storage 污染页面
      if (!typeOk(key, val)) {
        skipped.push(key + '(类型不符)');
        return;
      }
      try {
        wx.setStorageSync(key, val);
        restored.push(key);
      } catch (e) {
        skipped.push(key + '(' + e.message + ')');
      }
    });

    // 元数据（非必需，失败不影响导入结果）
    const meta = data.meta || {};
    META_KEYS.forEach((key) => {
      if (meta[key] !== undefined) {
        try { wx.setStorageSync(key, meta[key]); } catch (e) { /* 忽略 */ }
      }
    });

    if (restored.length === 0) {
      return { ok: false, message: '导入失败：未识别到可恢复的数据键' };
    }

    return {
      ok: true,
      message: `导入成功：恢复 ${restored.length} 项数据`,
      restored,
      skipped
    };
  }
};
