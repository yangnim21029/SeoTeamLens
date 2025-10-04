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
      console.log(`刷新的 URL 數: ${responseData.refreshedUrls?.length || 0}`);
      
      // 等待 2 秒讓 cache 完全寫入
      Utilities.sleep(2000);
      
      // 檢查 Redis cache 狀態
      console.log('檢查 Redis cache 狀態...');
      checkCacheCount();
      
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
 * 檢查 Redis cache 數量
 */
function checkCacheCount() {
  try {
    const response = UrlFetchApp.fetch(`${CONFIG.SITE_URL}/api/debug/redis-keys?secret=${CONFIG.SECRET}`);
    const data = JSON.parse(response.getContentText());
    
    if (data.success) {
      console.log('📊 Redis Cache 統計:');
      console.log(`總 keys: ${data.total_keys}`);
      console.log(`- Projects: ${data.keys_by_type.projects}`);
      console.log(`- Run-CSV: ${data.keys_by_type['run-csv']}`);
      console.log(`- Page-Metrics: ${data.keys_by_type['page-metrics']}`);
      
      // 計算預期數量
      const expectedProjects = 1;
      const expectedPerApi = 8 * CONFIG.DAYS.length; // 8 專案 × 天數
      const expectedTotal = expectedProjects + expectedPerApi * 2; // projects + run-csv + page-metrics
      
      console.log('🎯 預期數量:');
      console.log(`- Projects: ${expectedProjects}`);
      console.log(`- Run-CSV: ${expectedPerApi} (8專案 × ${CONFIG.DAYS.length}天數)`);
      console.log(`- Page-Metrics: ${expectedPerApi} (8專案 × ${CONFIG.DAYS.length}天數)`);
      console.log(`- 總計: ${expectedTotal}`);
      
      // 檢查是否符合預期
      const actualTotal = data.total_keys;
      if (actualTotal >= expectedTotal * 0.9) { // 允許 10% 誤差
        console.log('✅ Cache 數量正常！');
      } else {
        console.log(`⚠️ Cache 數量可能不足 (實際: ${actualTotal}, 預期: ${expectedTotal})`);
      }
      
      return data;
    } else {
      console.error('❌ 無法檢查 cache 狀態:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ 檢查 cache 數量失敗:', error.message);
    return null;
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