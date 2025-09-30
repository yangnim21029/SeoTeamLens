# 自動快取刷新設定指南

## 概述

這個系統可以讓你使用 Google Apps Script 定期自動刷新 RankLens 的快取，確保資料保持最新。

## 設定步驟

### 1. 設定環境變數

在你的 `.env.local` 檔案中添加：

```bash
CACHE_REFRESH_SECRET=your-super-secret-key-here
```

### 2. 創建 Google Apps Script

1. 前往 [Google Apps Script](https://script.google.com/)
2. 點擊「新專案」
3. 將 `scripts/cache-refresh.gs` 的內容貼上
4. 修改 `CONFIG` 區域的設定：
   ```javascript
   const CONFIG = {
     SITE_URL: 'https://your-actual-domain.com',
     SECRET: 'your-super-secret-key-here', // 與環境變數相同
     PROJECT_IDS: [], // 留空刷新所有專案，或指定特定專案
     DAYS: [7, 30, 60], // 要刷新的天數組合
   };
   ```

### 3. 測試設定

1. 在 Apps Script 中執行 `testCacheRefresh()` 函數
2. 檢查執行日誌確認是否成功
3. 如果失敗，檢查 URL 和密鑰是否正確

### 4. 設定自動觸發器

1. 執行 `setupTriggers()` 函數來創建定期觸發器
2. 或者手動在 Apps Script 介面中設定觸發器：
   - 觸發器類型：時間驅動
   - 事件來源：時間驅動
   - 時間間隔：每 4 小時（或你偏好的間隔）

## API 端點說明

### POST /api/cache/refresh

刷新指定專案的快取。

**請求體：**
```json
{
  "secret": "your-secret-key",
  "projectIds": ["project1", "project2"], // 可選，留空則刷新所有
  "days": [7, 30, 60] // 可選，預設為 [7, 30, 60]
}
```

**回應：**
```json
{
  "success": true,
  "message": "Cache refreshed for 2 projects with 3 day periods each",
  "refreshedTags": ["run-csv:project1:7days", "page-metrics:project1:7days", ...],
  "refreshedUrls": ["https://domain.com/api/run-csv/project1?days=7&refresh=1", ...],
  "projects": ["project1", "project2"],
  "days": [7, 30, 60],
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### GET /api/cache/refresh

也支援 GET 請求，方便測試：

```
GET /api/cache/refresh?secret=your-secret-key&projectIds=project1,project2&days=7,30,60
```

## 手動刷新

你也可以在瀏覽器中手動觸發刷新：

```
https://your-domain.com/api/cache/refresh?secret=your-secret-key
```

## 監控和通知

### Slack/Discord 通知

可以設定 webhook 來接收刷新狀態通知：

```javascript
NOTIFICATIONS: {
  enabled: true,
  webhookUrl: 'https://hooks.slack.com/services/...' // 或 Discord webhook
}
```

### 日誌監控

在 Google Apps Script 的執行記錄中可以查看：
- 執行時間
- 成功/失敗狀態
- 刷新的快取標籤數量

## 故障排除

### 常見問題

1. **401 Unauthorized**
   - 檢查 `CACHE_REFRESH_SECRET` 環境變數
   - 確認 Apps Script 中的 `SECRET` 設定正確

2. **500 Internal Server Error**
   - 檢查網站 URL 是否正確
   - 確認專案 ID 格式正確

3. **觸發器不執行**
   - 檢查 Google Apps Script 的觸發器設定
   - 確認 Google 帳號有足夠權限

4. **Vercel 快取問題**
   - 檢查 Vercel 函數日誌
   - 使用 `/api/cache/status?secret=your-key` 檢查快取狀態
   - 查看回應 headers 中的 `X-Cache-Duration` 來判斷是否命中快取

### Vercel 特定設定

在 Vercel 上部署時，確保：

1. **環境變數**：在 Vercel Dashboard 中設定 `CACHE_REFRESH_SECRET`
2. **函數超時**：`vercel.json` 中已設定適當的超時時間
3. **Runtime**：使用 Node.js runtime 而非 Edge Runtime
4. **快取檢查**：使用 `GET /api/cache/status?secret=your-key` 檢查系統狀態
5. **Google Apps Script**：免費版 Vercel 不支援 cron jobs，使用 Google Apps Script 定期觸發

### Google Apps Script 額外功能

```javascript
// 檢查快取系統狀態
checkCacheStatus()

// 測試 API 快取效果
testApiCache()

// 完整的快取刷新
refreshCache()
```

### 測試指令

```javascript
// 在 Apps Script 中執行這些函數來測試
testCacheRefresh()     // 測試完整快取刷新（所有專案 + 所有天數）
testSingleProject()    // 測試單一專案（快速測試）
getProjectList()       // 獲取所有專案 ID
setupTriggers()        // 設定自動觸發器
```

## 安全考量

1. **密鑰安全**：不要在程式碼中硬編碼密鑰
2. **存取控制**：只有知道密鑰的人才能觸發刷新
3. **頻率限制**：避免過於頻繁的刷新請求

## 建議的刷新頻率

- **一般使用**：每 4 小時
- **高頻更新需求**：每 2 小時
- **低頻使用**：每 8-12 小時

根據你的資料更新頻率和使用需求來調整。