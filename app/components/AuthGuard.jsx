"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/context/auth-context';

export default function AuthGuard({ children, requireAdmin = false }) {
  const { user, loading, isAuthenticated, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        router.push('/login');
        return;
      }
      
      if (requireAdmin && !isAdmin) {
        router.push('/');
        return;
      }
    }
  }, [loading, isAuthenticated, isAdmin, requireAdmin, router]);

  // 顯示載入中
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-slate-600">驗證中...</div>
        </div>
      </div>
    );
  }

  // 未登入
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="text-slate-600">重定向到登入頁面...</div>
        </div>
      </div>
    );
  }

  // 需要管理員權限但用戶不是管理員
  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="text-red-600">您沒有權限訪問此頁面</div>
        </div>
      </div>
    );
  }

  return children;
}