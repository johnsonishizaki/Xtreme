import React from 'react';
import { Calendar, FileSpreadsheet, History, Settings as SettingsIcon } from 'lucide-react';
import { Roster } from '../types';

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
  return (
    <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-4 py-3">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Brand */}
        <div 
          onClick={() => setActiveTab('home')}
          className="flex items-center space-x-2.5 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-900/30 text-slate-950 font-black text-lg tracking-wider transition-transform active:scale-95">
            X
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-base tracking-tight text-white group-hover:text-emerald-400 transition-colors">
                XTREME
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Duty
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium leading-none">
              Weekly Assistant
            </p>
          </div>
        </div>

        {/* Navigation Tabs with friendly labels */}
        <nav className="flex items-center space-x-1 bg-slate-900 p-1 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className={`relative px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
              activeTab === 'home'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span className={activeTab === 'home' ? 'inline' : 'hidden sm:inline'}>Duty</span>
            {isSundayPending && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-slate-950 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            className={`relative px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
              activeTab === 'roster'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className={activeTab === 'roster' ? 'inline' : 'hidden sm:inline'}>Roster</span>
            {!activeRoster && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-slate-950" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
              activeTab === 'history'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span className={activeTab === 'history' ? 'inline' : 'hidden sm:inline'}>History</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
              activeTab === 'settings'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            <span className={activeTab === 'settings' ? 'inline' : 'hidden sm:inline'}>Settings</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
