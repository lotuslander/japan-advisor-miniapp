// 语音转文字云函数（调用智谱ASR）
const cloud = require('wx-server-sdk');
const https = require('https');
const fs = require('fs');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const CONFIG = {
  api_key: process.env.ZHIPU_API_KEY
};

exports.main = async (event) => {
  const fileID = event.fileID;
  if (!fileID) return { ok: false, error: '缺少fileID' };

  try {
    // 下载语音文件
    const res = await cloud.downloadFile({ fileID });
    const tempFilePath = res.filePath;

    // 调用智谱ASR（这里用占位，实际需要调用智谱语音识别API）
    // 智谱ASR API: https://open.bigmodel.cn/api/paas/v4/audio/transcriptions
    const text = await callZhipuASR(CONFIG.api_key, tempFilePath);

    return {
      ok: true,
      text: text || '（语音识别结果待接入正式API）'
    };
  } catch (e) {
    return { ok: false, error: '语音识别失败：' + e.message };
  }
};

async function callZhipuASR(apiKey, filePath) {
  // 智谱ASR API调用（占位实现）
  // 实际需要：
  // 1. 读取音频文件
  // 2. POST到 https://open.bigmodel.cn/api/paas/v4/audio/transcriptions
  // 3. 返回识别文本

  // 暂时返回占位文本，等配置正式API后替换
  return '【语音识别占位】请配置智谱ASR正式API后启用';
}
