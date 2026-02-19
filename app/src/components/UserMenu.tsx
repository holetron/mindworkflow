import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function UserMenu() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleNavigate = (path: string) => {
    setIsOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    setIsOpen(false);
    logout();
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Menu button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600 transition-colors"
      >
        <span>{user?.name || 'User'}</span>
        <svg 
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-700 bg-slate-800 shadow-xl z-50">
          {/* User info */}
          <div className="border-b border-slate-700 px-4 py-3">
            <p className="text-sm font-medium text-white">{user?.name}</p>
            <p className="text-xs text-slate-400">{user?.email}</p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <div
              onClick={() => handleNavigate('/agents')}
              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors text-left cursor-pointer"
            >
              <span className="text-lg">🤖</span>
              <span>My agents</span>
            </div>

            <div
              onClick={() => handleNavigate('/settings')}
              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors text-left cursor-pointer"
            >
              <span className="text-lg">⚙️</span>
              <span>Account Settings</span>
            </div>

            {user?.is_admin && (
              <div
                onClick={() => handleNavigate('/admin')}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-amber-300 hover:bg-slate-700 transition-colors text-left cursor-pointer"
              >
                <span className="text-lg">👑</span>
                <span>Admin Panel</span>
              </div>
            )}
          </div>

          {/* Logout */}
          <div className="border-t border-slate-700 py-1">
            <div
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-300 hover:bg-slate-700 transition-colors text-left cursor-pointer"
            >
              <span className="text-lg">🚪</span>
              <span>Log out</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
