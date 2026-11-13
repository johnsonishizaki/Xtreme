import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Header, type ActiveNavTab } from './components/Header';
import { useAuth } from './services/auth.tsx';
import { ThemeProvider, useTheme } from './services/themeContext';
import {
  AppSettings,
  DutyAssignment,
  ParsedRosterPayload,
  Roster,
  SendHistory,
  HouseConfig,
  HouseDailyReport,
  AcademicTerm
} from './types';
import {
  DEFAULT_SETTINGS,
  getDutyAssignments,
  getRosters,
  getSendHistory,
  getSettings,
  getHouses,
  getTerms,
  getHouseReports,
  subscribeToHouseReports,
  saveRosterWithAssignments,
  saveSettings,
  deleteRoster,
  getCachedSettings,
  getCachedRosters,
  getCachedDutyAssignments,
  getCachedSendHistory,
  getCachedHouses,
  getCachedTerms
} from './services/firebase';
import {
  hasReminderTimePassed,
  isTodayReminderDay,
  sendLocalNotification,
  checkAndTriggerDutyAlert,
  unlockAudioEngine,
  syncAppBadge,
  clearSoundSnooze,
  stopRepeatingAlarmSound,
  isSoundSnoozed
} from './services/notificationService';
import { buildGoogleSheetCsvUrl } from './services/sheetsParser';
import { DutyTab } from './components/DutyTab';
import { HouseReportingTab } from './components/HouseReportingTab';
import { SettingsTab } from './components/SettingsTab';
import { ReviewDataModal } from './components/ReviewDataModal';
import { UrgentDutyBanner, type AlarmSheetMode } from './components/UrgentDutyBanner';
import { OfflineIndicator } from './components/OfflineIndicator';

function getSimpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function MainApp() {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<ActiveNavTab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'duty') return 'duty';
      if (params.get('tab') === 'settings') return 'settings';
    }
    return 'houseReports';
  });

  // Instant 0ms local cache hydration
  const [rosters, setRosters] = useState<Roster[]>(() => getCachedRosters());
  const [assignments, setAssignments] = useState<DutyAssignment[]>(() => getCachedDutyAssignments());
  const [settings, setSettings] = useState<AppSettings>(() => getCachedSettings());
  const [sendHistory, setSendHistory] = useState<SendHistory[]>(() => getCachedSendHistory());
  const [houses, setHouses] = useState<HouseConfig[]>(() => getCachedHouses());
  const [terms, setTerms] = useState<AcademicTerm[]>(() => getCachedTerms());
  const [reports, setReports] = useState<HouseDailyReport[]>([]);
  const [settingsInitialSection, setSettingsInitialSection] = useState<string>('terms');
  const [reviewData, setReviewData] = useState<ParsedRosterPayload | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [alarmSheetMode, setAlarmSheetMode] = useState<AlarmSheetMode>('none');
  const awaitingWhatsAppReturnRef = useRef<boolean>(false);
  const bootVersionRef = useRef<string | null>(null);

  const refreshAllData = useCallback(async () => {
    try {
      const [
        fetchedSettings,
        fetchedRosters,
        fetchedAssignments,
        fetchedHistory,
        fetchedHouses,
        fetchedTerms,
        fetchedReports
      ] = await Promise.all([
        getSettings(),
        getRosters(),
        getDutyAssignments(),
        getSendHistory(),
        getHouses(),
        getTerms(),
        getHouseReports()
      ]);

      setSettings(fetchedSettings);
      setRosters(Array.from(new Map(fetchedRosters.map(r => [r.id, r])).values()));
      setAssignments(Array.from(new Map(fetchedAssignments.map(a => [a.id, a])).values()));
      setSendHistory(fetchedHistory);
      setHouses(fetchedHouses);
      setTerms(fetchedTerms);
      setReports(fetchedReports);

      if (fetchedSettings.theme && !localStorage.getItem('xtreme_theme')) {
        setTheme(fetchedSettings.theme);
      }
    } catch (err) {
      console.warn('Background sync error (serving cache):', err);
    }
  }, [setTheme]);

  // Unlock Web Audio engine & purge lingering sample/demo items once on boot
  useEffect(() => {
    unlockAudioEngine();
    try {
      const storedRosters = localStorage.getItem('xtreme_duty_rosters');
      if (storedRosters && (storedRosters.includes('sample') || storedRosters.includes('demo'))) {
        localStorage.removeItem('xtreme_duty_rosters');
        localStorage.removeItem('xtreme_duty_assignments');
      }
      const storedReports = localStorage.getItem('xtreme_house_reports');
      if (storedReports && (storedReports.includes('2026-10-07') || storedReports.includes('sample'))) {
        localStorage.removeItem('xtreme_house_reports');
      }
    } catch {}
  }, []);

  // Zero-stale Service Worker registration & /api/version live-deploy auto-updater
  useEffect(() => {
    refreshAllData();

    const checkAppVersion = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.version) return;

        if (!bootVersionRef.current) {
          bootVersionRef.current = data.version;
        } else if (bootVersionRef.current !== data.version) {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg?.active) {
              reg.active.postMessage({ type: 'CLEAR_ALL_CACHES' });
            }
            await reg?.update().catch(() => {});
          }
          window.location.reload();
        }
      } catch {
        // Offline or network hiccup
      }
    };

    checkAppVersion();
    const versionTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkAppVersion();
      }
    }, 15000);

    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          reg.update().catch(() => {});
        })
        .catch(() => {});

      let hasReloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hasReloaded) {
          hasReloaded = true;
          window.location.reload();
        }
      });
    }

    window.addEventListener('focus', checkAppVersion);
    return () => {
      clearInterval(versionTimer);
      window.removeEventListener('focus', checkAppVersion);
    };
  }, [refreshAllData, user]);

  // Real-time Firestore listener + 1-second automatic sync
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = subscribeToHouseReports((liveReports) => {
      if (isMounted) setReports(liveReports);
    });

    const timer = setInterval(async () => {
      if (!isMounted || document.visibilityState !== 'visible') return;
      try {
        const fresh = await getHouseReports();
        if (isMounted && Array.isArray(fresh)) {
          setReports(fresh);
        }
      } catch {
        // Silent background check
      }
    }, 1000);

    return () => {
      isMounted = false;
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  // Automatic Google Sheet roster background sync
  useEffect(() => {
    if (!settings.googleSheetUrl) return;

    const performBackgroundSync = async () => {
      try {
        const csvUrl = buildGoogleSheetCsvUrl(settings.googleSheetUrl!);
        const response = await fetch(csvUrl);
        if (!response.ok) return;

        const csvText = await response.text();
        const currentHash = getSimpleHash(csvText);

        if (currentHash !== settings.lastSyncHash) {
          const encoder = new TextEncoder();
          const buffer = encoder.encode(csvText).buffer;
          const { parseSpreadsheet } = await import('./services/rosterParser');
          const parsed = await parseSpreadsheet(buffer, 'Synced Google Sheet.csv');

          const newRoster: Roster = {
            id: `roster-sync-${Date.now()}`,
            name: parsed.rosterName || 'Synced Google Sheet',
            sourceType: 'sheets',
            totalWeeks: parsed.assignments.length,
            uploadedAt: new Date().toISOString(),
            isActive: true
          };

          const newAssignments: DutyAssignment[] = parsed.assignments.map((a, idx) => ({
            id: `assign-sync-${newRoster.id}-${idx}`,
            rosterId: newRoster.id,
            weekLabel: a.weekLabel,
            startDate: a.startDate,
            endDate: a.endDate,
            teachers: a.teachers.map((t, tid) => ({ id: `t-sync-${idx}-${tid}`, name: t.name, role: t.role })),
            dutyTitle: a.dutyTitle || '',
            status: 'confirmed',
            confidence: a.confidence,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }));

          await saveRosterWithAssignments(newRoster, newAssignments);
          await saveSettings({
            ...settings,
            lastSyncHash: currentHash,
            updatedAt: new Date().toISOString()
          });
          await refreshAllData();

          sendLocalNotification('✨ Duty Roster Updated', {
            body: 'Your weekly teacher duty schedule synced with new changes.'
          });
        }
      } catch {
        // Ignore silent sync issues
      }
    };

    const timer = setTimeout(performBackgroundSync, 8000);
    return () => clearTimeout(timer);
  }, [settings.googleSheetUrl, settings.lastSyncHash, refreshAllData, settings]);

  // Active Roster & Featured THIS Week Assignment
  const activeRoster = rosters.find(r => r.isActive) || rosters[0] || null;
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const activeAssignments = useMemo(() => {
    if (!activeRoster) return assignments;
    const rosterSpecific = assignments.filter(a => a.rosterId === activeRoster.id);
    return rosterSpecific.length > 0 ? rosterSpecific : assignments;
  }, [assignments, activeRoster]);

  const sortedAssignments = useMemo(() => {
    return [...activeAssignments].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [activeAssignments]);

  const featuredAssignment = useMemo(() => {
    if (sortedAssignments.length === 0) return null;
    const thisWeek = sortedAssignments.find(a => todayStr >= a.startDate && todayStr <= a.endDate);
    if (thisWeek) return thisWeek;
    const upcoming = sortedAssignments.find(a => a.startDate > todayStr);
    return upcoming || sortedAssignments[0];
  }, [sortedAssignments, todayStr]);

  const isAlreadySent = useMemo(() => {
    if (!featuredAssignment) return false;
    return sendHistory.some(h => h.assignmentId === featuredAssignment.id && h.status === 'sent_confirmed');
  }, [featuredAssignment, sendHistory]);

  const isDutyPending = !!featuredAssignment && !isAlreadySent;

  // Missing house count for today (drives App Icon Badge + Attendance tab badge)
  const missingTodayCount = useMemo(() => {
    const activeHouses = houses.filter(h => h.active);
    const todayReportsSet = new Set(reports.filter(r => r.reportingDate === todayStr).map(r => r.houseId));
    return activeHouses.filter(h => !todayReportsSet.has(h.id)).length;
  }, [houses, reports, todayStr]);

  const handleMarkFeaturedDone = useCallback(async () => {
    if (!featuredAssignment) return;
    stopRepeatingAlarmSound();
    clearSoundSnooze();
    awaitingWhatsAppReturnRef.current = false;
    setAlarmSheetMode('none');
    const { generateAnnouncementMessage, formatDutyDate } = await import('./services/messageGenerator');
    const { recordSendHistory } = await import('./services/firebase');
    const msg = generateAnnouncementMessage(settings.messageTemplate, featuredAssignment);
    const item: SendHistory = {
      id: `sent-${Date.now()}`,
      assignmentId: featuredAssignment.id,
      weekLabel: featuredAssignment.weekLabel,
      dutyPeriod: `${formatDutyDate(featuredAssignment.startDate)} - ${formatDutyDate(featuredAssignment.endDate)}`,
      message: msg,
      timestamp: new Date().toISOString(),
      status: 'sent_confirmed'
    };
    await recordSendHistory(item);
    await refreshAllData();
    setSuccessToast(`Marked ${featuredAssignment.weekLabel} done! Reminders silenced.`);
    setTimeout(() => setSuccessToast(null), 3500);
  }, [featuredAssignment, settings.messageTemplate, refreshAllData]);

  const handleWhatsAppLaunched = useCallback(() => {
    stopRepeatingAlarmSound();
    awaitingWhatsAppReturnRef.current = true;
    setAlarmSheetMode('none');
  }, []);

  // Listen for Service Worker notification action clicks & deep URL query params
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'mark_done' && featuredAssignment && !isAlreadySent) {
      window.history.replaceState({}, '', '/');
      handleMarkFeaturedDone();
    }

    if (!('serviceWorker' in navigator)) return;
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'MARK_DUTY_DONE') {
        handleMarkFeaturedDone();
      } else if (event.data?.type === 'OPEN_DUTY_TAB') {
        setActiveTab('duty');
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [featuredAssignment, isAlreadySent, handleMarkFeaturedDone]);

  // Maxed-out repeating push watchdog + focus re-trigger + App Badge + Flashing Page Title
  useEffect(() => {
    const badgeTotal = (isDutyPending ? 1 : 0) + missingTodayCount;
    syncAppBadge(badgeTotal);

    if (!isDutyPending || !featuredAssignment) {
      stopRepeatingAlarmSound();
      setAlarmSheetMode('none');
      document.title = 'Xtreme';
      return;
    }

    const teachersText = featuredAssignment.teachers.map(t => t.name).join(', ') || 'Teachers';

    const triggerCheck = async (force: boolean = false) => {
      const triggered = await checkAndTriggerDutyAlert(
        featuredAssignment.id,
        featuredAssignment.weekLabel,
        teachersText,
        false,
        force
      );
      if (triggered && !isSoundSnoozed() && !awaitingWhatsAppReturnRef.current) {
        setAlarmSheetMode('alarm');
      }
    };

    // Immediate alert check
    triggerCheck(false);

    // Repeat every 60 seconds while pending
    const repeatTimer = setInterval(() => {
      triggerCheck(false);
    }, 60 * 1000);

    // On resume: show 1-tap Mark Done confirmation if user just returned from WhatsApp, else re-check alarm
    const onResume = () => {
      if (document.visibilityState === 'visible') {
        if (awaitingWhatsAppReturnRef.current) {
          awaitingWhatsAppReturnRef.current = false;
          setAlarmSheetMode('confirm_sent');
          return;
        }
        triggerCheck(false);
      }
    };
    window.addEventListener('focus', onResume);
    document.addEventListener('visibilitychange', onResume);

    // Attention-grabbing alternating browser tab title
    let flash = false;
    const titleTimer = setInterval(() => {
      flash = !flash;
      document.title = flash
        ? `⚠️ SEND DUTY NOW (${featuredAssignment.weekLabel})`
        : '🔔 Xtreme — Duty Pending';
    }, 1200);

    return () => {
      clearInterval(repeatTimer);
      clearInterval(titleTimer);
      window.removeEventListener('focus', onResume);
      document.removeEventListener('visibilitychange', onResume);
      document.title = 'Xtreme';
    };
  }, [isDutyPending, featuredAssignment, missingTodayCount]);

  // Scheduled Sunday Reminder Alarm
  useEffect(() => {
    if (!settings.reminderEnabled || !isDutyPending || !featuredAssignment) return;

    const checkSundayReminder = async () => {
      const isDay = isTodayReminderDay(settings.reminderDay ?? 0);
      const isTime = hasReminderTimePassed(settings.reminderTime ?? '08:00');
      if (isDay && isTime && assignments.length > 0) {
        const teachersText = featuredAssignment.teachers.map(t => t.name).join(', ') || 'Teachers';
        await checkAndTriggerDutyAlert(
          featuredAssignment.id,
          featuredAssignment.weekLabel,
          teachersText,
          false,
          false
        );
      }
    };

    checkSundayReminder();
    const timer = setInterval(checkSundayReminder, 60 * 1000);
    return () => clearInterval(timer);
  }, [settings.reminderEnabled, settings.reminderDay, settings.reminderTime, assignments.length, isDutyPending, featuredAssignment]);

  const handleConfirmSaveRoster = async (newRoster: Roster, newAssignments: DutyAssignment[]): Promise<void> => {
    await saveRosterWithAssignments(newRoster, newAssignments);
    await refreshAllData();
    setActiveTab('duty');
    setSuccessToast(`${newRoster.name} saved! ${newAssignments.length} duty weeks ready.`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleDeleteRoster = async (rosterId: string) => {
    const target = rosters.find(r => r.id === rosterId);
    const targetName = target?.name || 'Duty roster';
    try {
      await deleteRoster(rosterId);
      await refreshAllData();
      setSuccessToast(`"${targetName}" deleted.`);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: any) {
      setErrorToast(`Failed to delete roster: ${err.message || 'Please try again.'}`);
      setTimeout(() => setErrorToast(null), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-page)] flex flex-col font-sans relative overflow-x-hidden transition-colors duration-200">
      {successToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-emerald-500 text-black font-bold text-xs shadow-2xl flex items-center gap-2">
          <span>{successToast}</span>
        </div>
      )}

      {errorToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-rose-500 text-white font-bold text-xs shadow-2xl flex items-center gap-2">
          <span>⚠️ {errorToast}</span>
        </div>
      )}

      {/* Minimal 3-Tab Header with Brand Logo & Install Action */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDutyPending={isDutyPending}
        missingReportsCount={missingTodayCount}
      />

      {/* Impossible-to-miss Pinned Banner & iPhone Alarm Sheet while Weekly Duty is Pending */}
      <UrgentDutyBanner
        featuredAssignment={featuredAssignment}
        isAlreadySent={isAlreadySent}
        messageTemplate={settings.messageTemplate}
        settings={settings}
        alarmSheetMode={alarmSheetMode}
        onChangeAlarmSheetMode={setAlarmSheetMode}
        onWhatsAppLaunched={handleWhatsAppLaunched}
        onMarkDone={handleMarkFeaturedDone}
        onNavigateToDuty={() => setActiveTab('duty')}
      />

      <main className="flex-1 overflow-x-hidden relative z-10">
        {(activeTab === 'houseReports' || activeTab === 'home') && (
          <HouseReportingTab
            houses={houses}
            reports={reports}
            terms={terms}
            settings={settings}
            onRefreshData={refreshAllData}
            onOpenSettings={(section) => {
              if (section) setSettingsInitialSection(section);
              setActiveTab('settings');
            }}
          />
        )}

        {activeTab === 'duty' && (
          <DutyTab
            rosters={rosters}
            assignments={assignments}
            settings={settings}
            sendHistory={sendHistory}
            onReviewParsedData={data => setReviewData(data)}
            onRefreshData={refreshAllData}
            onDeleteRoster={handleDeleteRoster}
            onWhatsAppLaunched={handleWhatsAppLaunched}
            onTriggerAlarmTest={() => {
              if (isDutyPending) setAlarmSheetMode('alarm');
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            houses={houses}
            terms={terms}
            onRefreshData={refreshAllData}
            initialSection={settingsInitialSection}
          />
        )}
      </main>

      <OfflineIndicator />

      {reviewData && (
        <ReviewDataModal
          parsedData={reviewData}
          onConfirmSave={handleConfirmSaveRoster}
          onClose={() => setReviewData(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}
