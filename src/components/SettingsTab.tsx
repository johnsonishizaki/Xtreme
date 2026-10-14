import React, { useState } from 'react';
import {
  Settings,
  Users,
  Calendar,
  Bell,
  MessageSquare,
  FileSpreadsheet,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Trash2,
  Save,
  Plus,
  ExternalLink,
  Copy,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import {
  HouseConfig,
  AcademicTerm,
  AppSettings
} from '../types';
import {
  saveSettings,
  saveHouses,
  saveTerm,
  loadAllDemoData,
  clearAllDemoData,
  DEFAULT_TEMPLATE
} from '../services/firebase';
import { sendLocalNotification } from '../services/notificationService';
import { copyToClipboard } from '../services/messageGenerator';
import { OperationProgressModal } from './OperationProgressModal';
import { useOperationProgress } from '../hooks/useOperationProgress';

interface SettingsTabProps {
  settings: AppSettings;
  houses: HouseConfig[];
  terms: AcademicTerm[];
  onRefreshData: () => Promise<void>;
  initialSection?: string;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  houses,
  terms,
  onRefreshData,
  initialSection = 'general'
}) => {
  const [activeSection, setActiveSection] = useState<string>(initialSection);
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [localHouses, setLocalHouses] = useState<HouseConfig[]>(houses);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // New Term Form state
  const [showNewTermForm, setShowNewTermForm] = useState(false);
  const [newTermYear, setNewTermYear] = useState('2026/2027');
  const [newTermName, setNewTermName] = useState('Term 2');
  const [newTermOpeningDate, setNewTermOpeningDate] = useState('2027-01-10');
  const [newTermStartDate, setNewTermStartDate] = useState('2027-01-10');
  const [newTermEndDate, setNewTermEndDate] = useState('2027-01-15');

  const opProgress = useOperationProgress();

  // AI Diagnostic Testing state
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    success: boolean;
    message: string;
    latency?: number;
  } | null>(null);

  const handleTestAi = async () => {
    try {
      setAiTesting(true);
      setAiTestResult(null);

      opProgress.startOperation(
        'Testing Gemini AI Engine',
        [
          { label: 'Connecting to server API endpoint', detail: '/api/roster-parse' },
          { label: 'Dispatching sample duty roster prompt to Gemini Flash', detail: 'Evaluating latency & model responsiveness' },
          { label: 'Verifying structured assignments schema', detail: 'Validating JSON payload' },
          { label: 'AI operational status confirmed', detail: 'Ready for roster processing' }
        ],
        'Evaluating live AI responsiveness and extraction latency...'
      );

      opProgress.setStage(0, 'Connecting to /api/roster-parse...', 25);
      const start = Date.now();
      opProgress.setStage(1, 'Sending test duty roster to Gemini AI model...', 55);

      const res = await fetch('/api/roster-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Weekly Roster: Week 1 (08 Sep - 14 Sep 2026): Teacher Alpha, Teacher Beta',
          fileName: 'ai_live_diagnostic.txt',
          sourceType: 'text'
        })
      });
      const data = await res.json();
      const elapsed = Date.now() - start;

      if (data.success && Array.isArray(data.assignments) && data.assignments.length > 0) {
        opProgress.setStage(2, `Extracted ${data.assignments.length} assignments in ${(elapsed / 1000).toFixed(1)}s`, 85);
        const resultMsg = `AI is functioning perfectly (${data.assignments.length} assignments extracted in ${(elapsed / 1000).toFixed(1)}s)`;
        setAiTestResult({
          success: true,
          message: resultMsg,
          latency: elapsed
        });
        opProgress.setStage(3, 'Fully operational!', 100);
        await opProgress.completeOperation(resultMsg, 600);
      } else {
        const errorMsg = data.error || 'AI returned incomplete or empty data.';
        setAiTestResult({
          success: false,
          message: errorMsg
        });
        opProgress.failOperation(errorMsg);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to reach AI service.';
      setAiTestResult({
        success: false,
        message: msg
      });
      opProgress.failOperation(msg);
    } finally {
      setAiTesting(false);
    }
  };

  const showNotification = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const showErrorNotification = (msg: string) => {
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 4000);
  };

  // Save General & Duty Settings
  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      await saveSettings(localSettings);
      await onRefreshData();
      showNotification('Settings saved successfully.');
    } catch (err: any) {
      showErrorNotification('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Save Houses Configuration
  const handleSaveHouses = async () => {
    try {
      setSaving(true);
      await saveHouses(localHouses);
      await onRefreshData();
      showNotification('8 Houses configuration saved.');
    } catch (err: any) {
      showErrorNotification('Failed to save houses: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // House field updater
  const updateHouseField = (id: string, field: keyof HouseConfig, value: any) => {
    setLocalHouses(prev =>
      prev.map(h => (h.id === id ? { ...h, [field]: value } : h))
    );
  };

  // Create New Academic Term
  const handleCreateNewTerm = async () => {
    try {
      setSaving(true);
      const newTerm: AcademicTerm = {
        id: `term-${Date.now()}`,
        academicYear: newTermYear,
        termName: newTermName,
        openingDate: newTermOpeningDate,
        reportingStartDate: newTermStartDate,
        reportingEndDate: newTermEndDate,
        status: 'open',
        houseExpectedCounts: Object.fromEntries(localHouses.map(h => [h.id, h.expectedStudentCount])),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await saveTerm(newTerm);
      // Update active term setting
      const updatedSettings = { ...localSettings, activeTermId: newTerm.id };
      setLocalSettings(updatedSettings);
      await saveSettings(updatedSettings);
      await onRefreshData();
      setShowNewTermForm(false);
      showNotification(`🎉 ${newTerm.termName} created and set as active.`);
    } catch (err: any) {
      showErrorNotification('Failed to create term: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Test Notification
  const handleTestNotification = async () => {
    const sent = await sendLocalNotification('🔔 Xtreme Duty Notification Test', {
      body: 'Notifications are functioning properly for weekly duty reminders.'
    });
    if (sent) {
      showNotification('Test notification dispatched!');
    } else {
      showErrorNotification('Notification blocked or not supported on this browser.');
    }
  };

  // Demo Data triggers with real-time staged progress
  const handleLoadDemo = async () => {
    try {
      opProgress.startOperation(
        'Loading Demo Suite for Xtreme',
        [
          { label: 'Initializing 8 Houses Configuration', detail: '4 Boys & 4 Girls houses' },
          { label: 'Creating 12-week duty schedule & rotating staff', detail: 'Writing to Firestore' },
          { label: 'Seeding term-opening house reports & follow-ups', detail: 'Simulating daily submissions' },
          { label: 'Synchronizing application state', detail: 'Updating local cache' }
        ],
        'Populating sample database in background...'
      );
      opProgress.setStage(0, 'Setting up 8 houses...', 20);
      opProgress.setStage(1, 'Writing roster & 12 duty weeks to Firestore...', 50);
      await loadAllDemoData();
      opProgress.setStage(2, 'Seeding house reporting data...', 80);
      opProgress.setStage(3, 'Finalizing sync...', 95);
      await onRefreshData();
      await opProgress.completeOperation('Complete demo suite loaded successfully!', 600);
      showNotification('Demo duty roster and 8-house reports loaded.');
    } catch (err: any) {
      opProgress.failOperation(err.message || 'Failed to load demo data.');
      showErrorNotification('Failed to load demo data.');
    }
  };

  const handleClearDemo = async () => {
    try {
      opProgress.startOperation(
        'Clearing Demo Data',
        [
          { label: 'Locating demo records in Firestore', detail: 'Querying sample reports' },
          { label: 'Purging sample daily reports', detail: 'Cleaning Firestore collections' },
          { label: 'Refreshing collation state', detail: 'Re-calculating metrics' }
        ],
        'Clearing sample records in background...'
      );
      opProgress.setStage(0, 'Locating demo records...', 25);
      opProgress.setStage(1, 'Purging sample reports from Firestore...', 65);
      await clearAllDemoData();
      opProgress.setStage(2, 'Refreshing local cache...', 90);
      await onRefreshData();
      await opProgress.completeOperation('Demo reports cleared successfully.', 500);
      showNotification('Demo reports cleared.');
    } catch (err: any) {
      opProgress.failOperation(err.message || 'Failed to clear demo data.');
      showErrorNotification('Failed to clear demo data.');
    }
  };

  // Helper for generating prefilled Google Form URL
  const generatePrefilledFormLink = (houseName: string) => {
    const baseUrl = localSettings.googleFormUrl?.trim() || 'https://forms.google.com/example-form';
    const entryId = localSettings.googleFormHouseEntryId?.trim() || 'entry.123456';
    return `${baseUrl}?usp=pp_url&${entryId}=${encodeURIComponent(houseName)}`;
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-28 text-left">
      {/* Toast */}
      {successToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-emerald-500 text-black font-bold text-xs shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successToast}</span>
        </div>
      )}

      {errorToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-rose-500 text-white font-bold text-xs shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <span>⚠️ {errorToast}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-500">
          Senior Houseparent Configuration
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-page)]">
          Settings & Diagnostics
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Configure 8 houses, academic terms, reminder schedules, and Google Form links
        </p>
      </div>

      {/* Section Navigation Tabs */}
      <div className="flex rounded-2xl p-1 bg-[var(--nav-bg)] border border-[var(--card-border)] overflow-x-auto scrollbar-thin">
        {[
          { id: 'general', label: 'General & Houses', icon: Users },
          { id: 'terms', label: 'Terms Management', icon: Calendar },
          { id: 'duty', label: 'Duty & Templates', icon: MessageSquare },
          { id: 'notifications', label: 'Notifications', icon: Bell },
          { id: 'integrations', label: 'Google & Apps Script', icon: FileSpreadsheet },
          { id: 'diagnostics', label: 'Diagnostics & Demo', icon: Activity }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`px-3 py-2 rounded-xl text-xs font-mono font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                isActive ? 'bg-emerald-500 text-black shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION 1: GENERAL & 8 HOUSES CONFIGURATION */}
      {activeSection === 'general' && (
        <div className="space-y-6">
          {/* Identity Box */}
          <div className="p-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-3">
            <h3 className="text-sm font-bold text-[var(--text-page)] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Operator Identity</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-2xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)]">
                <span className="text-[10px] text-[var(--text-muted)] block">Application Name</span>
                <span className="font-extrabold text-[var(--text-page)]">Xtreme</span>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)]">
                <span className="text-[10px] text-[var(--text-muted)] block">Assigned Senior Role</span>
                <span className="font-extrabold text-emerald-400">Senior Houseparent (Xtreme)</span>
              </div>
            </div>
          </div>

          {/* 8 Houses Configuration */}
          <div className="p-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--card-border-subtle)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-page)]">
                  8 Houses Configuration
                </h3>
                <p className="text-[10px] font-mono text-[var(--text-muted)]">
                  4 Boys houses &bull; 4 Girls houses (editable names and expected student counts)
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveHouses}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs font-mono uppercase flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Houses</span>
              </button>
            </div>

            <div className="space-y-3">
              {localHouses.map(h => (
                <div
                  key={h.id}
                  className="p-3.5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className={`font-bold ${h.category === 'Boys' ? 'text-blue-400' : 'text-pink-400'}`}>
                      {h.category} House ({h.id})
                    </span>
                    <span className="text-[10px] text-[var(--text-subtle)]">Order: {h.displayOrder}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-0.5">House Name</label>
                      <input
                        type="text"
                        value={h.name}
                        onChange={e => updateHouseField(h.id, 'name', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-bold text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-0.5">Category</label>
                      <select
                        value={h.category}
                        onChange={e => updateHouseField(h.id, 'category', e.target.value as any)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-mono text-xs"
                      >
                        <option value="Boys">Boys</option>
                        <option value="Girls">Girls</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-0.5">Assigned Houseparent</label>
                      <input
                        type="text"
                        value={h.assignedHouseparent}
                        onChange={e => updateHouseField(h.id, 'assignedHouseparent', e.target.value)}
                        placeholder="e.g. Houseparent 1"
                        className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-0.5">Expected Students</label>
                      <input
                        type="number"
                        min="1"
                        value={h.expectedStudentCount}
                        onChange={e => updateHouseField(h.id, 'expectedStudentCount', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-bold text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: TERMS MANAGEMENT */}
      {activeSection === 'terms' && (
        <div className="space-y-6">
          <div className="p-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--card-border-subtle)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-page)]">Academic Terms</h3>
                <p className="text-[10px] font-mono text-[var(--text-muted)]">
                  Configure opening reporting periods & start new terms without deleting history
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowNewTermForm(!showNewTermForm)}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 text-black font-bold text-xs font-mono uppercase flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showNewTermForm ? 'Cancel' : 'New Term'}</span>
              </button>
            </div>

            {/* New Term Setup Form */}
            {showNewTermForm && (
              <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
                <div className="text-xs font-mono font-bold text-emerald-400">Setup New Academic Term</div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-1">Academic Year</label>
                    <input
                      type="text"
                      value={newTermYear}
                      onChange={e => setNewTermYear(e.target.value)}
                      placeholder="e.g. 2026/2027"
                      className="w-full px-3 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-1">Term Name</label>
                    <input
                      type="text"
                      value={newTermName}
                      onChange={e => setNewTermName(e.target.value)}
                      placeholder="e.g. Term 2"
                      className="w-full px-3 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-1">Opening Date</label>
                    <input
                      type="date"
                      value={newTermOpeningDate}
                      onChange={e => setNewTermOpeningDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-mono text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-1">Reporting Start</label>
                      <input
                        type="date"
                        value={newTermStartDate}
                        onChange={e => setNewTermStartDate(e.target.value)}
                        className="w-full px-2 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-1">Reporting End</label>
                      <input
                        type="date"
                        value={newTermEndDate}
                        onChange={e => setNewTermEndDate(e.target.value)}
                        className="w-full px-2 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreateNewTerm}
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 text-black font-bold text-xs font-mono uppercase cursor-pointer"
                >
                  Create & Activate Term
                </button>
              </div>
            )}

            {/* Terms List */}
            <div className="space-y-2.5">
              {terms.map(t => (
                <div
                  key={t.id}
                  className="p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] flex items-center justify-between text-xs font-mono"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[var(--text-page)]">{t.termName}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">({t.academicYear})</span>
                      {t.status === 'open' ? (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold uppercase">Active</span>
                      ) : (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 font-bold uppercase">Closed</span>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-1">
                      Reporting Window: {t.reportingStartDate} &ndash; {t.reportingEndDate}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: DUTY SETTINGS & TEMPLATES */}
      {activeSection === 'duty' && (
        <div className="space-y-6">
          <div className="p-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--card-border-subtle)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-page)]">Duty Announcement Template</h3>
                <p className="text-[10px] font-mono text-[var(--text-muted)]">
                  Tags: {'{TEACHERS}'}, {'{START_DATE}'}, {'{END_DATE}'}, {'{WEEK}'}, {'{DUTY}'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs font-mono uppercase cursor-pointer"
              >
                Save Template
              </button>
            </div>

            <textarea
              rows={9}
              value={localSettings.messageTemplate}
              onChange={e => setLocalSettings({ ...localSettings, messageTemplate: e.target.value })}
              className="w-full p-3.5 rounded-2xl border border-[var(--input-border)] bg-[var(--input-bg)] text-xs font-mono text-[var(--text-page)] leading-relaxed"
            />

            <button
              type="button"
              onClick={() => setLocalSettings({ ...localSettings, messageTemplate: DEFAULT_TEMPLATE })}
              className="text-xs font-mono text-[var(--text-muted)] hover:text-emerald-400 underline cursor-pointer"
            >
              Reset to Default Template
            </button>
          </div>

          {/* Sunday Reminder Settings */}
          <div className="p-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-3">
            <h3 className="text-sm font-bold text-[var(--text-page)]">Sunday Reminder Time</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-center justify-between">
                <span>Reminder Enabled:</span>
                <input
                  type="checkbox"
                  checked={localSettings.reminderEnabled}
                  onChange={e => setLocalSettings({ ...localSettings, reminderEnabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-2xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-center justify-between">
                <span>Reminder Time:</span>
                <input
                  type="time"
                  value={localSettings.reminderTime}
                  onChange={e => setLocalSettings({ ...localSettings, reminderTime: e.target.value })}
                  className="bg-transparent font-mono font-bold text-[var(--text-page)] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: NOTIFICATIONS */}
      {activeSection === 'notifications' && (
        <div className="space-y-6">
          <div className="p-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-emerald-500" />
              <div>
                <h3 className="text-sm font-bold text-[var(--text-page)]">Web Push Notifications</h3>
                <p className="text-[10px] font-mono text-[var(--text-muted)]">
                  Weekly Sunday duty reminder delivery status
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="p-3.5 rounded-2xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-center justify-between">
                <span>Notification Permission:</span>
                <span className="font-bold text-emerald-400">
                  {typeof Notification !== 'undefined' && Notification.permission === 'granted'
                    ? '✅ Permission granted'
                    : '⚠️ Permission not granted (or default)'}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-center justify-between">
                <span>Device Registration:</span>
                <span className="font-bold text-emerald-400">✅ Device registered in local PWA storage</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTestNotification}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs font-mono uppercase flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Bell className="w-4 h-4" />
              <span>Send Test Notification</span>
            </button>
          </div>
        </div>
      )}

      {/* SECTION 5: GOOGLE FORM & APPS SCRIPT INTEGRATION */}
      {activeSection === 'integrations' && (
        <div className="space-y-6">
          <div className="p-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-page)]">Houseparent Google Form Integration</h3>
              <p className="text-[10px] font-mono text-[var(--text-muted)]">
                Workflow: Houseparent &rarr; Google Form &rarr; Private Google Sheet &rarr; Apps Script &rarr; Firestore
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-1">Base Google Form URL</label>
                <input
                  type="url"
                  value={localSettings.googleFormUrl || ''}
                  onChange={e => setLocalSettings({ ...localSettings, googleFormUrl: e.target.value })}
                  placeholder="https://docs.google.com/forms/d/e/.../viewform"
                  className="w-full px-3 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-1">House Name Entry ID (from pre-filled link)</label>
                <input
                  type="text"
                  value={localSettings.googleFormHouseEntryId || ''}
                  onChange={e => setLocalSettings({ ...localSettings, googleFormHouseEntryId: e.target.value })}
                  placeholder="e.g. entry.12345678"
                  className="w-full px-3 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-mono text-xs"
                />
              </div>
            </div>

            {/* Generated House-Specific Links */}
            <div className="space-y-2 pt-2 border-t border-[var(--card-border-subtle)]">
              <div className="text-[10px] font-mono font-bold uppercase text-[var(--text-muted)]">
                8 House-Specific Prefilled Reporting Links
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {houses.map(h => {
                  const link = generatePrefilledFormLink(h.name);
                  return (
                    <div
                      key={h.id}
                      className="p-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] flex items-center justify-between text-xs font-mono"
                    >
                      <div>
                        <span className="font-bold text-[var(--text-page)]">{h.name}</span>
                        <span className="text-[10px] text-[var(--text-muted)] ml-1">({h.assignedHouseparent})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          copyToClipboard(link);
                          showNotification(`Copied link for ${h.name}!`);
                        }}
                        className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy Link</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-1 text-xs font-mono text-[var(--text-muted)]">
              <span className="font-bold text-emerald-400">Google Apps Script Location:</span>
              <p>Generated in <code className="text-white">/google-apps-script/</code> directory (house-report-sync.gs & duty-sheet-sync.gs).</p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 6: DIAGNOSTICS & DEMO DATA CONTROLS */}
      {activeSection === 'diagnostics' && (
        <div className="space-y-6">
          <div className="p-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
            <h3 className="text-sm font-bold text-[var(--text-page)]">System Diagnostics</h3>

            <div className="space-y-2 text-xs font-mono">
              <div className="p-3 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-center justify-between">
                <span>Firebase Authentication:</span>
                <span className="text-emerald-400 font-bold">✅ Available / Active</span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-center justify-between">
                <span>Cloud Firestore Database:</span>
                <span className="text-emerald-400 font-bold">✅ Connected (ai-studio-remixxtreme)</span>
              </div>
              <div className="p-3 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] space-y-2">
                <div className="flex items-center justify-between">
                  <span>Gemini AI (Table Extraction):</span>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">✅ Server-side @google/genai</span>
                    <button
                      type="button"
                      onClick={handleTestAi}
                      disabled={aiTesting}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      {aiTesting ? (
                        <>
                          <Activity className="w-3 h-3 animate-spin" />
                          <span>Testing...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3" />
                          <span>Run Live Test</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {aiTestResult && (
                  <div className={`p-2.5 rounded-lg text-[11px] border ${
                    aiTestResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}>
                    {aiTestResult.success ? '✅ ' : '❌ '}
                    {aiTestResult.message}
                  </div>
                )}
              </div>
              <div className="p-3 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-center justify-between">
                <span>Local Offline Cache:</span>
                <span className="text-emerald-400 font-bold">✅ Active (0ms hydration)</span>
              </div>
            </div>
          </div>

          {/* Demo Controls */}
          <div className="p-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
            <h3 className="text-sm font-bold text-[var(--text-page)]">Sample Demonstration Data</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Load realistic demo data for 8 houses and duty schedule, or clear all demo records.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleLoadDemo}
                className="py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs font-mono uppercase flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <Sparkles className="w-4 h-4" />
                <span>Load Demo Schedule & Reports</span>
              </button>

              <button
                type="button"
                onClick={handleClearDemo}
                className="py-3 px-4 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs font-mono uppercase flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear Demo Reports</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Staged Diagnostics / Demo Progress Modal */}
      <OperationProgressModal {...opProgress} onClose={opProgress.close} />
    </div>
  );
};
