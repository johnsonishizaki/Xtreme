import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  Send,
  Check,
  Volume2,
  VolumeX,
  CalendarPlus,
  Share,
  X,
  CheckCircle2,
  Copy,
  Clock,
  Smartphone,
  Mic
} from 'lucide-react';
import { DutyAssignment, AppSettings } from '../types';
import {
  openWhatsApp,
  generateAnnouncementMessage,
  formatDutyDate,
  copyToClipboard,
  getLocalTodayIso
} from '../services/messageGenerator';
import {
  getNotificationPermission,
  requestNotificationPermission,
  playUrgentAlarmChime,
  speakUrgentDutyAlert,
  sendLocalNotification,
  startRepeatingAlarmSound,
  stopRepeatingAlarmSound,
  snoozeSoundAlerts,
  snoozeUntilTimestamp,
  getTonightSnoozeTimestamp,
  clearSoundSnooze,
  isSoundSnoozed,
  getSnoozeRemainingMinutes,
  isIOSDevice,
  isStandalonePWA,
  downloadDutyCalendarAlarm,
  getNextReminderDate,
  formatCountdownToReminder,
  isDutyReminderOverdue,
  triggerServerTestPush,
  type DutyIcsEventInput
} from '../services/notificationService';

export type AlarmSheetMode = 'none' | 'alarm' | 'confirm_sent';

interface UrgentDutyBannerProps {
  featuredAssignment: DutyAssignment | null;
  upcomingAssignments?: DutyAssignment[];
  isAlreadySent: boolean;
  messageTemplate: string;
  settings: AppSettings;
  alarmSheetMode: AlarmSheetMode;
  onChangeAlarmSheetMode: (mode: AlarmSheetMode) => void;
  onWhatsAppLaunched: () => void;
  onMarkDone: () => Promise<void>;
  onNavigateToDuty: () => void;
}

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const UrgentDutyBanner: React.FC<UrgentDutyBannerProps> = ({
  featuredAssignment,
  upcomingAssignments = [],
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
  const [copiedPreview, setCopiedPreview] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => new Date());

  const isiOS = isIOSDevice();
  const isStandalone = isStandalonePWA();
  const needsIOSHomeScreen = isiOS && !isStandalone && permission === 'unsupported';

  useEffect(() => {
    setPermission(getNotificationPermission());
    setSnoozeMins(getSnoozeRemainingMinutes());
    const id = setInterval(() => {
      setNowTick(new Date());
      setSnoozeMins(getSnoozeRemainingMinutes());
      setPermission(getNotificationPermission());
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Play chime / spoken prompt while Reminder Sheet is open & alerts enabled
  useEffect(() => {
    if (!featuredAssignment || isAlreadySent || alarmSheetMode !== 'alarm') {
      stopRepeatingAlarmSound();
      return;
    }

    const soundEnabled = settings.soundAlertEnabled !== false;
    const voiceEnabled = settings.voiceAlertEnabled !== false;

    if (!isSoundSnoozed() && (soundEnabled || voiceEnabled)) {
      const teachersSpeech =
        featuredAssignment.teachers.map(t => t.name).join(' and ') || 'assigned teachers';
      const voiceMsg = voiceEnabled
        ? `Duty reminder for ${featuredAssignment.weekLabel}. Teachers on duty: ${teachersSpeech}.`
        : undefined;
      if (soundEnabled) {
        startRepeatingAlarmSound(9000, voiceMsg);
      } else if (voiceMsg) {
        speakUrgentDutyAlert(voiceMsg);
      }
    }

    return () => {
      stopRepeatingAlarmSound();
    };
  }, [
    alarmSheetMode,
    featuredAssignment,
    isAlreadySent,
    settings.soundAlertEnabled,
    settings.voiceAlertEnabled
  ]);

  const icsEvents: DutyIcsEventInput[] = useMemo(() => {
    const today = getLocalTodayIso();
    const list = upcomingAssignments.length > 0
      ? upcomingAssignments
      : featuredAssignment
        ? [featuredAssignment]
        : [];
    return list
      .filter(a => !a.endDate || a.endDate >= today)
      .slice(0, 8)
      .map(a => ({
        id: a.id,
        weekLabel: a.weekLabel,
        startDate: a.startDate,
        endDate: a.endDate,
        teachersText: a.teachers.map(t => t.name).join(', ') || 'Teachers on Duty'
      }));
  }, [upcomingAssignments, featuredAssignment]);

  if (!featuredAssignment || isAlreadySent) {
    return null;
  }

  const reminderDay = settings.reminderDay ?? 0;
  const reminderTime = settings.reminderTime || '08:00';
  const overdue = isDutyReminderOverdue(
    featuredAssignment.startDate,
    reminderDay,
    reminderTime,
    isAlreadySent,
    nowTick
  );
  const nextReminder = getNextReminderDate(reminderDay, reminderTime, nowTick);
  const countdownText = formatCountdownToReminder(nextReminder, nowTick);

  const teachersText =
    featuredAssignment.teachers.map(t => t.name).join(', ') || 'Teachers on duty';

  const formattedAnnouncement = generateAnnouncementMessage(
    messageTemplate,
    featuredAssignment
  );

  const handleOpenWhatsApp = () => {
    stopRepeatingAlarmSound();
    onChangeAlarmSheetMode('none');
    onWhatsAppLaunched();
    openWhatsApp(formattedAnnouncement, settings.whatsAppBehavior || 'app');
  };

  const handleCopyAnnouncement = async () => {
    const ok = await copyToClipboard(formattedAnnouncement);
    if (ok) {
      setCopiedPreview(true);
      setTimeout(() => setCopiedPreview(false), 2000);
    }
  };

  const handleMarkDoneClick = async () => {
    stopRepeatingAlarmSound();
    clearSoundSnooze();
    onChangeAlarmSheetMode('none');
    await onMarkDone();
  };

  const handleSnoozeMinutes = (mins: number) => {
    snoozeSoundAlerts(mins);
    setSnoozeMins(mins);
    stopRepeatingAlarmSound();
    onChangeAlarmSheetMode('none');
  };

  const handleSnoozeTonight = () => {
    const until = getTonightSnoozeTimestamp(19, 0);
    snoozeUntilTimestamp(until);
    setSnoozeMins(Math.max(1, Math.ceil((until - Date.now()) / 60000)));
    stopRepeatingAlarmSound();
    onChangeAlarmSheetMode('none');
  };

  const handleOpenReminderSheet = () => {
    clearSoundSnooze();
    setSnoozeMins(0);
    if (settings.soundAlertEnabled !== false) {
      playUrgentAlarmChime(true);
    }
    onChangeAlarmSheetMode('alarm');
  };

  const handleEnableAlerts = async () => {
    if (settings.soundAlertEnabled !== false) {
      playUrgentAlarmChime(true);
    }
    if (needsIOSHomeScreen) {
      setShowIOSSetupModal(true);
      return;
    }
    const res = await requestNotificationPermission();
    setPermission(res);
    if (res === 'granted') {
      const serverDelivered = await triggerServerTestPush();
      setPushFeedback(
        serverDelivered
          ? 'Lock-screen push enabled & verified.'
          : 'Browser alerts enabled.'
      );
      setTimeout(() => setPushFeedback(null), 3000);
      await sendLocalNotification(`🔔 Duty Reminder (${featuredAssignment.weekLabel})`, {
        body: `On Duty: ${teachersText}. Tap to copy & send manually on WhatsApp.`,
        requireInteraction: true,
        renotify: true
      });
    } else if (isiOS) {
      setShowIOSSetupModal(true);
    }
  };

  const handleDownloadCalendarAlarm = () => {
    downloadDutyCalendarAlarm(
      reminderDay,
      reminderTime,
      featuredAssignment.weekLabel,
      teachersText,
      icsEvents
    );
  };

  const statusSummary = snoozeMins > 0
    ? `Snoozed ${snoozeMins}m`
    : overdue
      ? 'Reminder due'
      : `Next alert ${DAY_NAMES_SHORT[reminderDay]} ${reminderTime} (${countdownText})`;

  return (
    <>
      {/* Pinned Compact Reminder Bar */}
      <div
        role="alert"
        aria-live="polite"
        className={`w-full border-b px-3 sm:px-6 py-2 transition-colors ${
          overdue && snoozeMins === 0
            ? 'animate-urgent-bar border-amber-500/70'
            : 'border-amber-500/35 bg-amber-500/8'
        } text-[var(--text-page)]`}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={handleOpenReminderSheet}
            className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
          >
            <span className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
              <Bell
                className={`w-4 h-4 text-amber-500 ${
                  overdue && snoozeMins === 0 ? 'animate-bell-ring' : ''
                }`}
              />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-extrabold text-[var(--text-page)] truncate tracking-tight">
                <span className="truncate">Duty Reminder · {featuredAssignment.weekLabel}</span>
                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 shrink-0 tabular-nums">
                  · {statusSummary}
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] truncate">
                {teachersText}
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleOpenReminderSheet}
              title="Open reminder panel"
              className="min-h-[36px] px-2.5 py-1 rounded-lg border border-amber-500/40 bg-[var(--card-bg)] hover:border-amber-500 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              {snoozeMins > 0 ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 shrink-0" />
                  <span className="tabular-nums">{snoozeMins}m</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Remind</span>
                </>
              )}
            </button>

            {permission !== 'granted' && (
              <button
                type="button"
                onClick={handleEnableAlerts}
                className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500 text-[var(--text-page)] text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 hidden sm:inline-flex items-center"
              >
                {needsIOSHomeScreen ? 'iPhone Alerts' : 'Enable Push'}
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="w-3.5 h-3.5 shrink-0" />
              <span>Send</span>
            </button>

            <button
              type="button"
              onClick={handleMarkDoneClick}
              className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500 text-[var(--text-page)] text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Done</span>
            </button>
          </div>
        </div>
      </div>

      {/* High-Craft Interactive Reminder Sheet */}
      {alarmSheetMode === 'alarm' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Weekly Duty Reminder"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] overflow-y-auto"
        >
          <div className="w-full max-w-md rounded-2xl border border-amber-500/60 bg-[var(--modal-bg)] text-[var(--text-page)] p-5 space-y-4 animate-urgent-glow text-left shadow-2xl my-auto">
            {/* Sheet Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5 text-amber-500 animate-bell-ring" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                    {overdue ? 'Duty Notice Pending' : `Scheduled · ${DAY_NAMES_SHORT[reminderDay]} ${reminderTime}`}
                  </div>
                  <h2 className="text-base font-extrabold text-[var(--text-page)] leading-tight">
                    Send {featuredAssignment.weekLabel} Duty
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  stopRepeatingAlarmSound();
                  onChangeAlarmSheetMode('none');
                }}
                aria-label="Close reminder"
                className="min-w-[38px] min-h-[38px] rounded-xl text-[var(--text-muted)] hover:text-[var(--text-page)] hover:bg-[var(--card-bg-elevated)] flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {pushFeedback && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-semibold">
                {pushFeedback}
              </div>
            )}

            {/* Schedule & Teachers Summary */}
            <div className="p-3.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>
                    {formatDutyDate(featuredAssignment.startDate)} – {formatDutyDate(featuredAssignment.endDate)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyAnnouncement}
                  className="text-[11px] font-bold text-emerald-500 hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Copy className="w-3 h-3 shrink-0" />
                  <span>{copiedPreview ? 'Copied' : 'Copy Text'}</span>
                </button>
              </div>

              <div className="space-y-1">
                {featuredAssignment.teachers.map((t, idx) => {
                  const isLeader =
                    (t.role || '').toLowerCase().includes('leader') || idx === 0;
                  return (
                    <div
                      key={t.id || idx}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-bold text-[var(--text-page)] truncate">
                        {idx + 1}. {t.name.toUpperCase()}
                      </span>
                      {isLeader && (
                        <span className="text-[11px] font-bold text-emerald-500 shrink-0">
                          Leader
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <pre className="p-2.5 rounded-lg border border-[var(--card-border-subtle)] bg-[var(--code-bg)] text-[11px] font-mono whitespace-pre-wrap leading-relaxed text-[var(--text-muted)] max-h-32 overflow-y-auto">
                {formattedAnnouncement}
              </pre>

              {/* Quick Audio & Voice Test */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--card-border-subtle)]">
                <button
                  type="button"
                  onClick={() => playUrgentAlarmChime(true)}
                  className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-amber-500 flex items-center gap-1 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Ring Chime</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    speakUrgentDutyAlert(
                      `Reminder: ${featuredAssignment.weekLabel} duty teachers are ${teachersText}.`
                    )
                  }
                  className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-emerald-500 flex items-center gap-1 cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Read Team Aloud</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangeAlarmSheetMode('none');
                    onNavigateToDuty();
                  }}
                  className="text-[11px] font-semibold text-emerald-500 hover:underline cursor-pointer"
                >
                  View Duty Page
                </button>
              </div>
            </div>

            {/* Primary Dispatch Controls */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg"
              >
                <Send className="w-4 h-4 shrink-0" />
                <span>Send Manually via WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleMarkDoneClick}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-emerald-500/45 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Already Sent — Mark Week Done &amp; Silence</span>
              </button>
            </div>

            {/* Flexible Snooze Controls */}
            <div className="space-y-2 pt-2 border-t border-[var(--card-border-subtle)]">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <span className="font-semibold flex items-center gap-1">
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>Snooze Chime Until Later</span>
                </span>
                <span className="tabular-nums">Next window: {DAY_NAMES_SHORT[reminderDay]} {reminderTime}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSnoozeMinutes(10)}
                  className="min-h-[36px] px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-amber-500 text-xs font-semibold text-[var(--text-page)] cursor-pointer transition-colors"
                >
                  10m
                </button>
                <button
                  type="button"
                  onClick={() => handleSnoozeMinutes(30)}
                  className="min-h-[36px] px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-amber-500 text-xs font-semibold text-[var(--text-page)] cursor-pointer transition-colors"
                >
                  30m
                </button>
                <button
                  type="button"
                  onClick={() => handleSnoozeMinutes(60)}
                  className="min-h-[36px] px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-amber-500 text-xs font-semibold text-[var(--text-page)] cursor-pointer transition-colors"
                >
                  1 hr
                </button>
                <button
                  type="button"
                  onClick={handleSnoozeTonight}
                  className="min-h-[36px] px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-amber-500 text-xs font-semibold text-[var(--text-page)] cursor-pointer transition-colors whitespace-nowrap"
                >
                  7 PM
                </button>
              </div>
            </div>

            {/* Footer: Calendar Alarm & iPhone Setup */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--card-border-subtle)] text-xs">
              <button
                type="button"
                onClick={handleDownloadCalendarAlarm}
                className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
                <span>Add to Apple Calendar (.ics)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowIOSSetupModal(true)}
                className="text-[var(--text-muted)] hover:text-[var(--text-page)] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span>iPhone Alerts</span>
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
                    Tap below to mark this week complete and silence repeating reminders.
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

      {/* iPhone Lock-Screen & Apple Calendar Alerts Modal */}
      {showIOSSetupModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--modal-bg)] text-[var(--text-page)] p-5 space-y-4 shadow-2xl text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">iPhone Reminder &amp; Lock-Screen Setup</h3>
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
                  <strong className="text-[var(--text-page)]">1. Add to iPhone Home Screen:</strong> In Safari tap <strong>Share</strong> (or <strong>••• → Share</strong> on iOS 26), then <strong>View More → Add to Home Screen</strong> with <strong>Open as Web App</strong> turned ON.
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-start gap-2.5">
                <CalendarPlus className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[var(--text-page)]">2. Import All Weeks into Apple Calendar:</strong> Adds every upcoming duty week with its teachers and 15-minute advance alert so it rings even when the browser is closed.
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
                <CalendarPlus className="w-4 h-4 shrink-0" />
                <span>
                  {icsEvents.length > 1
                    ? `Add ${icsEvents.length} Duty Weeks to Apple Calendar (.ics)`
                    : 'Add Duty Alarm to Apple Calendar (.ics)'}
                </span>
              </button>

              {permission !== 'granted' && !needsIOSHomeScreen && (
                <button
                  type="button"
                  onClick={handleEnableAlerts}
                  className="w-full min-h-[42px] py-2 px-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-xs font-bold text-[var(--text-page)] hover:border-emerald-500 cursor-pointer"
                >
                  Allow Lock-Screen Push Notifications
                </button>
              )}

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
