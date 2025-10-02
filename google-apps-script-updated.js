// ========== 設定區域 ==========
const CONFIG = {
  // 你的網站 URL
  SITE_URL: 'https://seo-team-lens.vercel.app',
  
  // 快取刷新的密鑰（與 CACHE_REFRESH_SECRET 環境變數相同）
  SECRET: 'awefjwefantqbekjw',
  
  // 要刷新的專案 ID 列表（留空則刷新所有專案）
  PROJECT_IDS: [
    // 'HSHK 總表(更新中）',
    // 'project-2',
    // 'project-3'
  ],
  
  // 要刷新的天數列表
  DAYS: [7, 30, 60],
  
  // 是否啟用 Slack/Discord 通知（可選）
  NOTIFICATIONS: {
    enabled: false,
    webhookUrl: '', // Slack 或 Discord webhook URL
  }
};

/**
 * 主要的快取刷新函數 - 使用新的外部端點
 */
function refreshCache() {
  try {
    console.log('開始刷新快取...');
    console.log(`目標天數: ${CONFIG.DAYS.join(', ')} 天`);
    
    const startTime = new Date();
    
    const payload = {
      secret: CONFIG.SECRET,
      projectIds: CONFIG.PROJECT_IDS.length > 0 ? CONFIG.PROJECT_IDS : undefined,
      days: CONFIG.DAYS
    };

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GoogleAppsScript-CacheRefresh/1.0'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true // 避免 4xx/5xx 錯誤拋出異常
    };

    // 使用新的外部端點，不需要登入
    const apiUrl = `${CONFIG.SITE_URL}/api/cache/refresh-external`;
    console.log('發送請求到:', apiUrl);
    
    const response = UrlFetchApp.fetch(apiUrl, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    console.log(`HTTP 狀態碼: ${responseCode}`);
    
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`無法解析回應 JSON: ${responseText.slice(0, 200)}`);
    }

    if (responseCode === 200 && responseData.success) {
      const endTime = new Date();
      const duration = Math.round((endTime - startTime) / 1000);
      
      const message = `✅ 快取刷新成功！\n` +
        `時間: ${responseData.timestamp}\n` +
        `專案數: ${responseData.projects?.length || 0}\n` +
        `天數組合: ${responseData.days?.join(', ')} 天\n` +
        `刷新的 URL 數: ${responseData.refreshedUrls?.length || 0}\n` +
        `執行時間: ${duration} 秒\n` +
        `來源: ${responseData.source}`;

      console.log(message);
      console.log('刷新的專案:', responseData.projects);
      console.log('刷新的天數:', responseData.days);

      if (CONFIG.NOTIFICATIONS.enabled) {
        sendNotification(message, 'success');
      }

      return responseData;
    } else {
      const errorDetail = responseData.error || responseData.details || responseText;
      throw new Error(`API 回應錯誤 (${responseCode}): ${errorDetail}`);
    }

  } catch (error) {
    const errorMessage = `❌ 快取刷新失敗: ${error.message}`;
    console.error(errorMessage);
    console.error('完整錯誤:', error);

    if (CONFIG.NOTIFICATIONS.enabled) {
      sendNotification(errorMessage, 'error');
    }

    throw error;
  }
}

/**
 * 測試函數 - 使用新端點
 */
function testCacheRefresh() {
  console.log('執行測試...');
  console.log('設定:', CONFIG);
  
  try {
    const result = refreshCache();
    console.log('測試成功:', result);
    console.log('詳細結果:');
    console.log('- 專案數:', result.projects?.length);
    console.log('- 天數:', result.days);
    console.log('- 刷新的 URL 數:', result.refreshedUrls?.length);
    console.log('- 來源:', result.source);
  } catch (error) {
    console.error('測試失敗:', error.message);
  }
}

/**
 * 檢查快取系統狀態 - 使用新端點
 */
function checkCacheStatus() {
  try {
    console.log('檢查快取系統狀態...');
    
    const url = `${CONFIG.SITE_URL}/api/cache/status?secret=${CONFIG.SECRET}`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const responseCode = response.getResponseCode();
    const data = JSON.parse(response.getContentText());

    if (responseCode === 200) {
      console.log('✅ 快取系統狀態正常');
      console.log('環境資訊:', data.environment);
      console.log('是否為 Vercel:', data.environment.isVercel);
      console.log('區域:', data.environment.region);
      console.log('時間戳:', data.environment.timestamp);
      return data;
    } else {
      console.error('❌ 快取系統狀態檢查失敗:', data.error);
      return null;
    }
  } catch (error) {
    console.error('檢查快取狀態時發生錯誤:', error.message);
    return null;
  }
}

// 其他函數保持不變...
function sendNotification(message, type = 'info') {
  if (!CONFIG.NOTIFICATIONS.enabled || !CONFIG.NOTIFICATIONS.webhookUrl) {
    return;
  }

  try {
    const color = type === 'success' ? '#36a64f' : type === 'error' ? '#ff0000' : '#ffaa00';
    
    const payload = {
      embeds: [{
        title: 'RankLens 快取刷新',
        description: message,
        color: parseInt(color.replace('#', ''), 16),
        timestamp: new Date().toISOString(),
        fields: [{
          name: '刷新天數',
          value: CONFIG.DAYS.join(', ') + ' 天',
          inline: true
        }, {
          name: '專案範圍',
          value: CONFIG.PROJECT_IDS.length > 0 ? '指定專案' : '所有專案',
          inline: true
        }]
      }]
    };

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload)
    };

    UrlFetchApp.fetch(CONFIG.NOTIFICATIONS.webhookUrl, options);
  } catch (error) {
    console.error('發送通知失敗:', error.message);
  }
}

function setupTriggers() {
  // 刪除現有的觸發器
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'refreshCache') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 創建新的觸發器 - 每 4 小時執行一次
  ScriptApp.newTrigger('refreshCache')
    .timeBased()
    .everyHours(4)
    .create();

  console.log('觸發器設定完成！每 4 小時會自動刷新快取。');
}