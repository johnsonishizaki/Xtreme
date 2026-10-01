import React, { useState } from 'react';
import {
  Bell,
  Clock,
  MessageSquare,
  CheckCircle2,
  Save,
  RotateCcw
} from 'lucide-react';
import { AppSettings } from '../types';
import { DEFAULT_TEMPLATE } from '../services/firebase';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendLocalNotification
} from '../services/notificationService';

interface SettingsModalProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => Promise<void>;
  onResetAllData?: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings
}) => {
  const [formData, setFormData] = useState<AppSettings>(settings);
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
          <h1 className="text-2xl font-black tracking-tight text-white">
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

      {/* Weekly Reminder Settings */}
      <div className="p-5 rounded-3xl border shadow-xl bg-white/[0.03] border-white/[0.08] text-white backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-400">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Sunday Reminder</h2>
              <p className="text-xs text-slate-400">
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
          <div className="space-y-3 pt-3 border-t border-white/[0.08]">
            {/* Reminder Day */}
            <div>
              <label className="text-xs font-mono font-bold block mb-1 text-slate-300">
                Reminder Day
              </label>
              <select
                value={formData.reminderDay}
                onChange={e => setFormData(p => ({ ...p, reminderDay: parseInt(e.target.value, 10) }))}
                className="w-full px-3 py-2.5 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 border bg-black/40 border-white/[0.08] text-white"
              >
                {daysOfWeek.map(d => (
                  <option key={d.value} value={d.value} className="bg-slate-900 text-white">
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Reminder Time */}
            <div>
              <label className="text-xs font-mono font-bold block mb-1 text-slate-300">
                Reminder Time
              </label>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <input
                  type="time"
                  value={formData.reminderTime}
                  onChange={e => setFormData(p => ({ ...p, reminderTime: e.target.value }))}
                  className="flex-1 px-3 py-2.5 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 border bg-black/40 border-white/[0.08] text-white"
                />
              </div>
            </div>

            {/* Notification Test Box */}
            <div className="p-3.5 rounded-2xl border space-y-2 bg-black/30 border-white/[0.08] text-white">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Phone Notifications:</span>
                <span className={`font-bold ${
                  notificationState === 'granted'
                    ? 'text-emerald-500'
                    : 'text-amber-500'
                }`}>
                  {notificationState === 'granted' ? 'Enabled' : 'Needs Permission'}
                </span>
              </div>

              {testStatus && (
                <div className="text-xs p-2 rounded-lg leading-relaxed font-mono text-amber-300 bg-amber-500/15">
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
                    className="w-full py-2 px-3 rounded-xl font-mono text-xs border transition-all text-center cursor-pointer bg-white/[0.05] hover:bg-white/[0.08] text-slate-200 border-white/[0.08]"
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
      <div className="p-5 rounded-3xl border shadow-xl bg-white/[0.03] border-white/[0.08] text-white backdrop-blur-xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Announcement Message</h2>
              <p className="text-xs text-slate-400">
                Template used to format your WhatsApp message
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetTemplate}
            title="Reset to default format"
            className="p-1.5 rounded-lg transition-all text-xs font-mono flex items-center gap-1 cursor-pointer text-slate-400 hover:text-white hover:bg-white/[0.06]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-[11px]">Reset</span>
          </button>
        </div>

        {/* Template Variables */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
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
                className="px-2.5 py-1 rounded-xl text-xs font-mono transition-colors cursor-pointer border bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-emerald-400"
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
          className="w-full p-3.5 rounded-2xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none leading-relaxed border bg-black/40 border-white/[0.08] text-white"
          placeholder="Announcement template..."
        />
      </div>
    </div>
  );
};
