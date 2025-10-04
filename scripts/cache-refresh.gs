/**
 * Google Apps Script 自動刷新 Redis 快取
 * 
 * 設定方式：
 * 1. 在 Google Apps Script 中創建新專案
 * 2. 貼上這段程式碼
 * 3. 設定觸發器（Triggers）來定期執行 refreshCache
 * 4. 修改下面的設定值
 * 
 * 注意：現在使用 Redis 作為快取後端，TTL 為 4 小時自動過期
 */

// ========== 設定區域 ==========
const CONFIG = {
  SITE_URL: 'https://seo-team-lens.vercel.app',
  SECRET: 'awefjwefantqbekjw',
  PROJECT_IDS: [], // 空陣列表示刷新所有專案
  DAYS: [7, 30, 60]
};

/**
 * 主要的快取刷新函數 - 設定觸發器來定期執行這個函數
 */
function refreshCache() {
  try {
    console.log('開始刷新快取...');
    console.log(`目標天數: ${CONFIG.DAYS.join(', ')} 天`);
    
    const payload = {
      secret: CONFIG.SECRET,
      projectIds: CONFIG.PROJECT_IDS.length > 0 ? CONFIG.PROJECT_IDS : undefined,
      days: CONFIG.DAYS
    };
    
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(`${CONFIG.SITE_URL}/api/cache/refresh-external`, options);
    const responseCode = response.getResponseCode();
    const responseData = JSON.parse(response.getContentText());
    
    if (responseCode === 200 && responseData.success) {
      console.log(`✅ 快取刷新成功！專案數: ${responseData.projects?.length || 0}`);
      return responseData;
    } else {
      const errorDetail = responseData.error || responseData.details;
      throw new Error(`API 回應錯誤 (${responseCode}): ${errorDetail}`);
    }
    
  } catch (error) {
    console.error(`❌ 快取刷新失敗: ${error.message}`);
    throw error;
  }
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