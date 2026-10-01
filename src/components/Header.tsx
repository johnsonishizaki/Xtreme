import React, { useState } from 'react';
import {
  Calendar,
  FileSpreadsheet,
  History,
  Settings as SettingsIcon,
  LogIn,
  LogOut,
  User
} from 'lucide-react';
import { Roster } from '../types';
import { useAuth } from '../services/auth.tsx';

interface HeaderProps {
  activeTab: 'home' | 'roster' | 'history' | 'settings';
  setActiveTab: (tab: 'home' | 'roster' | 'history' | 'settings') => void;
  activeRoster: Roster | null;
  isSundayPending: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  activeRoster,
  isSundayPending
}) => {
  const { user, loginWithGoogle, logout, loading } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-[#0b0b0d]/85 border-b border-white/[0.08] backdrop-blur-2xl px-4 sm:px-8 py-3.5 transition-colors">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center justify-between">
          <div 
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-[42px] h-[42px] bg-emerald-500 text-black flex items-center justify-center font-black text-xl rounded-lg shadow-sm shrink-0 transition-transform active:scale-95">
              X
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm sm:text-base font-extrabold tracking-widest uppercase transition-colors text-white group-hover:text-emerald-400">
                  XTREME
                </h1>
                <span className="text-[10px] font-mono font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-emerald-500 text-black">
                  DUTY
                </span>
              </div>
              <p className="text-[10px] font-mono tracking-wider uppercase text-slate-400 opacity-60">
                System v4.3.3 / Active
              </p>
            </div>
          </div>

          {/* Mobile Login */}
          <div className="sm:hidden flex items-center gap-2">
            {loading ? (
              <div className="w-6 h-6 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
            ) : user ? (
              <img 
                src={user.photoURL || undefined} 
                alt={user.displayName || 'User'} 
                className="w-8 h-8 rounded-full border border-emerald-500/40 cursor-pointer"
                onClick={() => setShowDropdown(!showDropdown)}
              />
            ) : (
              <button
                onClick={loginWithGoogle}
                className="p-2 rounded-xl border text-xs font-mono active:scale-95 bg-white/[0.03] border-white/[0.08] text-emerald-400"
              >
                <LogIn className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation & Controls */}
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 p-1 rounded-xl border bg-black/40 border-white/[0.08]">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className={`relative px-3 py-1.5 rounded-lg font-mono text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeTab === 'home'
                  ? 'bg-emerald-500 text-black font-bold shadow-md'
                  : 'text-slate-400 hover:text-white opacity-70 hover:opacity-100'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className={activeTab === 'home' ? 'inline' : 'hidden md:inline'}>Duty</span>
              {isSundayPending && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-emerald-400 animate-pulse" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('roster')}
              className={`relative px-3 py-1.5 rounded-lg font-mono text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeTab === 'roster'
                  ? 'bg-emerald-500 text-black font-bold shadow-md'
                  : 'text-slate-400 hover:text-white opacity-70 hover:opacity-100'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className={activeTab === 'roster' ? 'inline' : 'hidden md:inline'}>Roster</span>
              {!activeRoster && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-slate-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg font-mono text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-emerald-500 text-black font-bold shadow-md'
                  : 'text-slate-400 hover:text-white opacity-70 hover:opacity-100'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span className={activeTab === 'history' ? 'inline' : 'hidden md:inline'}>History</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-lg font-mono text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeTab === 'settings'
                  ? 'bg-emerald-500 text-black font-bold shadow-md'
                  : 'text-slate-400 hover:text-white opacity-70 hover:opacity-100'
              }`}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              <span className={activeTab === 'settings' ? 'inline' : 'hidden md:inline'}>Settings</span>
            </button>
          </nav>

          {/* Desktop Auth Button */}
          <div className="hidden sm:block relative">
            {loading ? (
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
            ) : user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer bg-white/[0.03] border-white/[0.08] text-slate-200 hover:bg-white/[0.06]"
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-4 h-4 rounded-full" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                  <span className="max-w-[110px] truncate">{user.displayName || user.email}</span>
                </button>

                {showDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-48 border rounded-2xl shadow-2xl py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150 bg-[#0b0b0d] border-white/[0.08] text-white">
                    <div className="px-4 py-2 border-b border-white/[0.08]">
                      <p className="text-xs font-bold truncate">{user.displayName}</p>
                      <p className="text-[10px] font-mono text-slate-400 truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={() => {
                        logout();
                        setShowDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-mono text-rose-500 hover:bg-rose-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs font-mono uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-md shadow-emerald-500/20"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Google Sign In</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {showDropdown && user && (
        <div className="sm:hidden mt-2 border rounded-2xl shadow-xl p-3 flex items-center justify-between bg-[#0b0b0d] border-white/[0.08] text-white">
          <div>
            <p className="text-xs font-bold">{user.displayName}</p>
            <p className="text-[10px] font-mono text-slate-400">{user.email}</p>
          </div>
          <button
            onClick={() => {
              logout();
              setShowDropdown(false);
            }}
            className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 text-xs font-mono flex items-center gap-1.5 active:scale-95"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </header>
  );
};
