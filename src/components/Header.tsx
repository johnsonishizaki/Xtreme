import React from 'react';
import { Calendar, Users, Settings as SettingsIcon, Sun, Moon } from 'lucide-react';
import { useTheme } from '../services/themeContext';
import { PWAInstallButton } from './PWAInstallButton';

export type ActiveNavTab = 'home' | 'duty' | 'houseReports' | 'history' | 'settings';

interface HeaderProps {
  activeTab: ActiveNavTab;
  setActiveTab: (tab: ActiveNavTab) => void;
  isDutyPending?: boolean;
  missingReportsCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab
}) => {
  const { toggleTheme, isLight } = useTheme();

  return (
    <header className="sticky top-0 z-30 bg-[var(--header-bg)] border-b border-[var(--header-border)] backdrop-blur-xl px-3 sm:px-6 py-2 transition-colors">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        {/* Brand */}
        <button
          type="button"
          onClick={() => setActiveTab('houseReports')}
          className="flex items-center gap-2 cursor-pointer shrink-0 min-h-[38px]"
        >
          <img
            src="/pwa-192x192.png"
            alt="Xtreme"
            className="w-7 h-7 rounded-lg object-cover border border-[var(--card-border)] shrink-0"
          />
          <span className="text-sm font-bold tracking-tight text-[var(--text-page)] whitespace-nowrap">
            Xtreme
          </span>
        </button>

        {/* Minimal 3-Tab Switcher */}
        <nav
          aria-label="Primary navigation"
          className="flex items-center gap-0.5 p-1 rounded-xl border border-[var(--card-border)] bg-[var(--nav-bg)]"
        >
          <button
            type="button"
            onClick={() => setActiveTab('houseReports')}
            className={`min-h-[34px] px-2.5 sm:px-3.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'houseReports' || activeTab === 'home'
                ? 'bg-emerald-500 text-black'
                : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>Attendance</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('duty')}
            className={`min-h-[34px] px-2.5 sm:px-3.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'duty'
                ? 'bg-emerald-500 text-black'
                : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>Duty</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`min-h-[34px] px-2.5 sm:px-3.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-emerald-500 text-black'
                : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Terms</span>
          </button>
        </nav>

        {/* Right Utility Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            className="min-h-[36px] min-w-[36px] p-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-page)] hover:border-[var(--card-border-hover)] transition-colors cursor-pointer flex items-center justify-center"
          >
            {isLight ? (
              <Moon className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
