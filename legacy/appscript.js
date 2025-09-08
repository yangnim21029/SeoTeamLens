/**
 * ===============================================================
 * 設定函數 (CONFIGURATION FUNCTIONS)
 * ===============================================================
 * 每個函數負責回傳一份報告所需的完整設定。
 * 這種方式可以避免全域變數污染。
 */

/**
 * @returns {object} HSHK 報告的設定物件。
 */
function getHshkConfig() {
    return {
      spreadsheetId: '1jVKIo3oGzIxWSOe6FLwgKmwWHWiDdomxo44f69l140A',
      sourceSheetName: 'HSHK 總表(更新中）',
      destinationSheetName: 'HSHK Ranking',
      gscSite: 'sc-domain:holidaysmart.io',
      keywordsCol: 10, // J 欄
      pageUrlCol: 15   // O 欄
    };
  }
  
  /**
   * @returns {object} Top Page 報告的設定物件。
   */
  function getTopPageConfig() {
    return {
      spreadsheetId: '1jVKIo3oGzIxWSOe6FLwgKmwWHWiDdomxo44f69l140A',
      sourceSheetName: 'Top Page_1 phase',
      destinationSheetName: 'TopPage GSHK Ranking',
      gscSite: 'sc-domain:pretty.presslogic.com',
      keywordsCol: 6,  // F 欄
      pageUrlCol: 9    // I 欄
    };
  }
  
  
  /**
   * ===============================================================
   * 啟動函數 (TRIGGERS)
   * ===============================================================
   * 從 Apps Script 編輯器執行這些函數來產生對應的報告。
   */
  
  /**
   * 產生 HSHK 報告。
   */
  function runHSHKReport() {
    Logger.log('--- 開始執行 HSHK 報告 ---');
    // 1. 呼叫設定函數取得設定
    const config = getHshkConfig();
    // 2. 將設定傳遞給核心函數執行
    runReportGenerator(config);
    Logger.log('--- HSHK 報告執行完畢 ---');
  }
  
  /**
   * 產生 Top Page 報告。
   */
  function runTopPageReport() {
    Logger.log('--- 開始執行 Top Page 報告 ---');
    // 1. 呼叫設定函數取得設定
    const config = getTopPageConfig();
    // 2. 將設定傳遞給核心函數執行
    runReportGenerator(config);
    Logger.log('--- Top Page 報告執行完畢 ---');
  }
  
  
  /**
   * ===============================================================
   * 核心邏輯函數 (CORE LOGIC)
   * ===============================================================
   * 這個是主要的通用函數，由設定檔驅動。
   * 一般情況下，您不需再修改此函數的內容。
   * @param {object} config 包含報告所有設定的物件。
   */
  function runReportGenerator(config) {
    // --- 從 config 物件解構出所有設定 ---
    const {
      spreadsheetId, // 每個設定物件都應包含 spreadsheetId
      sourceSheetName,
      destinationSheetName,
      gscSite,
      keywordsCol,
      pageUrlCol
    } = config;
  
    // 使用傳入的 spreadsheetId 開啟檔案
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sourceSheet = ss.getSheetByName(sourceSheetName);
  
    if (!sourceSheet) {
      Logger.log(`錯誤：找不到來源工作表 "${sourceSheetName}"。`);
      return;
    }
  
    // 獲取或創建目標工作表
    let destSheet = ss.getSheetByName(destinationSheetName);
    if (!destSheet) {
      destSheet = ss.insertSheet(destinationSheetName);
    }
    destSheet.clear(); // 清空舊資料
  
    // --- 步驟 1: 準備標頭 ---
    const dateHeaders = [];
    const dateHeaderMap = new Map();
    const today = new Date();
    for (let i = 0; i < 21; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const formattedDate = Utilities.formatDate(date, 'UTC', "yyyy-MM-dd");
      dateHeaders.unshift(formattedDate);
    }
  
    const headers = ["Page", "Keyword", ...dateHeaders];
    destSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    headers.forEach((header, index) => {
      dateHeaderMap.set(header, index + 1);
    });
  
    // --- 步驟 2: 讀取來源資料並建立報告骨架 & SQL 條件 ---
    const maxCol = Math.max(keywordsCol, pageUrlCol); // 確保讀取的範圍足夠寬
    const sourceData = sourceSheet.getRange(2, 1, sourceSheet.getLastRow() - 1, maxCol).getValues();
  
    const whereConditions = [];
    const reportData = new Map();
    const canonicalUrlMap = new Map();
  
    for (const row of sourceData) {
      const pageUrl = row[pageUrlCol - 1];
      const queriesRaw = row[keywordsCol - 1];
  
      if (typeof pageUrl !== 'string' || pageUrl.trim() === '' || !queriesRaw) {
        continue;
      }
  
      const pageIdMatch = pageUrl.match(/\/article\/(\d+)/);
      if (!pageIdMatch) continue;
      const pageId = pageIdMatch[1];
  
      if (!canonicalUrlMap.has(pageId)) {
        canonicalUrlMap.set(pageId, pageUrl);
      }
      const canonicalUrl = canonicalUrlMap.get(pageId);
  
      const queriesFromSheet = queriesRaw.toString().split('\n');
      const cleanedQueriesForSql = [];
  
      for (const query of queriesFromSheet) {
        const originalQuery = query.replace(/\(\d+\)/, '').trim();
        if (originalQuery === '') continue;
  
        const spacelessQuery = originalQuery.replace(/\s/g, '');
        cleanedQueriesForSql.push(`'${spacelessQuery}'`);
  
        const key = `${pageId}||${spacelessQuery}`;
  
        if (!reportData.has(key)) {
          reportData.set(key, {
            page: canonicalUrl,
            query: originalQuery,
            positions: new Map()
          });
        }
      }
  
      if (cleanedQueriesForSql.length > 0) {
        const condition = `(page LIKE '%${pageId}%' AND REPLACE(query, ' ', '') IN (${cleanedQueriesForSql.join(', ')}))`;
        whereConditions.push(condition);
      }
    }
  
    if (whereConditions.length === 0) {
      Logger.log(`在來源工作表 "${sourceSheetName}" 中沒有找到任何有效的查詢條件。`);
      return;
    }
  
    // --- 步驟 3: 建立並發送 SQL 請求 ---
    const combinedWhereClause = whereConditions.join(' OR \n    ');
    const sql = `
      SELECT date::DATE, query, page, AVG(position) AS avg_position
      FROM {site_hourly}
      WHERE date::DATE >= CURRENT_DATE - INTERVAL '21 days'
      AND (
        ${combinedWhereClause}
      )
      GROUP BY date::DATE, query, page
      ORDER BY date::DATE, query;
    `;
  
    const apiUrl = 'https://unbiased-remarkably-arachnid.ngrok-free.app/api/query';
    const allResults = [];
  
    try {
      const payload = { "data_type": "hourly", "site": gscSite, "sql": sql.trim() };
      const options = { 'method': 'post', 'contentType': 'application/json', 'payload': JSON.stringify(payload), 'muteHttpExceptions': true };
  
      Logger.log(`正在為 [${gscSite}] 發送組合的 SQL 請求...`);
      const response = UrlFetchApp.fetch(apiUrl, options);
      const responseCode = response.getResponseCode();
  
      if (responseCode === 200) {
        const data = JSON.parse(response.getContentText());
        if (Array.isArray(data.results)) {
          allResults.push(...data.results);
          Logger.log(`成功從 API 獲取到 ${data.results.length} 筆資料。`);
        }
      } else {
        Logger.log(`請求失敗，狀態碼: ${responseCode}, 回應: ${response.getContentText()}`);
      }
    } catch (e) {
      Logger.log(`請求時發生錯誤: ${e.toString()}`);
    }
  
    // --- 步驟 4: 將 API 回應填入報告骨架 ---
    for (const result of allResults) {
      const dateValue = result["CAST(date AS DATE)"];
      if (!result || !dateValue || !result.page || !result.query) {
        continue;
      }
  
      const pageIdMatch = result.page.match(/\/article\/(\d+)/);
      if (!pageIdMatch) continue;
      const pageId = pageIdMatch[1];
  
      const spacelessQuery = result.query.replace(/\s/g, '');
      const key = `${pageId}||${spacelessQuery}`;
  
      if (!reportData.has(key)) {
        if (!canonicalUrlMap.has(pageId)) {
          canonicalUrlMap.set(pageId, result.page);
        }
        const canonicalUrl = canonicalUrlMap.get(pageId);
        reportData.set(key, {
          page: canonicalUrl,
          query: result.query,
          positions: new Map()
        });
      }
  
      const dateObject = new Date(dateValue);
      const formattedDate = Utilities.formatDate(dateObject, 'UTC', "yyyy-MM-dd");
  
      const reportItem = reportData.get(key);
      reportItem.positions.set(formattedDate, parseFloat(result.avg_position).toFixed(2));
    }
  
    // --- 步驟 5: 整理並寫入最終報告 ---
    if (reportData.size > 0) {
      const sortedData = Array.from(reportData.values()).sort((a, b) => a.page.localeCompare(b.page));
  
      const dataToWrite = [];
      for (const item of sortedData) {
        const row = Array(headers.length).fill('');
        row[0] = item.page;
        row[1] = item.query;
  
        for (const [date, position] of item.positions.entries()) {
          if (dateHeaderMap.has(date)) {
            const colIndex = dateHeaderMap.get(date) - 1;
            row[colIndex] = position;
          }
        }
        dataToWrite.push(row);
      }
  
      destSheet.getRange(2, 1, dataToWrite.length, headers.length).setValues(dataToWrite);
      Logger.log(`報告 "${destinationSheetName}" 已成功生成，共處理 ${dataToWrite.length} 個關鍵字組合。`);
  
      // --- 步驟 6: 合併 Page 欄中相同的儲存格 ---
      if (dataToWrite.length > 1) {
        let mergeStartRow = 2;
        for (let i = 1; i < dataToWrite.length; i++) {
          if (dataToWrite[i][0] !== dataToWrite[i - 1][0]) {
            const numRowsToMerge = i + 1 - mergeStartRow;
            if (numRowsToMerge > 1) {
              destSheet.getRange(mergeStartRow, 1, numRowsToMerge, 1).mergeVertically();
            }
            mergeStartRow = i + 2;
          }
        }
        const numRowsInLastBlock = dataToWrite.length + 1 - mergeStartRow;
        if (numRowsInLastBlock > 1) {
          destSheet.getRange(mergeStartRow, 1, numRowsInLastBlock, 1).mergeVertically();
        }
        Logger.log('已完成 Page 欄的儲存格合併。');
      }
  
    } else {
      Logger.log(`沒有從 API 獲取到任何數據，報告 "${destinationSheetName}" 為空。`);
    }
  }