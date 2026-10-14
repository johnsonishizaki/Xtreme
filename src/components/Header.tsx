import React from 'react';
import {
  Home,
  Calendar,
  Users,
  History,
  Settings as SettingsIcon,
  Sun,
  Moon
} from 'lucide-react';
import { useTheme } from '../services/themeContext';

export type ActiveNavTab = 'home' | 'duty' | 'houseReports' | 'history' | 'settings';

interface HeaderProps {
  activeTab: ActiveNavTab;
  setActiveTab: (tab: ActiveNavTab) => void;
  isSundayPending?: boolean;
  missingReportsCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isSundayPending = false,
  missingReportsCount = 0
}) => {
  const { toggleTheme, isLight } = useTheme();

  return (
    <header className="sticky top-0 z-30 bg-[var(--header-bg)] border-b border-[var(--header-border)] backdrop-blur-2xl px-3 sm:px-8 py-3 transition-colors">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
        {/* Brand & Mobile Actions */}
        <div className="flex items-center justify-between">
          <div
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 bg-emerald-500 text-black flex items-center justify-center font-black text-lg rounded-xl shadow-md shrink-0 transition-transform active:scale-95">
              X
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm sm:text-base font-black tracking-widest uppercase transition-colors text-[var(--text-page)] group-hover:text-emerald-500">
                  XTREME
                </h1>
                <span className="text-[9px] font-mono font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-emerald-500 text-black">
                  OPS
                </span>
              </div>
              <p className="text-[9px] font-mono tracking-wider uppercase text-[var(--text-subtle)]">
                Senior Houseparent Suite
              </p>
            </div>
          </div>

          {/* Mobile Theme Toggle */}
          <div className="md:hidden flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              title={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              className="p-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-page)] hover:border-[var(--card-border-hover)] transition-all active:scale-95 cursor-pointer"
            >
              {isLight ? (
                <Moon className="w-4 h-4 text-emerald-600" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400" />
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs (5 exact tabs: Home, Duty, House Reports, History, Settings) */}
        <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto overflow-x-auto scrollbar-thin pb-0.5">
          <nav className="flex items-center gap-1 p-1 rounded-2xl border border-[var(--card-border)] bg-[var(--nav-bg)] shrink-0">
            {/* 1. Home */}
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'home'
                  ? 'bg-emerald-500 text-black font-extrabold shadow-md'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-page)] hover:bg-[var(--card-bg-elevated)]'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Home</span>
            </button>

            {/* 2. Duty */}
            <button
              type="button"
              onClick={() => setActiveTab('duty')}
              className={`relative px-2.5 sm:px-3 py-1.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'duty'
                  ? 'bg-emerald-500 text-black font-extrabold shadow-md'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-page)] hover:bg-[var(--card-bg-elevated)]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Duty</span>
              {isSundayPending && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-emerald-400 animate-pulse" />
              )}
            </button>

            {/* 3. House Reports */}
            <button
              type="button"
              onClick={() => setActiveTab('houseReports')}
              className={`relative px-2.5 sm:px-3 py-1.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'houseReports'
                  ? 'bg-emerald-500 text-black font-extrabold shadow-md'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-page)] hover:bg-[var(--card-bg-elevated)]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="whitespace-nowrap">House Reports</span>
              {missingReportsCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1 py-0.2 text-[8px] font-bold rounded-full bg-amber-400 text-black font-mono">
                  {missingReportsCount}
                </span>
              )}
            </button>

            {/* 4. History */}
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'history'
                  ? 'bg-emerald-500 text-black font-extrabold shadow-md'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-page)] hover:bg-[var(--card-bg-elevated)]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History</span>
            </button>

            {/* 5. Settings */}
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'settings'
                  ? 'bg-emerald-500 text-black font-extrabold shadow-md'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-page)] hover:bg-[var(--card-bg-elevated)]'
              }`}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </nav>

          {/* Desktop Theme Switcher */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            title={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            className="hidden md:flex p-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-page)] hover:border-[var(--card-border-hover)] transition-all active:scale-95 cursor-pointer items-center justify-center shadow-xs shrink-0"
          >
            {isLight ? (
              <Moon className="w-4 h-4 text-emerald-600" />
            ) : (
              <Sun className="w-4 h-4 text-amber-400" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
