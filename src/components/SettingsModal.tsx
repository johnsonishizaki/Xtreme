import React, { useState } from 'react';
import {
  Bell,
  Clock,
  MessageSquare,
  CheckCircle2,
  Save,
  RotateCcw,
  Sun,
  Moon,
  Palette
} from 'lucide-react';
import { AppSettings } from '../types';
import { DEFAULT_TEMPLATE } from '../services/firebase';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendLocalNotification
} from '../services/notificationService';
import { useTheme } from '../services/themeContext';

interface SettingsModalProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => Promise<void>;
  onResetAllData?: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings
}) => {
  const { theme, setTheme } = useTheme();
  const [formData, setFormData] = useState<AppSettings>({
    ...settings,
    theme: settings.theme || theme
  });
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [notificationState, setNotificationState] = useState(getNotificationPermission());
  const [testStatus, setTestStatus] = useState<string | null>(null);

  // Day options
  const daysOfWeek = [
    { value: 0, label: 'Every Sunday (Recommended)' },
    { value: 1, label: 'Every Monday' },
    { value: 5, label: 'Every Friday' },
    { value: 6, label: 'Every Saturday' }
  ];

  const handleSave = async () => {
    await onUpdateSettings(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    setFormData(prev => ({ ...prev, theme: newTheme }));
  };

  const handleInsertVariable = (variable: string) => {
    setFormData(prev => ({
      ...prev,
      messageTemplate: prev.messageTemplate + variable
    }));
  };

  const handleResetTemplate = () => {
    if (confirm('Reset template to standard announcement format?')) {
      setFormData(prev => ({
        ...prev,
        messageTemplate: DEFAULT_TEMPLATE
      }));
    }
  };

  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setNotificationState(perm);
    if (perm === 'granted') {
      await sendLocalNotification('🔔 Weekly Duty Reminder', {
        body: 'Reminders are now active for Xtreme.'
      });
      setTestStatus('Notification enabled! Test alert sent.');
    } else if (perm === 'denied') {
      setTestStatus('Notifications are currently disabled in your device settings.');
    }
  };

  const handleTestNotification = async () => {
    if (notificationState !== 'granted') {
      await handleRequestPermission();
      return;
    }
    const success = await sendLocalNotification('🔔 Weekly Duty Reminder', {
      body: 'Your teacher-duty announcement is ready. Tap to review and send it.'
    });
    if (success) {
      setTestStatus('Test alert sent to your screen!');
    } else {
      setTestStatus('Could not send alert. Please check phone notification settings.');
    }
    setTimeout(() => setTestStatus(null), 4000);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-6 pb-28 text-left">
      {/* Title Bar */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-500">
            Preferences
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--text-page)]">
            Settings
          </h1>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
        >
          {isSaved ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </>
          )}
        </button>
      </div>

      {/* Theme / Appearance Selection */}
      <div className="p-5 rounded-3xl border border-[var(--card-border)] shadow-xl bg-[var(--card-bg)] text-[var(--text-page)] backdrop-blur-xl space-y-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-500">
            <Palette className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--text-page)]">Appearance & Theme</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Choose your preferred visual mode
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          {/* Dark Mode Option */}
          <button
            type="button"
            onClick={() => handleThemeChange('dark')}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${
              theme === 'dark'
                ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30 text-white'
                : 'border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-[var(--text-muted)] hover:border-[var(--card-border-hover)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center text-amber-400">
                <Moon className="w-4 h-4" />
              </div>
              {theme === 'dark' && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/40" />
              )}
            </div>
            <div>
              <div className="text-xs font-bold text-[var(--text-page)]">Dark Mode</div>
              <div className="text-[10px] text-[var(--text-subtle)] font-mono">High-Tech OLED</div>
            </div>
          </button>

          {/* Light Mode Option */}
          <button
            type="button"
            onClick={() => handleThemeChange('light')}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${
              theme === 'light'
                ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30 text-slate-900'
                : 'border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-[var(--text-muted)] hover:border-[var(--card-border-hover)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-emerald-600 shadow-xs">
                <Sun className="w-4 h-4" />
              </div>
              {theme === 'light' && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/40" />
              )}
            </div>
            <div>
              <div className="text-xs font-bold text-[var(--text-page)]">Light Mode</div>
              <div className="text-[10px] text-[var(--text-subtle)] font-mono">Crisp Daytime</div>
            </div>
          </button>
        </div>
      </div>

      {/* Weekly Reminder Settings */}
      <div className="p-5 rounded-3xl border border-[var(--card-border)] shadow-xl bg-[var(--card-bg)] text-[var(--text-page)] backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-500">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-page)]">Weekly Reminder</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Alert me when the weekly duty message is ready
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.reminderEnabled}
              onChange={e => setFormData(p => ({ ...p, reminderEnabled: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 bg-white/10"></div>
          </label>
        </div>

        {formData.reminderEnabled && (
          <div className="space-y-3 pt-3 border-t border-[var(--card-border)]">
            {/* Reminder Day */}
            <div>
              <label className="text-xs font-mono font-bold block mb-1 text-[var(--text-muted)]">
                Reminder Day
              </label>
              <select
                value={formData.reminderDay}
                onChange={e => setFormData(p => ({ ...p, reminderDay: parseInt(e.target.value, 10) }))}
                className="w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)]"
              >
                {daysOfWeek.map(d => (
                  <option key={d.value} value={d.value} className="bg-[var(--modal-bg)] text-[var(--text-page)]">
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Reminder Time */}
            <div>
              <label className="text-xs font-mono font-bold block mb-1 text-[var(--text-muted)]">
                Reminder Time
              </label>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--text-subtle)]" />
                <input
                  type="time"
                  value={formData.reminderTime}
                  onChange={e => setFormData(p => ({ ...p, reminderTime: e.target.value }))}
                  className="flex-1 px-3 py-2.5 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)]"
                />
              </div>
            </div>

            {/* Notification Test Box */}
            <div className="p-3.5 rounded-2xl border border-[var(--card-border)] space-y-2 bg-[var(--code-bg)] text-[var(--text-page)]">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[var(--text-muted)]">Phone Notifications:</span>
                <span className={`font-bold ${
                  notificationState === 'granted'
                    ? 'text-emerald-500'
                    : 'text-amber-500'
                }`}>
                  {notificationState === 'granted' ? 'Enabled' : 'Needs Permission'}
                </span>
              </div>

              {testStatus && (
                <div className="text-xs p-2 rounded-lg leading-relaxed font-mono text-amber-500 bg-amber-500/10 border border-amber-500/20">
                  {testStatus}
                </div>
              )}

              <div className="pt-1">
                {notificationState !== 'granted' ? (
                  <button
                    type="button"
                    onClick={handleRequestPermission}
                    className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-md transition-all text-center cursor-pointer"
                  >
                    Enable Notifications
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleTestNotification}
                    className="w-full py-2 px-3 rounded-xl font-mono text-xs border border-[var(--card-border)] hover:border-[var(--card-border-hover)] bg-[var(--card-bg)] text-[var(--text-page)] transition-all text-center cursor-pointer"
                  >
                    🔔 Send Test Reminder
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* WhatsApp Announcement Template */}
      <div className="p-5 rounded-3xl border border-[var(--card-border)] shadow-xl bg-[var(--card-bg)] text-[var(--text-page)] backdrop-blur-xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-500">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-page)]">Announcement Message</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Template used to format your WhatsApp message
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetTemplate}
            title="Reset to default format"
            className="p-1.5 rounded-lg transition-all text-xs font-mono flex items-center gap-1 cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-page)] hover:bg-[var(--card-bg-elevated)]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-[11px]">Reset</span>
          </button>
        </div>

        {/* Template Variables */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-subtle)]">
            Tap to insert variable:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: '+ Teachers List', val: '{TEACHERS}' },
              { label: '+ Start Date', val: '{START_DATE}' },
              { label: '+ End Date', val: '{END_DATE}' },
              { label: '+ Week Period', val: '{WEEK}' },
              { label: '+ Duty Station', val: '{DUTY}' }
            ].map(item => (
              <button
                key={item.val}
                type="button"
                onClick={() => handleInsertVariable(item.val)}
                className="px-2.5 py-1 rounded-xl text-xs font-mono transition-colors cursor-pointer border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:border-emerald-500 text-emerald-500"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Template textarea */}
        <textarea
          value={formData.messageTemplate}
          onChange={e => setFormData(p => ({ ...p, messageTemplate: e.target.value }))}
          rows={7}
          className="w-full p-3.5 rounded-2xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none leading-relaxed border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)]"
          placeholder="Announcement template..."
        />
      </div>
    </div>
  );
};
