import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  sendLocalNotification
} from './services/notificationService';
import { buildGoogleSheetCsvUrl } from './services/sheetsParser';
import { DutyTab } from './components/DutyTab';
import { HouseReportingTab } from './components/HouseReportingTab';
import { HistoryTab } from './components/HistoryTab';
import { SettingsTab } from './components/SettingsTab';
import { ReviewDataModal } from './components/ReviewDataModal';

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
  const [activeTab, setActiveTab] = useState<ActiveNavTab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('form') || params.has('report')) {
        return 'houseReports';
      }
    }
    return 'home';
  });

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

  // Zero loading block: never block UI with a loading spinner
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Stale-While-Revalidate: Refresh data in the background without blanking the screen
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
    }
  }, [setTheme]);

  // Purge lingering demo data from localStorage on boot
  useEffect(() => {
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

  // REAL-TIME FIRESTORE LISTENER & 1-SECOND AUTO-CHECKING FOR INSTANT HOUSE REPORTS
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = subscribeToHouseReports((liveReports) => {
      if (isMounted) setReports(liveReports);
    });

    // 1-second recurring auto-check (zero buttons to press, instant sync)
    const timer = setInterval(async () => {
      if (!isMounted || document.visibilityState !== 'visible') return;
      try {
        const fresh = await getHouseReports();
        if (isMounted && Array.isArray(fresh)) {
          setReports(fresh);
        }
      } catch (err) {
        // Silent background check
      }
    }, 1000);

    return () => {
      isMounted = false;
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

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
          <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center animate-pulse font-bold text-sm">
              X
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Loading...
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
              <DutyTab
                rosters={rosters}
                assignments={assignments}
                settings={settings}
                sendHistory={sendHistory}
                onReviewParsedData={data => setReviewData(data)}
                onRefreshData={refreshAllData}
                onDeleteRoster={handleDeleteRoster}
              />
            )}

            {activeTab === 'houseReports' && (
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

            {activeTab === 'history' && (
              <HistoryTab
                houses={houses}
                reports={reports}
                terms={terms}
                dutyHistory={sendHistory}
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
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="px-6 py-3 border-t border-[var(--card-border)] bg-[var(--footer-bg)] flex justify-center items-center text-[11px] text-[var(--text-muted)] relative z-10 transition-colors">
        <div>Xtreme Attendance &amp; Duty Operations</div>
      </footer>

      {/* Modal: Review Data Before Saving to Database */}
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
