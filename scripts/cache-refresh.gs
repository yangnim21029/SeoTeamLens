/**
 * Google Apps Script 自動刷新 Redis 快取
 * 
 * 設定方式：
 * 1. 在 Google Apps Script 中創建新專案
 * 2. 貼上這段程式碼
 * 3. 設定觸發器（Triggers）來定期執行
 * 4. 修改下面的設定值
 * 
 * 注意：現在使用 Redis 作為快取後端，TTL 為 4 小時自動過期
 */

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
 * 主要的快取刷新函數
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
    
    console.log('發送請求到:', `${CONFIG.SITE_URL}/api/cache/refresh-external`);
    const response = UrlFetchApp.fetch(`${CONFIG.SITE_URL}/api/cache/refresh-external`, options);
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
                     `執行時間: ${duration} 秒`;
      
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
 * 發送通知到 Slack 或 Discord
 */
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
        fields: [
          {
            name: '刷新天數',
            value: CONFIG.DAYS.join(', ') + ' 天',
            inline: true
          },
          {
            name: '專案範圍',
            value: CONFIG.PROJECT_IDS.length > 0 ? '指定專案' : '所有專案',
            inline: true
          }
        ]
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

/**
 * 測試函數 - 手動執行來測試設定
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
  } catch (error) {
    console.error('測試失敗:', error.message);
  }
}

/**
 * 測試單一專案的快取刷新
 */
function testSingleProject() {
  const testProjectId = 'HSHK 總表(更新中）'; // 修改為你的測試專案 ID
  
  console.log(`測試單一專案: ${testProjectId}`);
  
  const payload = {
    secret: CONFIG.SECRET,
    projectIds: [testProjectId],
    days: [7] // 只測試 7 天
  };
  
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload)
  };
  
  try {
    const response = UrlFetchApp.fetch(`${CONFIG.SITE_URL}/api/cache/refresh-external`, options);
    const result = JSON.parse(response.getContentText());
    console.log('單一專案測試結果:', result);
  } catch (error) {
    console.error('單一專案測試失敗:', error.message);
  }
}

/**
 * 設定定期觸發器的輔助函數
 * 執行一次來創建觸發器，之後就會自動執行
 */
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
    
  // 也可以設定每天特定時間執行
  // ScriptApp.newTrigger('refreshCache')
  //   .timeBased()
  //   .everyDays(1)
  //   .atHour(8) // 每天早上 8 點
  //   .create();
  
  console.log('觸發器設定完成！每 4 小時會自動刷新快取。');
}

/**
 * 獲取所有專案列表（用於設定參考）
 */
function getProjectList() {
  try {
    const response = UrlFetchApp.fetch(`${CONFIG.SITE_URL}/api/data/projects`);
    const data = JSON.parse(response.getContentText());
    const projects = Array.isArray(data?.projects) ? data.projects : Array.isArray(data) ? data : [];
    
    console.log('可用的專案 ID:');
    projects.forEach(project => {
      console.log(`- "${project.id}" (${project.label || project.id})`);
    });
    
    return projects;
  } catch (error) {
    console.error('獲取專案列表失敗:', error.message);
    return [];
  }
}

/**
 * 檢查 Redis 快取系統狀態
 */
function checkCacheStatus() {
  try {
    console.log('檢查 Redis 快取系統狀態...');
    
    const url = `${CONFIG.SITE_URL}/api/cache/redis-status?secret=${CONFIG.SECRET}`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const responseCode = response.getResponseCode();
    const data = JSON.parse(response.getContentText());
    
    if (responseCode === 200) {
      console.log('✅ Redis 快取系統狀態正常');
      console.log('Redis URL 設定:', data.redis_url);
      console.log('快取狀態:', data.cache_status);
      console.log('時間戳:', data.timestamp);
      return data;
    } else {
      console.error('❌ Redis 快取系統狀態檢查失敗:', data.error);
      return null;
    }
  } catch (error) {
    console.error('檢查 Redis 狀態時發生錯誤:', error.message);
    return null;
  }
}

/**
 * 檢查 Vercel 快取系統狀態（保留作為備用）
 */
function checkVercelCacheStatus() {
  try {
    console.log('檢查 Vercel 快取系統狀態...');
    
    const url = `${CONFIG.SITE_URL}/api/cache/status?secret=${CONFIG.SECRET}`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const responseCode = response.getResponseCode();
    const data = JSON.parse(response.getContentText());
    
    if (responseCode === 200) {
      console.log('✅ Vercel 快取系統狀態正常');
      console.log('環境資訊:', data.environment);
      console.log('是否為 Vercel:', data.environment.isVercel);
      console.log('區域:', data.environment.region);
      console.log('時間戳:', data.environment.timestamp);
      return data;
    } else {
      console.error('❌ Vercel 快取系統狀態檢查失敗:', data.error);
      return null;
    }
  } catch (error) {
    console.error('檢查 Vercel 狀態時發生錯誤:', error.message);
    return null;
  }
}

/**
 * 測試單一 API 的快取效果
 */
function testApiCache() {
  const testProjectId = 'HSHK 總表(更新中）'; // 修改為你的測試專案 ID
  const testDays = 7;
  
  console.log(`測試 API 快取效果 - 專案: ${testProjectId}, 天數: ${testDays}`);
  
  try {
    const apiUrl = `${CONFIG.SITE_URL}/api/run-csv/${encodeURIComponent(testProjectId)}?days=${testDays}`;
    
    // 第一次請求
    console.log('第一次請求...');
    const start1 = new Date();
    const response1 = UrlFetchApp.fetch(apiUrl, { muteHttpExceptions: true });
    const end1 = new Date();
    const duration1 = end1 - start1;
    
    console.log(`第一次請求耗時: ${duration1}ms`);
    console.log('回應 headers:', Object.keys(response1.getHeaders()));
    
    // 等待 1 秒後第二次請求
    Utilities.sleep(1000);
    
    // 第二次請求（應該命中快取）
    console.log('第二次請求...');
    const start2 = new Date();
    const response2 = UrlFetchApp.fetch(apiUrl, { muteHttpExceptions: true });
    const end2 = new Date();
    const duration2 = end2 - start2;
    
    console.log(`第二次請求耗時: ${duration2}ms`);
    
    const speedup = duration1 / duration2;
    console.log(`加速比: ${speedup.toFixed(2)}x`);
    
    if (speedup > 2) {
      console.log('✅ 快取似乎正常工作！');
    } else {
      console.log('⚠️ 快取可能沒有生效，或者資料量較小');
    }
    
    return {
      firstRequest: duration1,
      secondRequest: duration2,
      speedup: speedup
    };
    
  } catch (error) {
    console.error('測試 API 快取時發生錯誤:', error.message);
    return null;
  }
}