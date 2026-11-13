import React, { useState, useEffect } from 'react';
import {
  Bell,
  Send,
  Check,
  Volume2,
  VolumeX,
  CalendarPlus,
  Share,
  X,
  CheckCircle2
} from 'lucide-react';
import { DutyAssignment, AppSettings } from '../types';
import {
  openWhatsApp,
  generateAnnouncementMessage,
  formatDutyDate
} from '../services/messageGenerator';
import {
  getNotificationPermission,
  requestNotificationPermission,
  playUrgentAlarmChime,
  sendLocalNotification,
  startRepeatingAlarmSound,
  stopRepeatingAlarmSound,
  snoozeSoundAlerts,
  clearSoundSnooze,
  isSoundSnoozed,
  getSnoozeRemainingMinutes,
  isIOSDevice,
  isStandalonePWA,
  downloadDutyCalendarAlarm
} from '../services/notificationService';

export type AlarmSheetMode = 'none' | 'alarm' | 'confirm_sent';

interface UrgentDutyBannerProps {
  featuredAssignment: DutyAssignment | null;
  isAlreadySent: boolean;
  messageTemplate: string;
  settings: AppSettings;
  alarmSheetMode: AlarmSheetMode;
  onChangeAlarmSheetMode: (mode: AlarmSheetMode) => void;
  onWhatsAppLaunched: () => void;
  onMarkDone: () => Promise<void>;
  onNavigateToDuty: () => void;
}

export const UrgentDutyBanner: React.FC<UrgentDutyBannerProps> = ({
  featuredAssignment,
  isAlreadySent,
  messageTemplate,
  settings,
  alarmSheetMode,
  onChangeAlarmSheetMode,
  onWhatsAppLaunched,
  onMarkDone,
  onNavigateToDuty
}) => {
  const [permission, setPermission] = useState(getNotificationPermission());
  const [snoozeMins, setSnoozeMins] = useState(getSnoozeRemainingMinutes());
  const [showIOSSetupModal, setShowIOSSetupModal] = useState(false);

  const isiOS = isIOSDevice();
  const isStandalone = isStandalonePWA();
  const needsIOSHomeScreen = isiOS && !isStandalone && permission === 'unsupported';

  useEffect(() => {
    setPermission(getNotificationPermission());
    setSnoozeMins(getSnoozeRemainingMinutes());
    const id = setInterval(() => {
      setSnoozeMins(getSnoozeRemainingMinutes());
      setPermission(getNotificationPermission());
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Repeat audible alarm chime while the urgent alarm sheet is open and un-snoozed
  useEffect(() => {
    if (!featuredAssignment || isAlreadySent || alarmSheetMode !== 'alarm') {
      stopRepeatingAlarmSound();
      return;
    }

    if (!isSoundSnoozed()) {
      startRepeatingAlarmSound(7000);
    }

    return () => {
      stopRepeatingAlarmSound();
    };
  }, [alarmSheetMode, featuredAssignment, isAlreadySent]);

  if (!featuredAssignment || isAlreadySent) {
    return null;
  }

  const teachersText =
    featuredAssignment.teachers.map(t => t.name).join(', ') || 'Teachers on duty';

  const handleOpenWhatsApp = () => {
    stopRepeatingAlarmSound();
    onChangeAlarmSheetMode('none');
    onWhatsAppLaunched();
    const msg = generateAnnouncementMessage(messageTemplate, featuredAssignment);
    openWhatsApp(msg, settings.whatsAppBehavior || 'app');
  };

  const handleMarkDoneClick = async () => {
    stopRepeatingAlarmSound();
    clearSoundSnooze();
    onChangeAlarmSheetMode('none');
    await onMarkDone();
  };

  const handleSnooze = () => {
    snoozeSoundAlerts(10);
    setSnoozeMins(10);
    stopRepeatingAlarmSound();
    onChangeAlarmSheetMode('none');
  };

  const handleTriggerRing = () => {
    clearSoundSnooze();
    setSnoozeMins(0);
    playUrgentAlarmChime(true);
    onChangeAlarmSheetMode('alarm');
  };

  const handleEnableAlerts = async () => {
    playUrgentAlarmChime(true);
    if (needsIOSHomeScreen) {
      setShowIOSSetupModal(true);
      return;
    }
    const res = await requestNotificationPermission();
    setPermission(res);
    if (res === 'granted') {
      await sendLocalNotification(`⚠️ SEND DUTY NOW (${featuredAssignment.weekLabel})`, {
        body: `On Duty: ${teachersText}. Tap to send via WhatsApp or mark done.`,
        requireInteraction: true,
        renotify: true
      });
    } else if (isiOS) {
      setShowIOSSetupModal(true);
    }
  };

  const handleDownloadCalendarAlarm = () => {
    downloadDutyCalendarAlarm(
      settings.reminderDay ?? 0,
      settings.reminderTime ?? '08:00',
      featuredAssignment.weekLabel,
      teachersText
    );
  };

  return (
    <>
      {/* Flashing Persistent Top Strip */}
      <div
        role="alert"
        aria-live="assertive"
        className="w-full border-b-2 animate-urgent-bar text-[var(--text-page)] px-3 sm:px-6 py-2.5 transition-colors"
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={onNavigateToDuty}
            className="flex items-center gap-2 min-w-0 text-left cursor-pointer"
          >
            <Bell className="w-4 h-4 text-rose-500 dark:text-amber-400 shrink-0 animate-bell-ring" />
            <div className="min-w-0">
              <div className="font-extrabold text-rose-700 dark:text-amber-300 truncate tracking-tight">
                SEND DUTY · {featuredAssignment.weekLabel}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] truncate">
                {teachersText}
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleTriggerRing}
              title="Open audible duty alarm"
              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              {snoozeMins > 0 ? (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span className="tabular-nums">{snoozeMins}m</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Alarm</span>
                </>
              )}
            </button>

            {permission !== 'granted' && (
              <button
                type="button"
                onClick={handleEnableAlerts}
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-amber-500/50 bg-[var(--card-bg)] text-amber-700 dark:text-amber-300 text-[11px] font-bold cursor-pointer transition-colors"
              >
                {needsIOSHomeScreen ? 'iPhone Alerts' : 'Allow Push'}
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="min-h-[34px] px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-extrabold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
            >
              <Send className="w-3 h-3" />
              <span>Send</span>
            </button>

            <button
              type="button"
              onClick={handleMarkDoneClick}
              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500 text-[var(--text-page)] text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span>Done</span>
            </button>
          </div>
        </div>
      </div>

      {/* High-Visibility iPhone Thumb-Zone Urgent Alarm Sheet */}
      {alarmSheetMode === 'alarm' && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"
        >
          <div className="w-full max-w-md rounded-2xl border-2 border-amber-500 bg-[var(--modal-bg)] text-[var(--text-page)] p-5 space-y-4 animate-urgent-glow text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5 text-amber-500 animate-bell-ring" />
                </div>
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-500 dark:text-amber-400">
                    Action Required · Repeating Alert
                  </div>
                  <h2 className="text-base font-extrabold text-[var(--text-page)] leading-tight">
                    Send {featuredAssignment.weekLabel} Duty
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSnooze}
                aria-label="Snooze alert"
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-page)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-1.5 text-xs">
              <div className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums">
                {formatDutyDate(featuredAssignment.startDate)} – {formatDutyDate(featuredAssignment.endDate)}
              </div>
              <div className="font-bold text-sm text-[var(--text-page)]">
                On Duty: {teachersText}
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg"
              >
                <Send className="w-4 h-4" />
                <span>Send via WhatsApp Now</span>
              </button>

              <button
                type="button"
                onClick={handleMarkDoneClick}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Already Sent — Mark Week Done &amp; Silence</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[var(--card-border-subtle)] text-xs">
              <button
                type="button"
                onClick={handleSnooze}
                className="text-[var(--text-muted)] hover:text-[var(--text-page)] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <VolumeX className="w-3.5 h-3.5" />
                <span>Snooze Sound 10m</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadCalendarAlarm}
                className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                <span>Add iPhone Calendar Alarm</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-WhatsApp 1-Tap Completion Confirmation Sheet */}
      {alarmSheetMode === 'confirm_sent' && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"
        >
          <div className="w-full max-w-md rounded-2xl border-2 border-emerald-500 bg-[var(--modal-bg)] text-[var(--text-page)] p-5 space-y-4 shadow-2xl text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                <div>
                  <h2 className="text-base font-extrabold text-[var(--text-page)]">
                    Sent {featuredAssignment.weekLabel} on WhatsApp?
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Tap below to mark this week complete and stop all reminders.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onChangeAlarmSheetMode('none')}
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-page)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleMarkDoneClick}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>Yes — Mark Week Done</span>
              </button>

              <button
                type="button"
                onClick={() => onChangeAlarmSheetMode('none')}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-page)] cursor-pointer"
              >
                Not Yet — Keep Reminding Me
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iPhone Lock-Screen & Home Screen Alerts Guide */}
      {showIOSSetupModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--modal-bg)] text-[var(--text-page)] p-5 space-y-4 shadow-2xl text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">Enable iPhone Push &amp; Sound Alerts</h3>
              <button
                type="button"
                onClick={() => setShowIOSSetupModal(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-page)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-[var(--text-muted)] leading-relaxed">
              <div className="p-3 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-start gap-2.5">
                <Share className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[var(--text-page)]">1. Add to iPhone Home Screen:</strong> Apple only delivers Web Push notifications and Home Screen badge counts when you open Xtreme from your Home Screen icon.
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-start gap-2.5">
                <CalendarPlus className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[var(--text-page)]">2. Add Repeating iPhone Calendar Alarm:</strong> Rings loudly on your Lock Screen every reminder day even when Safari is closed.
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  handleDownloadCalendarAlarm();
                  setShowIOSSetupModal(false);
                }}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>Download iPhone Lock-Screen Alarm (.ics)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowIOSSetupModal(false)}
                className="w-full min-h-[40px] py-2 rounded-xl border border-[var(--card-border)] text-xs font-semibold text-[var(--text-muted)] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
