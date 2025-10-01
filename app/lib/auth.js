import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// 簡單的用戶資料庫（實際應用中應該使用真實資料庫）
const USERS = [
  {
    id: '1',
    username: 'admin',
    password: hashPassword('admin123'), // 預設密碼
    role: 'admin'
  },
  {
    id: '2', 
    username: 'user',
    password: hashPassword('user123'), // 預設密碼
    role: 'user'
  }
];

// 從環境變數獲取額外用戶（可選）
if (process.env.AUTH_USERS) {
  try {
    const envUsers = JSON.parse(process.env.AUTH_USERS);
    envUsers.forEach(user => {
      USERS.push({
        ...user,
        password: hashPassword(user.password)
      });
    });
  } catch (error) {
    console.error('Failed to parse AUTH_USERS:', error);
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 小時

// 密碼雜湊
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'salt').digest('hex');
}

// 驗證密碼
function verifyPassword(password, hashedPassword) {
  return hashPassword(password) === hashedPassword;
}

// 創建 JWT token
function createToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + (SESSION_DURATION / 1000)
  };
  
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payloadEncoded}`)
    .digest('base64url');
    
  return `${header}.${payloadEncoded}.${signature}`;
}

// 驗證 JWT token
function verifyToken(token) {
  try {
    const [header, payload, signature] = token.split('.');
    
    // 驗證簽名
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');
      
    if (signature !== expectedSignature) {
      return null;
    }
    
    // 解析 payload
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    
    // 檢查過期時間
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    
    return decoded;
  } catch (error) {
    return null;
  }
}

// 登入驗證
export async function authenticate(username, password) {
  const user = USERS.find(u => u.username === username);
  if (!user || !verifyPassword(password, user.password)) {
    return null;
  }
  
  const token = createToken(user);
  return {
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    },
    token
  };
}

// 獲取當前用戶
export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;
    
    if (!token) {
      return null;
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
      return null;
    }
    
    return {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role
    };
  } catch (error) {
    return null;
  }
}

// 設定認證 cookie
export function setAuthCookie(token) {
  const cookieStore = cookies();
  cookieStore.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION / 1000,
    path: '/'
  });
}

// 清除認證 cookie
export function clearAuthCookie() {
  const cookieStore = cookies();
  cookieStore.delete('auth-token');
}

// 檢查是否需要認證的中間件
export function requireAuth(handler) {
  return async (req, context) => {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // 將用戶資訊添加到請求中
    req.user = user;
    return handler(req, context);
  };
}

// 檢查管理員權限
export function requireAdmin(handler) {
  return async (req, context) => {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    req.user = user;
    return handler(req, context);
  };
}