
/**
 * @fileoverview
 * Google Apps Script to sync data to a Vercel/Neon DB via a Vercel Serverless Function API.
 * This script is modified to only export specific columns ('url', 'GoalKeyword', 'TrackingTag', 'Editor')
 * with case-insensitive header matching, reading headers from the second row.
 * It also processes 'GoalKeyword' to support both comma and newline separated values.
 *
 * @version 3.5.0 (Add Editor column export)
 * @author Gemini
 * @license Apache-2.0
 */

// ===============================================================
// 1. 設定區
// ===============================================================
const API_SYNC_CONFIG = {
  apiUrlKey: 'VERCEL_API_URL',
  apiKeyKey: 'VERCEL_API_KEY',
};

// ===============================================================
// 2. 主要同步邏輯 (無需修改)
// ===============================================================
function apiSync_main() {
  const ui = SpreadsheetApp.getUi();
  try {
    const properties = PropertiesService.getScriptProperties();
    const apiUrl = properties.getProperty(API_SYNC_CONFIG.apiUrlKey);
    const apiKey = properties.getProperty(API_SYNC_CONFIG.apiKeyKey);

    if (!apiUrl || !apiKey) {
      throw new Error('尚未在「指令碼屬性」中設定 VERCEL_API_URL 和 VERCEL_API_KEY。');
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const sheetName = sheet.getName();
    // 使用修改後的函式來轉換資料
    const jsonData = apiSync_convertSheetDataToJson(sheet);

    if (jsonData.length === 0) {
      ui.alert('提示', '當前工作表中沒有可同步的資料 (請確保 url 欄位存在且資料從第三列開始)。', ui.ButtonSet.OK);
      return;
    }

    const payload = {
      sheetName: sheetName,
      jsonData: jsonData,
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': apiKey,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(apiUrl, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode >= 400) {
      throw new Error(`API 請求失敗。狀態碼: ${responseCode}, 回應: ${responseBody}`);
    }

    Logger.log(`API 請求成功: ${responseBody}`);
    ui.alert('成功！', `工作表 "${sheetName}" 的資料已透過 API 成功同步。`, ui.ButtonSet.OK);

  } catch (e) {
    Logger.log(`錯誤: ${e.message}`);
    ui.alert('發生錯誤！', `API 同步失敗，請檢查日誌。\n錯誤訊息：${e.message}`, ui.ButtonSet.OK);
  }
}

// ===============================================================
// 3. 資料轉換邏輯 (★ 主要修改部分 ★)
// ===============================================================
/**
 * 將工作表資料轉換為 JSON 格式。此版本從第二行讀取標頭，第三行開始讀取資料。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The sheet to convert.
 * @returns {Array<Object>} An array of objects, where each object represents a row.
 */
function apiSync_convertSheetDataToJson(sheet) {
  const lastRow = sheet.getLastRow();
  // 因為標頭在第 2 列，資料從第 3 列開始，所以至少要有 3 列才有意義
  if (lastRow < 3) {
    Logger.log('工作表沒有資料列可供處理 (標頭在第二列，資料需從第三列開始)。');
    return [];
  }

  const lastCol = sheet.getLastColumn();
  
  // 1. 從【第二列】讀取所有標頭，並進行標準化
  const allHeaders = sheet.getRange(2, 1, 1, lastCol).getValues()[0]
    .map(header => (typeof header === 'string' ? header.toLowerCase().trim() : ''));

  // 2. 定義需要匯出的欄位名稱 (統一使用小寫)
  const desiredHeaders = ['url', 'goalkeyword', 'trackingtag', 'editor'];
  
  // 3. 建立映射，儲存所需欄位的名稱及其在工作表中的索引位置
  const headerIndexMap = new Map();
  desiredHeaders.forEach(desired => {
    const index = allHeaders.indexOf(desired);
    if (index > -1) {
      headerIndexMap.set(desired, index);
    } else {
      Logger.log(`警告：在工作表中找不到標頭 "${desired}"。`);
    }
  });
  
  if (headerIndexMap.size === 0) {
    SpreadsheetApp.getUi().alert('錯誤', '在第二列的標頭中找不到任何指定的欄位 (url, GoalKeyword, TrackingTag)，無法同步。', SpreadsheetApp.getUi().ButtonSet.OK);
    throw new Error('在第二列找不到指定的標頭欄位。');
  }

  // 4. 取得從【第三列】開始的所有資料
  const dataRange = sheet.getRange(3, 1, lastRow - 2, lastCol);
  const values = dataRange.getValues();

  // 5. 根據 headerIndexMap 建立只包含所需欄位的物件
  const results = values.map(row => {
    const obj = {};
    for (const [headerName, index] of headerIndexMap.entries()) {
      if (index !== undefined) {
          let cellValue = row[index];
          // ★ 修改：如果欄位是 goalkeyword，則支援以逗號或換行分隔
          if (headerName === 'goalkeyword' && typeof cellValue === 'string' && cellValue.trim() !== '') {
            obj[headerName] = cellValue
                .replace(/\n/g, ',')      // 將所有換行符號轉換為逗號
                .split(',')               // 使用逗號分割成陣列
                .map(kw => kw.trim())     // 清理每個關鍵字前後的空格
                .filter(kw => kw !== ''); // 過濾掉因多餘逗號產生的空字串
          } else if (headerName === 'editor') {
            obj[headerName] = typeof cellValue === 'string'
              ? cellValue.trim()
              : (cellValue != null ? String(cellValue).trim() : '');
          } else {
            // 其他欄位維持原樣
            obj[headerName] = cellValue;
          }
      }
    }
    return obj;
  })
  // 6. 過濾掉沒有 url 的資料列
  .filter(obj => obj.url && String(obj.url).trim() !== '');
  
  return results;
}

// ===============================================================
// 4. UI 選單 (無需修改)
// ===============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('輸出表格到資料庫')
    .addItem('同步「當前」工作表', 'apiSync_main')
    .addToUi();
}
