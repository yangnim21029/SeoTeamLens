"use client";

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/app/context/auth-context';
import { User, LogOut, Settings, ChevronDown } from 'lucide-react';

export default function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const { user, logout, isAdmin } = useAuth();

  // 點擊外部關閉選單
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    setIsOpen(false);
  };

  if (!user) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-blue-600" />
        </div>
        <div className="hidden sm:block text-left">
          <div className="text-sm font-medium">{user.username}</div>
          <div className="text-xs text-slate-500">
            {isAdmin ? '管理員' : '用戶'}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
          <div className="px-4 py-2 border-b border-slate-100">
            <div className="text-sm font-medium text-slate-900">{user.username}</div>
            <div className="text-xs text-slate-500">{user.role}</div>
          </div>
          
          <button
            onClick={() => setIsOpen(false)}
            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
          >
            <Settings className="w-4 h-4" />
            <span>設定</span>
          </button>
          
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
          >
            <LogOut className="w-4 h-4" />
            <span>登出</span>
          </button>
        </div>
      )}
    </div>
  );
}