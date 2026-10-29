/**
 * storage 安全读取工具
 *
 * 背景：页面普遍写成 `wx.getStorageSync('clients') || []`，看似有兜底，
 * 但当 storage 里存的不是数组时（旧版本数据结构、用户导入的畸形备份、
 * 手动清缓存残留等），`{} || []` 得到的是 `{}`，紧接着 `.map/.filter/.find`
 * 就会抛 "xxx is not a function" 导致页面白屏。
 *
 * 这里统一做类型归一：取不到 / 类型不对，一律退回安全的空容器。
 */

/** 读数组；非数组一律返回 [] */
function getList(key) {
  let v;
  try {
    v = wx.getStorageSync(key);
  } catch (e) {
    return [];
  }
  return Array.isArray(v) ? v : [];
}

/** 读对象；非纯对象（数组/null/字符串）一律返回 {} */
function getMap(key) {
  let v;
  try {
    v = wx.getStorageSync(key);
  } catch (e) {
    return {};
  }
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}

/** 写数组；非数组一律写 []，避免把脏数据写回去 */
function setList(key, list) {
  wx.setStorageSync(key, Array.isArray(list) ? list : []);
}

/** 写对象；非纯对象一律写 {} */
function setMap(key, map) {
  wx.setStorageSync(key, (map && typeof map === 'object' && !Array.isArray(map)) ? map : {});
}

/** 取字符串（供 advisorName 这类标量使用） */
function getString(key, fallback) {
  let v;
  try {
    v = wx.getStorageSync(key);
  } catch (e) {
    return fallback === undefined ? '' : fallback;
  }
  if (typeof v === 'string') return v;
  if (v === '' || v === undefined || v === null) return fallback === undefined ? '' : fallback;
  return String(v);
}

module.exports = { getList, getMap, setList, setMap, getString };
