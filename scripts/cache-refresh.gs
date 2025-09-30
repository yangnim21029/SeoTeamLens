/**
 * Google Apps Script 自動刷新快取
 * 
 * 設定方式：
 * 1. 在 Google Apps Script 中創建新專案
 * 2. 貼上這段程式碼
 * 3. 設定觸發器（Triggers）來定期執行
 * 4. 修改下面的設定值
 */

// ========== 設定區域 ==========
const CONFIG = {
  // 你的網站 URL
  SITE_URL: 'https://your-domain.com',
  
  // 快取刷新的密鑰（與 CACHE_REFRESH_SECRET 環境變數相同）
  SECRET: 'your-secret-key',
  
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
      },
      payload: JSON.stringify(payload)
    };
    
    console.log('發送請求到:', `${CONFIG.SITE_URL}/api/cache/refresh`);
    const response = UrlFetchApp.fetch(`${CONFIG.SITE_URL}/api/cache/refresh`, options);
    const responseData = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200 && responseData.success) {
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
      throw new Error(`API 回應錯誤: ${responseData.error || '未知錯誤'}`);
    }
    
  } catch (error) {
    const errorMessage = `❌ 快取刷新失敗: ${error.message}`;
    console.error(errorMessage);
    
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
    const response = UrlFetchApp.fetch(`${CONFIG.SITE_URL}/api/cache/refresh`, options);
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