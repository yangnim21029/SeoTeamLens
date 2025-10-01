import { NextResponse } from 'next/server';
import { authenticate, setAuthCookie } from '@/app/lib/auth';

export async function POST(req) {
  try {
    const { username, password } = await req.json();
    
    if (!username || !password) {
      return NextResponse.json(
        { error: '請輸入用戶名和密碼' },
        { status: 400 }
      );
    }
    
    const result = await authenticate(username, password);
    
    if (!result) {
      return NextResponse.json(
        { error: '用戶名或密碼錯誤' },
        { status: 401 }
      );
    }
    
    // 設定認證 cookie
    const response = NextResponse.json({
      success: true,
      user: result.user,
      message: '登入成功'
    });
    
    response.cookies.set('auth-token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 小時
      path: '/'
    });
    
    return response;
    
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: '登入失敗，請稍後再試' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';