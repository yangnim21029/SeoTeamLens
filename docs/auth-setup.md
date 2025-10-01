# RankLens 認證系統使用說明

## 🎯 功能概述

RankLens 現在包含一個完整的自訂認證系統，提供：

- 🔐 帳號密碼登入
- 👤 用戶角色管理（管理員/一般用戶）
- 🛡️ API 端點保護
- 🍪 安全的 JWT Cookie 認證
- 📱 響應式登入介面

## 🚀 預設帳號

系統預設提供兩個測試帳號：

### 管理員帳號
- **用戶名**: `admin`
- **密碼**: `admin123`
- **權限**: 完整系統存取權限

### 一般用戶帳號
- **用戶名**: `user`
- **密碼**: `user123`
- **權限**: 基本功能存取權限

## 🔧 環境變數設定

在 `.env.local` 中添加以下設定：

```bash
# JWT 密鑰（生產環境請務必更改）
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"

# 可選：從環境變數添加額外用戶
AUTH_USERS='[{"id":"3","username":"demo","password":"demo123","role":"user"}]'
```

## 📱 使用方式

### 1. 訪問應用
- 訪問任何受保護的頁面會自動重定向到登入頁面
- 登入頁面路徑：`/login`

### 2. 登入流程
1. 輸入用戶名和密碼
2. 點擊「登入」按鈕
3. 成功後自動重定向到首頁

### 3. 用戶選單
登入後，右上角會顯示用戶選單，包含：
- 用戶資訊顯示
- 設定選項
- 登出功能

## 🛡️ 安全特性

### JWT Token
- 使用 HS256 算法簽名
- 24 小時有效期
- HttpOnly Cookie 儲存
- 自動過期處理

### 密碼安全
- SHA-256 雜湊 + Salt
- 不儲存明文密碼
- 安全的密碼驗證

### API 保護
- 重要 API 需要認證
- 管理員功能需要管理員權限
- 自動權限檢查

## 🔐 權限系統

### 一般用戶 (user)
- ✅ 查看排名資料
- ✅ 使用基本功能
- ❌ 管理系統設定

### 管理員 (admin)
- ✅ 所有一般用戶權限
- ✅ 快取管理
- ✅ 系統設定
- ✅ 用戶管理

## 🔄 API 端點

### 認證相關
- `POST /api/auth/login` - 用戶登入
- `POST /api/auth/logout` - 用戶登出
- `GET /api/auth/me` - 獲取當前用戶資訊

### 受保護的 API
- `POST /api/cache/refresh` - 需要管理員權限
- `GET /api/cache/status` - 需要認證

## 🎨 自訂用戶

### 方法 1：環境變數
在 `.env.local` 中設定 `AUTH_USERS`：

```bash
AUTH_USERS='[
  {
    "id": "3",
    "username": "custom_user",
    "password": "secure_password",
    "role": "user"
  },
  {
    "id": "4", 
    "username": "custom_admin",
    "password": "admin_password",
    "role": "admin"
  }
]'
```

### 方法 2：修改程式碼
編輯 `app/lib/auth.js` 中的 `USERS` 陣列：

```javascript
const USERS = [
  {
    id: '1',
    username: 'admin',
    password: hashPassword('admin123'),
    role: 'admin'
  },
  // 添加新用戶...
];
```

## 🚨 生產環境注意事項

### 1. 更改預設密碼
```bash
# 生產環境必須更改
JWT_SECRET="your-production-jwt-secret-key"
```

### 2. 使用 HTTPS
- 確保生產環境使用 HTTPS
- Cookie 會自動設定 `secure` 標誌

### 3. 密碼政策
- 建議使用強密碼
- 定期更換密碼
- 考慮實施密碼複雜度要求

### 4. 監控和日誌
- 監控登入失敗次數
- 記錄安全相關事件
- 定期檢查存取日誌

## 🔧 故障排除

### 常見問題

1. **無法登入**
   - 檢查用戶名和密碼是否正確
   - 確認 JWT_SECRET 已設定
   - 檢查瀏覽器 Cookie 設定

2. **權限不足**
   - 確認用戶角色設定正確
   - 檢查 API 權限要求

3. **Session 過期**
   - 重新登入即可
   - 檢查系統時間是否正確

### 除錯模式
在開發環境中，可以檢查：
- 瀏覽器開發者工具的 Network 標籤
- 伺服器控制台日誌
- Cookie 儲存狀況

## 🎯 未來擴展

系統設計支援未來擴展：
- 資料庫用戶儲存
- OAuth 第三方登入
- 雙因素認證
- 密碼重設功能
- 用戶註冊功能

---

現在你的 RankLens 應用已經具備完整的認證保護！🎉