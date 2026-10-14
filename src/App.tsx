import React, { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { Header, type ActiveNavTab } from './components/Header';
import { HomeScreen } from './components/HomeScreen';
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
  SAMPLE_ASSIGNMENTS,
  SAMPLE_ROSTER,
  SAMPLE_ROSTER_ID
} from './services/sampleData';
import {
  hasReminderTimePassed,
  isTodayReminderDay,
  sendLocalNotification
} from './services/notificationService';
import { buildGoogleSheetCsvUrl } from './services/sheetsParser';

// LAZY LOAD HEAVY SECONDARY TABS & MODALS
const DutyTab = React.lazy(() => import('./components/DutyTab').then(m => ({ default: m.DutyTab })));
const HouseReportingTab = React.lazy(() => import('./components/HouseReportingTab').then(m => ({ default: m.HouseReportingTab })));
const HistoryTab = React.lazy(() => import('./components/HistoryTab').then(m => ({ default: m.HistoryTab })));
const SettingsTab = React.lazy(() => import('./components/SettingsTab').then(m => ({ default: m.SettingsTab })));
const ReviewDataModal = React.lazy(() => import('./components/ReviewDataModal').then(m => ({ default: m.ReviewDataModal })));

// Pure, fast hash function to determine if sheet data has significantly changed
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
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('home');

  // SYNCHRONOUS HYDRATION FROM LOCAL CACHE FOR 0ms INSTANT LOAD
  const [rosters, setRosters] = useState<Roster[]>(() => getCachedRosters());
  const [assignments, setAssignments] = useState<DutyAssignment[]>(() => getCachedDutyAssignments());
  const [settings, setSettings] = useState<AppSettings>(() => getCachedSettings());
  const [sendHistory, setSendHistory] = useState<SendHistory[]>(() => getCachedSendHistory());
  const [houses, setHouses] = useState<HouseConfig[]>(() => getCachedHouses());
  const [terms, setTerms] = useState<AcademicTerm[]>(() => getCachedTerms());
  const [reports, setReports] = useState<HouseDailyReport[]>([]);
  const [settingsInitialSection, setSettingsInitialSection] = useState<string>('general');
  const [reviewData, setReviewData] = useState<ParsedRosterPayload | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // If local cache already has data, NEVER block UI with a loading spinner
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return getCachedRosters().length === 0 && getCachedDutyAssignments().length === 0;
  });

  // Stale-While-Revalidate: Refresh data in the background without blanking the screen
  const refreshAllData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial && getCachedRosters().length === 0) {
        setIsLoading(true);
      }
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
      const uniqueRosters = Array.from(new Map(fetchedRosters.map(r => [r.id, r])).values());
      const uniqueAssignments = Array.from(new Map(fetchedAssignments.map(a => [a.id, a])).values());
      setRosters(uniqueRosters);
      setAssignments(uniqueAssignments);
      setSendHistory(fetchedHistory);
      setHouses(fetchedHouses);
      setTerms(fetchedTerms);
      setReports(fetchedReports);

      // On initial fetch, synchronize theme preference from cloud settings if no local preference exists
      if (fetchedSettings.theme && !localStorage.getItem('xtreme_theme')) {
        setTheme(fetchedSettings.theme);
      }
    } catch (err) {
      console.warn('Background sync error (serving cache):', err);
    } finally {
      setIsLoading(false);
    }
  }, [setTheme]);

  // Sync data whenever authentication status changes (login / logout)
  useEffect(() => {
    refreshAllData();

    // Register PWA service worker on mount
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => console.log('Service Worker registered'))
        .catch(err => console.warn('Service Worker registration skipped:', err));
    }
  }, [refreshAllData, user]);

  // AUTOMATIC WEEKLY DUTY BACKGROUND SYNC
  useEffect(() => {
    if (!settings.googleSheetUrl) return;

    const performBackgroundSync = async () => {
      try {
        const csvUrl = buildGoogleSheetCsvUrl(settings.googleSheetUrl!);
        const response = await fetch(csvUrl);
        if (!response.ok) return;

        const csvText = await response.text();
        const currentHash = getSimpleHash(csvText);

        // Sync only if data has changed
        if (currentHash !== settings.lastSyncHash) {
          console.log('✨ Background sync: Roster changed. Parsing new schedule.');

          const encoder = new TextEncoder();
          const buffer = encoder.encode(csvText).buffer;
          
          // Dynamically import parser on demand so it doesn't slow down startup
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

          // Save the parsed data to Firestore/PostgreSQL and set active
          await saveRosterWithAssignments(newRoster, newAssignments);

          // Update saved settings with new lastSyncHash
          const updatedSettings: AppSettings = {
            ...settings,
            lastSyncHash: currentHash,
            updatedAt: new Date().toISOString()
          };
          await saveSettings(updatedSettings);

          // Refresh the UI data
          await refreshAllData();

          // Alert the user gently
          sendLocalNotification('✨ Schedule Sync Complete', {
            body: 'Your weekly teacher duty schedule has been updated with new changes.'
          });
        }
      } catch (err) {
        console.warn('Background sync checked: No action taken or fetch skipped.', err);
      }
    };

    // Silently check 8 seconds after app boot to avoid blocking initial render
    const timer = setTimeout(performBackgroundSync, 8000);
    return () => clearTimeout(timer);
  }, [settings.googleSheetUrl, settings.lastSyncHash, refreshAllData, settings]);

  // Sunday notification trigger logic
  useEffect(() => {
    if (!settings.reminderEnabled) return;

    const checkSundayReminder = async () => {
      const isDay = isTodayReminderDay(settings.reminderDay ?? 0);
      const isTime = hasReminderTimePassed(settings.reminderTime ?? '08:00');

      if (isDay && isTime) {
        const todayKey = `xtreme_notif_${new Date().toISOString().split('T')[0]}`;
        const alreadyFiredToday = localStorage.getItem(todayKey);
        
        if (!alreadyFiredToday && assignments.length > 0) {
          const sent = await sendLocalNotification('🔔 Weekly Duty Reminder', {
            body: 'Your teacher-duty announcement is ready. Tap to review and send it.'
          });
          if (sent) {
            localStorage.setItem(todayKey, 'true');
          }
        }
      }
    };

    checkSundayReminder();
    const timer = setInterval(checkSundayReminder, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [settings, assignments]);

  // Is today Sunday and reminder still pending?
  const isSundayPending = React.useMemo(() => {
    const isDay = isTodayReminderDay(settings.reminderDay ?? 0);
    if (!isDay || assignments.length === 0) return false;

    const todayStr = new Date().toISOString().split('T')[0];
    const sentToday = sendHistory.some(h => h.timestamp.startsWith(todayStr));
    return !sentToday;
  }, [settings.reminderDay, assignments, sendHistory]);

  // Handle saving newly reviewed roster data
  const handleConfirmSaveRoster = async (newRoster: Roster, newAssignments: DutyAssignment[]): Promise<void> => {
    try {
      await saveRosterWithAssignments(newRoster, newAssignments);
      await refreshAllData();
      setActiveTab('home');
      setSuccessToast(`🎉 ${newRoster.name} saved! ${newAssignments.length} duty weeks ready.`);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      console.error('[RosterSave:App] Error in saveRosterWithAssignments chain:', err);
      throw err;
    }
  };

  // Load harmless demo roster
  const handleLoadSampleRoster = async () => {
    await saveRosterWithAssignments(SAMPLE_ROSTER, SAMPLE_ASSIGNMENTS);
    await refreshAllData();
    setActiveTab('home');
    setSuccessToast('✨ Demo duty schedule loaded! Xtreme can now review weekly announcements.');
    setTimeout(() => setSuccessToast(null), 4000);
  };

  // Delete any loaded roster
  const handleDeleteRoster = async (rosterId: string) => {
    const target = rosters.find(r => r.id === rosterId);
    const targetName = target?.name || 'Duty roster';
    try {
      await deleteRoster(rosterId);
      await refreshAllData();
      setSuccessToast(`🗑️ "${targetName}" deleted successfully.`);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: any) {
      console.error('Failed to delete roster:', err);
      setErrorToast(`Failed to delete roster: ${err.message || 'Please try again.'}`);
      setTimeout(() => setErrorToast(null), 4000);
    }
  };

  // Remove demo roster
  const handleDeleteSampleRoster = async () => {
    await handleDeleteRoster(SAMPLE_ROSTER_ID);
  };

  // Save settings update
  const handleUpdateSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    if (newSettings.theme) {
      setTheme(newSettings.theme);
    }
    await saveSettings(newSettings);
  };

  const activeRoster = rosters.find(r => r.isActive) || rosters[0] || null;

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-page)] flex flex-col font-sans relative overflow-x-hidden transition-colors duration-200">
      {/* Ambient Background Orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      {/* Visual Success Toast */}
      {successToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-emerald-500 text-black font-bold text-xs shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <span>{successToast}</span>
        </div>
      )}

      {/* Visual Error Toast */}
      {errorToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-rose-500 text-white font-bold text-xs shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <span>⚠️ {errorToast}</span>
        </div>
      )}

      {/* Header Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSundayPending={isSundayPending}
      />

      {/* Main Tab Views */}
      <main className="flex-1 overflow-x-hidden relative z-10">
        {isLoading ? (
          <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center animate-pulse font-black text-lg">
              X
            </div>
            <p className="text-xs font-mono text-[var(--text-muted)]">
              Loading Xtreme Duty Assistant...
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeScreen
                rosters={rosters}
                assignments={assignments}
                settings={settings}
                sendHistory={sendHistory}
                houses={houses}
                reports={reports}
                terms={terms}
                onNavigateTab={setActiveTab}
                onRefreshData={refreshAllData}
              />
            )}

            {activeTab === 'duty' && (
              <Suspense fallback={
                <div className="min-h-[50vh] flex items-center justify-center text-xs font-mono text-[var(--text-muted)]">
                  <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mr-2" />
                  Opening Duty Tab...
                </div>
              }>
                <DutyTab
                  rosters={rosters}
                  assignments={assignments}
                  settings={settings}
                  sendHistory={sendHistory}
                  onReviewParsedData={data => setReviewData(data)}
                  onRefreshData={refreshAllData}
                  onLoadSampleRoster={handleLoadSampleRoster}
                  onDeleteSampleRoster={handleDeleteSampleRoster}
                  onDeleteRoster={handleDeleteRoster}
                />
              </Suspense>
            )}

            {activeTab === 'houseReports' && (
              <Suspense fallback={
                <div className="min-h-[50vh] flex items-center justify-center text-xs font-mono text-[var(--text-muted)]">
                  <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mr-2" />
                  Opening House Reports...
                </div>
              }>
                <HouseReportingTab
                  houses={houses}
                  reports={reports}
                  terms={terms}
                  onRefreshData={refreshAllData}
                  onOpenSettings={(section) => {
                    if (section) setSettingsInitialSection(section);
                    setActiveTab('settings');
                  }}
                />
              </Suspense>
            )}

            {activeTab === 'history' && (
              <Suspense fallback={
                <div className="min-h-[50vh] flex items-center justify-center text-xs font-mono text-[var(--text-muted)]">
                  <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mr-2" />
                  Opening History...
                </div>
              }>
                <HistoryTab
                  houses={houses}
                  reports={reports}
                  terms={terms}
                  dutyHistory={sendHistory}
                />
              </Suspense>
            )}

            {activeTab === 'settings' && (
              <Suspense fallback={
                <div className="min-h-[50vh] flex items-center justify-center text-xs font-mono text-[var(--text-muted)]">
                  <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mr-2" />
                  Opening Settings...
                </div>
              }>
                <SettingsTab
                  settings={settings}
                  houses={houses}
                  terms={terms}
                  onRefreshData={refreshAllData}
                  initialSection={settingsInitialSection}
                />
              </Suspense>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-[var(--card-border)] bg-[var(--footer-bg)] backdrop-blur-md flex justify-center items-center font-mono text-[10px] text-[var(--text-subtle)] uppercase tracking-widest relative z-10 transition-colors">
        <div>&copy; 2026 Xtreme Assistant. Powered by Ishizaki.</div>
      </footer>

      {/* Modal: Review Data Before Saving to Database */}
      {reviewData && (
        <Suspense fallback={null}>
          <ReviewDataModal
            parsedData={reviewData}
            onConfirmSave={handleConfirmSaveRoster}
            onClose={() => setReviewData(null)}
          />
        </Suspense>
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
