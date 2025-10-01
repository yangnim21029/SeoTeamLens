import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: '登出成功'
  });
  
  // 清除認證 cookie
  response.cookies.delete('auth-token');
  
  return response;
}

export const runtime = 'nodejs';