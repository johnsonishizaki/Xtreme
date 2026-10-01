/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { HomeScreen } from './components/HomeScreen';
import { RosterTab } from './components/RosterTab';
import { SendHistoryModal } from './components/SendHistoryModal';
import { SettingsModal } from './components/SettingsModal';
import { ReviewDataModal } from './components/ReviewDataModal';
import {
  AppSettings,
  DutyAssignment,
  ParsedRosterPayload,
  Roster,
  SendHistory
} from './types';
import {
  DEFAULT_SETTINGS,
  getDutyAssignments,
  getRosters,
  getSendHistory,
  getSettings,
  saveRosterWithAssignments,
  saveSettings,
  deleteRoster
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
import { parseSpreadsheet } from './services/rosterParser';

// Pure, fast hash function to determine if sheet data has significantly changed
function getSimpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(36);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'roster' | 'history' | 'settings'>('home');
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [assignments, setAssignments] = useState<DutyAssignment[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [sendHistory, setSendHistory] = useState<SendHistory[]>([]);
  const [reviewData, setReviewData] = useState<ParsedRosterPayload | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load all data from Firestore (with local offline cache fallback)
  const refreshAllData = useCallback(async () => {
    try {
      const [fetchedSettings, fetchedRosters, fetchedAssignments, fetchedHistory] = await Promise.all([
        getSettings(),
        getRosters(),
        getDutyAssignments(),
        getSendHistory()
      ]);

      setSettings(fetchedSettings);
      setRosters(fetchedRosters);
      setAssignments(fetchedAssignments);
      setSendHistory(fetchedHistory);
    } catch (err) {
      console.error('Error refreshing app data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAllData();

    // Register PWA service worker
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => console.log('Service Worker registered'))
        .catch(err => console.warn('Service Worker registration skipped:', err));
    }
  }, [refreshAllData]);

  // AUTOMATIC WEEKLY DUTY BACKGROUND SYNC
  // Checks the Google Sheet in the background, only triggering the parser if the data has actually changed
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
          
          // Deterministic local parsing (no expensive AI unless explicitly required)
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

          // Save the parsed data to Firestore and set active
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
        } else {
          console.log('✨ Background sync: Schedule hash matches. No changes detected.');
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
    const timer = setInterval(checkSundayReminder, 15 * 60 * 1000); // check every 15 mins
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

  // Handle saving newly reviewed roster data with strict promise resolution
  const handleConfirmSaveRoster = async (newRoster: Roster, newAssignments: DutyAssignment[]): Promise<void> => {
    console.log('[RosterSave:App] 1. handleConfirmSaveRoster received save request for roster:', {
      id: newRoster.id,
      name: newRoster.name,
      totalWeeks: newAssignments.length
    });

    try {
      console.log('[RosterSave:App] 2. Awaiting Firestore batch write (saveRosterWithAssignments)...');
      // Step 1: Wait for Firestore operations to successfully finish before triggering state updates
      await saveRosterWithAssignments(newRoster, newAssignments);
      console.log('[RosterSave:App] 3. Firestore write resolved successfully.');

      console.log('[RosterSave:App] 4. Refreshing application state from database...');
      // Step 2: Fetch and synchronize latest verified data
      await refreshAllData();
      console.log('[RosterSave:App] 5. Application state refreshed from backend.');

      // Step 3: Switch to Home tab so user sees the newly activated duty schedule
      setActiveTab('home');

      // Step 4: Display visual toast confirmation
      setSuccessToast(`🎉 ${newRoster.name} saved! ${newAssignments.length} duty weeks ready.`);
      setTimeout(() => setSuccessToast(null), 4000);

      console.log('[RosterSave:App] 6. Save event lifecycle completed successfully.');
    } catch (err: any) {
      console.error('[RosterSave:App] Error in saveRosterWithAssignments chain:', err);
      // Propagate error back to ReviewDataModal so it can alert the user and stay in editable state
      throw err;
    }
  };

  // Load harmless demo roster
  const handleLoadSampleRoster = async () => {
    await saveRosterWithAssignments(SAMPLE_ROSTER, SAMPLE_ASSIGNMENTS);
    await refreshAllData();
    setActiveTab('home');
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
      alert(`Failed to delete roster: ${err.message || 'Please try again.'}`);
    }
  };

  // Remove demo roster
  const handleDeleteSampleRoster = async () => {
    await handleDeleteRoster(SAMPLE_ROSTER_ID);
  };

  // Save settings update
  const handleUpdateSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await saveSettings(newSettings);
  };

  const activeRoster = rosters.find(r => r.isActive) || rosters[0] || null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Visual Success Toast */}
      {successToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <span>{successToast}</span>
        </div>
      )}

      {/* Header Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeRoster={activeRoster}
        isSundayPending={isSundayPending}
      />

      {/* Main Tab Views */}
      <main className="flex-1 overflow-x-hidden">
        {isLoading ? (
          <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center animate-pulse font-black text-lg">
              X
            </div>
            <p className="text-xs font-semibold text-slate-400">
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
                onOpenRosterModal={() => setActiveTab('roster')}
                onRefreshHistory={refreshAllData}
                onLoadSampleRoster={handleLoadSampleRoster}
              />
            )}

            {activeTab === 'roster' && (
              <RosterTab
                rosters={rosters}
                assignments={assignments}
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                onReviewParsedData={data => setReviewData(data)}
                onRefreshData={refreshAllData}
                onLoadSampleRoster={handleLoadSampleRoster}
                onDeleteSampleRoster={handleDeleteSampleRoster}
                onDeleteRoster={handleDeleteRoster}
              />
            )}

            {activeTab === 'history' && (
              <SendHistoryModal
                history={sendHistory}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsModal
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
              />
            )}
          </>
        )}
      </main>

      {/* Modal: Review Data Before Saving to Firestore */}
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
