import React, { useState, useEffect } from 'react';
import {
  Users,
  Calendar,
  Bell,
  CheckCircle2,
  Save,
  Plus,
  RotateCcw,
  Trash2,
  Sparkles,
  Phone,
  Download,
  Volume2,
  Mic,
  CalendarPlus,
  Send
} from 'lucide-react';
import {
  HouseConfig,
  AcademicTerm,
  AppSettings,
  AiPersonaPreset,
  HouseDailyReport,
  Roster,
  DutyAssignment,
  SendHistory
} from '../types';
import {
  saveSettings,
  saveHouses,
  saveTerm,
  deleteTerm,
  DEFAULT_TEMPLATE,
  getCachedHouseReports,
  getCachedRosters,
  getCachedDutyAssignments,
  getCachedSendHistory
} from '../services/firebase';
import { DEFAULT_HOUSES, DEFAULT_TERM } from '../services/sampleData';
import { exportAggregatedOperationalData } from '../services/exportService';
import { getLocalTodayIso } from '../services/messageGenerator';
import {
  playUrgentAlarmChime,
  speakUrgentDutyAlert,
  testUrgentNotification,
  downloadDutyCalendarAlarm,
  getNextReminderDate,
  formatCountdownToReminder,
  type DutyIcsEventInput
} from '../services/notificationService';
import { DateField, TimeField } from './DateField';

interface SettingsTabProps {
  settings: AppSettings;
  houses: HouseConfig[];
  terms: AcademicTerm[];
  reports?: HouseDailyReport[];
  rosters?: Roster[];
  assignments?: DutyAssignment[];
  sendHistory?: SendHistory[];
  selectedDate?: string;
  onRefreshData: () => Promise<void>;
  initialSection?: string;
}

const PERSONA_OPTIONS: Array<{
  id: AiPersonaPreset;
  title: string;
  tagline: string;
  desc: string;
}> = [
  {
    id: 'concise',
    title: 'Concise Executive',
    tagline: 'Short & metric-first',
    desc: 'Crisp bold totals, compact house bullets, and immediate actionable commands.'
  },
  {
    id: 'supportive',
    title: 'Supportive',
    tagline: 'Warm & encouraging',
    desc: 'Collaborative tone celebrating completed houses while gently flagging missing reports.'
  },
  {
    id: 'detailed',
    title: 'Detailed Analysis',
    tagline: 'Comprehensive review',
    desc: 'Full Boys vs Girls cohort breakdown, house variance, follow-up notes, and guidance.'
  }
];

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  houses,
  terms,
  reports,
  rosters,
  assignments,
  sendHistory,
  selectedDate,
  onRefreshData,
  initialSection = 'terms'
}) => {
  const normalizeSection = (sec: string) =>
    sec === 'tally' ? 'general' : sec || 'terms';

  const [activeSection, setActiveSection] = useState<string>(normalizeSection(initialSection));
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [localHouses, setLocalHouses] = useState<HouseConfig[]>(houses);
  const [localTerms, setLocalTerms] = useState<AcademicTerm[]>(terms);
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Sync local state when parent props update (e.g., AI updated a house, persona, or switched section)
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    setLocalHouses(houses);
  }, [houses]);

  useEffect(() => {
    setLocalTerms(terms);
  }, [terms]);

  useEffect(() => {
    if (initialSection) {
      setActiveSection(normalizeSection(initialSection));
    }
  }, [initialSection]);

  const [showNewTermForm, setShowNewTermForm] = useState(false);
  const [newTermYear, setNewTermYear] = useState('2026/2027');
  const [newTermType, setNewTermType] = useState<'term' | 'midterm'>('term');
  const [newTermName, setNewTermName] = useState('Term 2');
  const [newTermOpeningDate, setNewTermOpeningDate] = useState('2027-01-10');
  const [newTermStartDate, setNewTermStartDate] = useState('2027-01-10');
  const [newTermEndDate, setNewTermEndDate] = useState('2027-01-15');
  const [termFilter, setTermFilter] = useState<'all' | 'term' | 'midterm'>('all');

  const [termPendingDelete, setTermPendingDelete] = useState<string | null>(null);

  const activeTermId =
    localSettings.activeTermId ||
    localTerms.find(t => t.status === 'open')?.id ||
    localTerms[0]?.id;

  const showNotification = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 2500);
  };

  const showErrorNotification = (msg: string) => {
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 3500);
  };

  const handleSaveSettings = async (override?: AppSettings, customMessage?: string) => {
    const base = override || localSettings;
    const next: AppSettings = {
      ...base,
      autoAnnounceEnabled: false,
      autoCopyOnSchedule: false
    };
    try {
      setSaving(true);
      await saveSettings(next);
      await onRefreshData();
      showNotification(customMessage || 'Settings saved.');
    } catch (err: any) {
      showErrorNotification(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectPersona = async (personaId: AiPersonaPreset) => {
    const updated: AppSettings = { ...localSettings, aiPersona: personaId };
    setLocalSettings(updated);
    await handleSaveSettings(
      updated,
      `Chat persona set to ${PERSONA_OPTIONS.find(p => p.id === personaId)?.title || personaId}.`
    );
  };

  const handleSaveHouses = async () => {
    try {
      setSaving(true);
      const sanitized = localHouses.map(h => ({
        ...h,
        name: h.name.trim() || h.name,
        assignedHouseparent: h.assignedHouseparent.trim(),
        houseparentPhone: (h.houseparentPhone || '').trim(),
        expectedStudentCount: Math.max(1, Number(h.expectedStudentCount) || 1),
        updatedAt: new Date().toISOString()
      }));
      setLocalHouses(sanitized);
      await saveHouses(sanitized);
      // Mirror updates via server endpoint for instant backend synchronization
      await Promise.all(
        sanitized.map(h =>
          fetch('/api/houses/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(h)
          }).catch(() => {})
        )
      );
      await onRefreshData();
      showNotification('Houses & quotas saved.');
    } catch (err: any) {
      showErrorNotification(err.message || 'Failed to save houses.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetHouses = async () => {
    try {
      setSaving(true);
      await saveHouses(DEFAULT_HOUSES);
      setLocalHouses(DEFAULT_HOUSES);
      await Promise.all(
        DEFAULT_HOUSES.map(h =>
          fetch('/api/houses/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(h)
          }).catch(() => {})
        )
      );
      await onRefreshData();
      showNotification('Reset to default 8 houses.');
    } catch (err: any) {
      showErrorNotification(err.message || 'Failed to reset houses.');
    } finally {
      setSaving(false);
    }
  };

  const updateHouseField = (id: string, field: keyof HouseConfig, value: any) => {
    setLocalHouses((prev: HouseConfig[]) =>
      prev.map((h: HouseConfig) => (h.id === id ? { ...h, [field]: value } : h))
    );
  };

  const handleCreateNewTerm = async () => {
    try {
      setSaving(true);
      const resolvedName = newTermName.trim() || (newTermType === 'midterm' ? 'Mid-Term 1' : 'New Term');
      const newTerm: AcademicTerm = {
        id: `${newTermType === 'midterm' ? 'midterm' : 'term'}-${Date.now()}`,
        academicYear: newTermYear.trim() || '2026/2027',
        termName: resolvedName,
        termType: newTermType,
        openingDate: newTermOpeningDate,
        reportingStartDate: newTermStartDate,
        reportingEndDate: newTermEndDate,
        status: 'open',
        houseExpectedCounts: Object.fromEntries(localHouses.map((h: HouseConfig) => [h.id, h.expectedStudentCount])),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      setLocalTerms(prev => [newTerm, ...prev]);
      await saveTerm(newTerm);
      const updatedSettings = { ...localSettings, activeTermId: newTerm.id };
      setLocalSettings(updatedSettings);
      await saveSettings(updatedSettings);
      await onRefreshData();
      setShowNewTermForm(false);
      showNotification(`${newTerm.termName} activated.`);
    } catch (err: any) {
      showErrorNotification(err.message || 'Failed to create term.');
    } finally {
      setSaving(false);
    }
  };

  const handleActivateTerm = async (term: AcademicTerm) => {
    try {
      setSaving(true);
      const updatedTerm: AcademicTerm = { ...term, status: 'open', updatedAt: new Date().toISOString() };
      await saveTerm(updatedTerm);
      const updatedSettings = { ...localSettings, activeTermId: term.id };
      setLocalSettings(updatedSettings);
      await saveSettings(updatedSettings);
      await onRefreshData();
      showNotification(`${term.termName} is now active.`);
    } catch (err: any) {
      showErrorNotification(err.message || 'Failed to activate term.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTerm = async (termId: string, termName: string) => {
    try {
      setLocalTerms(prev => prev.filter(t => t.id !== termId));
      setTermPendingDelete(null);
      await deleteTerm(termId);
      await onRefreshData();
      showNotification(`Deleted ${termName}.`);
    } catch (err: any) {
      showErrorNotification(err.message || 'Failed to delete term.');
      await onRefreshData();
    }
  };

  const handleExportOperationalData = () => {
    try {
      const currentTerm =
        localTerms.find(t => t.id === activeTermId) ||
        localTerms.find(t => t.status === 'open') ||
        localTerms[0] ||
        DEFAULT_TERM;
      const { filename } = exportAggregatedOperationalData(
        {
          houses: localHouses,
          reports: reports && reports.length > 0 ? reports : getCachedHouseReports(),
          activeTerm: currentTerm,
          selectedDate,
          rosters: rosters && rosters.length > 0 ? rosters : getCachedRosters(),
          assignments: assignments && assignments.length > 0 ? assignments : getCachedDutyAssignments(),
          sendHistory: sendHistory && sendHistory.length > 0 ? sendHistory : getCachedSendHistory()
        },
        exportFormat
      );
      showNotification(`Exported ${filename}`);
    } catch (err: any) {
      showErrorNotification(err?.message || 'Failed to export operational data.');
    }
  };

  const totalQuotaSum = localHouses.reduce((sum, h) => sum + (Number(h.expectedStudentCount) || 0), 0);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 space-y-5 pb-20 text-left">
      {successToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs shadow-xl flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {errorToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-rose-500 text-white font-bold text-xs shadow-xl">
          {errorToast}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-extrabold tracking-tight text-[var(--text-page)]">
            Terms, Quotas &amp; AI
          </h1>

          <div className="flex items-center gap-2 shrink-0">
            <select
              aria-label="Export format"
              value={exportFormat}
              onChange={e => setExportFormat(e.target.value as 'xlsx' | 'csv')}
              className="min-h-[36px] px-2.5 py-1 rounded-xl border border-[var(--input-border)] bg-[var(--card-bg)] text-xs font-semibold text-[var(--text-page)] cursor-pointer"
            >
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="csv">CSV (.csv)</option>
            </select>

            <button
              type="button"
              onClick={handleExportOperationalData}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-emerald-500/45 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Export Data</span>
            </button>
          </div>
        </div>

        <div className="flex rounded-xl p-1 bg-[var(--nav-bg)] border border-[var(--card-border)] gap-1 self-start overflow-x-auto max-w-full">
          {[
            { id: 'terms', label: 'Terms', icon: Calendar },
            { id: 'general', label: 'Quotas', icon: Users },
            { id: 'duty', label: 'Reminders', icon: Bell },
            { id: 'ai', label: 'AI Persona', icon: Sparkles }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  activeSection === tab.id ? 'bg-emerald-500 text-black' : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: AI CHAT PERSONA PRESETS */}
      {activeSection === 'ai' && (
        <div className="p-4 sm:p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-page)]">Chat Persona Presets</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Switches how Xtreme AI structures summaries, charts, and WhatsApp drafts.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSaveSettings(localSettings, 'AI persona preset saved.')}
              disabled={saving}
              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Persona'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {PERSONA_OPTIONS.map(persona => {
              const isSelected = (localSettings.aiPersona || 'concise') === persona.id;
              return (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => handleSelectPersona(persona.id)}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:border-emerald-500/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-xs font-extrabold ${isSelected ? 'text-emerald-500' : 'text-[var(--text-page)]'}`}>
                        {persona.title}
                      </span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                    </div>
                    <div className="text-[10px] font-mono text-[var(--text-subtle)] mb-2">
                      {persona.tagline}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      {persona.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 1: ACADEMIC TERMS & MID-TERMS */}
      {activeSection === 'terms' && (
        <div className="p-4 sm:p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-page)]">Academic Terms &amp; Mid-Terms</h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Switch between full terms and mid-term return windows.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setNewTermType('midterm');
                  setNewTermName('Mid-Term 1');
                  setShowNewTermForm(true);
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Mid-Term</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!showNewTermForm) {
                    setNewTermType('term');
                    setNewTermName('Term 2');
                  }
                  setShowNewTermForm(!showNewTermForm);
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showNewTermForm ? 'Cancel' : 'New Term'}</span>
              </button>
            </div>
          </div>

          {localTerms.length > 1 && (
            <div className="flex items-center gap-1 p-1 rounded-xl border border-[var(--card-border)] bg-[var(--nav-bg)] self-start w-fit">
              {(
                [
                  { id: 'all', label: 'All Periods' },
                  { id: 'term', label: 'Terms' },
                  { id: 'midterm', label: 'Mid-Terms' }
                ] as const
              ).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTermFilter(f.id)}
                  className={`min-h-[30px] px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                    termFilter === f.id
                      ? 'bg-emerald-500 text-black'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {showNewTermForm && (
            <div className="p-4 rounded-xl border border-emerald-500/35 bg-emerald-500/5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 p-1 rounded-xl border border-[var(--card-border)] bg-[var(--nav-bg)]">
                  <button
                    type="button"
                    onClick={() => {
                      setNewTermType('term');
                      if (newTermName.toLowerCase().includes('mid')) setNewTermName('Term 2');
                    }}
                    className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
                      newTermType === 'term'
                        ? 'bg-emerald-500 text-black'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
                    }`}
                  >
                    Regular Term
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewTermType('midterm');
                      if (!newTermName.toLowerCase().includes('mid')) setNewTermName('Mid-Term 1');
                    }}
                    className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
                      newTermType === 'midterm'
                        ? 'bg-emerald-500 text-black'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
                    }`}
                  >
                    Mid-Term Break
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {['Term 1', 'Mid-Term 1', 'Term 2', 'Mid-Term 2', 'Term 3', 'Mid-Term 3'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setNewTermName(preset);
                        setNewTermType(preset.toLowerCase().includes('mid') ? 'midterm' : 'term');
                      }}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                        newTermName === preset
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
                          : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-page)]'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] text-[var(--text-muted)] block mb-1">Academic Year</label>
                  <input
                    type="text"
                    value={newTermYear}
                    onChange={e => setNewTermYear(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                    {newTermType === 'midterm' ? 'Mid-Term Name' : 'Term Name'}
                  </label>
                  <input
                    type="text"
                    value={newTermName}
                    onChange={e => setNewTermName(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                    {newTermType === 'midterm' ? 'Mid-Term Return Date' : 'Opening Date'}
                  </label>
                  <DateField
                    value={newTermOpeningDate}
                    onChange={setNewTermOpeningDate}
                    ariaLabel={newTermType === 'midterm' ? 'Mid-Term Return Date' : 'Opening Date'}
                    className="w-full"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">Start</label>
                    <DateField
                      value={newTermStartDate}
                      onChange={setNewTermStartDate}
                      ariaLabel="Reporting start date"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">End</label>
                    <DateField
                      value={newTermEndDate}
                      onChange={setNewTermEndDate}
                      ariaLabel="Reporting end date"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateNewTerm}
                disabled={saving}
                className="w-full min-h-[38px] py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs cursor-pointer"
              >
                Save &amp; Activate {newTermType === 'midterm' ? 'Mid-Term' : 'Term'}
              </button>
            </div>
          )}

          <div className="divide-y divide-[var(--card-border-subtle)]">
            {localTerms.filter(t => {
              const inferredType = t.termType || (t.termName.toLowerCase().includes('mid') ? 'midterm' : 'term');
              return termFilter === 'all' || inferredType === termFilter;
            }).length === 0 ? (
              <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                No {termFilter === 'midterm' ? 'mid-terms' : termFilter === 'term' ? 'terms' : 'academic periods'} configured.
              </div>
            ) : (
              localTerms
                .filter(t => {
                  const inferredType = t.termType || (t.termName.toLowerCase().includes('mid') ? 'midterm' : 'term');
                  return termFilter === 'all' || inferredType === termFilter;
                })
                .map(t => {
                  const isActive = activeTermId === t.id;
                  const isMidTerm = t.termType === 'midterm' || t.termName.toLowerCase().includes('mid');
                  return (
                    <div key={t.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[var(--text-page)] text-sm">{t.termName}</span>
                          <span className={`text-[11px] font-semibold ${isMidTerm ? 'text-amber-500' : 'text-[var(--text-muted)]'}`}>
                            {isMidTerm ? 'Mid-Term' : 'Term'}
                          </span>
                          <span className="text-[var(--text-subtle)]">·</span>
                          <span className="text-[var(--text-muted)] font-mono tabular-nums">{t.academicYear}</span>
                          {isActive && (
                            <>
                              <span className="text-[var(--text-subtle)]">·</span>
                              <span className="text-[11px] font-bold text-emerald-500">Active</span>
                            </>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5 font-mono tabular-nums">
                          {t.reportingStartDate} – {t.reportingEndDate}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => handleActivateTerm(t)}
                            disabled={saving}
                            className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:border-emerald-500 text-xs font-semibold text-emerald-500 cursor-pointer whitespace-nowrap"
                          >
                            Set Active
                          </button>
                        )}
                        {termPendingDelete === t.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDeleteTerm(t.id, t.termName)}
                              disabled={saving}
                              className="min-h-[34px] px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setTermPendingDelete(null)}
                              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--card-border)] text-xs text-[var(--text-muted)] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setTermPendingDelete(t.id)}
                            disabled={saving}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer flex items-center gap-1 font-semibold text-xs transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: HOUSES QUOTAS & HOUSEPARENTS */}
      {activeSection === 'general' && (
        <div className="p-4 sm:p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-page)]">
                {localHouses.length} Houses Student Quotas
              </h2>
              <p className="text-[11px] text-[var(--text-muted)] font-mono tabular-nums">
                Total School Quota: {totalQuotaSum}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetHouses}
                disabled={saving}
                className="min-h-[36px] px-3 py-1 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-[var(--text-page)] font-semibold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5 text-emerald-500" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={handleSaveHouses}
                disabled={saving}
                className="min-h-[36px] px-3.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Quotas</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-[var(--card-border-subtle)]">
            {localHouses.map((h: HouseConfig) => (
              <div key={h.id} className="py-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs">
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    value={h.name}
                    onChange={e => updateHouseField(h.id, 'name', e.target.value)}
                    aria-label="House Name"
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-bold text-xs"
                  />
                </div>
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    value={h.assignedHouseparent}
                    onChange={e => updateHouseField(h.id, 'assignedHouseparent', e.target.value)}
                    placeholder="Houseparent name"
                    aria-label="Houseparent"
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs"
                  />
                </div>
                <div className="sm:col-span-3 relative">
                  <Phone className="w-3 h-3 text-[var(--text-subtle)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="tel"
                    value={h.houseparentPhone || ''}
                    onChange={e => updateHouseField(h.id, 'houseparentPhone', e.target.value)}
                    placeholder="WhatsApp phone"
                    aria-label="Houseparent Phone"
                    className="w-full min-h-[38px] pl-7 pr-2.5 py-1 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs font-mono tabular-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="number"
                    min="1"
                    value={h.expectedStudentCount}
                    onChange={e => updateHouseField(h.id, 'expectedStudentCount', Math.max(1, Number(e.target.value) || 1))}
                    aria-label="Expected Quota"
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-bold text-xs font-mono tabular-nums"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 3: DUTY REMINDERS & MESSAGE TEMPLATE */}
      {activeSection === 'duty' && (() => {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const selectedDay = localSettings.reminderDay ?? 0;
        const selectedTime = localSettings.reminderTime || '08:00';
        const nextReminder = getNextReminderDate(selectedDay, selectedTime);
        const countdownLabel = formatCountdownToReminder(nextReminder);
        const sourceAssignments =
          assignments && assignments.length > 0 ? assignments : getCachedDutyAssignments();
        const todayIso = getLocalTodayIso();
        const upcomingCalendarEvents: DutyIcsEventInput[] = [...sourceAssignments]
          .filter(a => (a.endDate || a.startDate) >= todayIso)
          .sort((a, b) => a.startDate.localeCompare(b.startDate))
          .slice(0, 8)
          .map(a => ({
            id: a.id,
            weekLabel: a.weekLabel,
            startDate: a.startDate,
            endDate: a.endDate,
            teachersText: a.teachers.map(t => t.name).join(', ') || 'Teachers on Duty'
          }));

        return (
          <div className="space-y-4">
            {/* Reminder Scheduler Deck */}
            <div className="p-4 sm:p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[var(--text-page)]">
                      Weekly Duty Reminder Schedule
                    </h2>
                    <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
                      {localSettings.reminderEnabled
                        ? `Next alert: ${dayNames[selectedDay]} · ${selectedTime} (in ${countdownLabel})`
                        : 'Weekly duty reminders are currently paused'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setLocalSettings({
                        ...localSettings,
                        reminderEnabled: !localSettings.reminderEnabled
                      })
                    }
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                      localSettings.reminderEnabled
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-500'
                        : 'border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-[var(--text-muted)]'
                    }`}
                  >
                    {localSettings.reminderEnabled ? 'Reminders On' : 'Reminders Off'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveSettings(localSettings, 'Duty reminder schedule saved.')}
                    disabled={saving}
                    className="min-h-[36px] px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? 'Saving...' : 'Save'}</span>
                  </button>
                </div>
              </div>

              {/* 7-Day Selector */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                  Reminder Day
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {dayNames.map((day, idx) => {
                    const active = selectedDay === idx;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setLocalSettings({ ...localSettings, reminderDay: idx })}
                        className={`min-h-[38px] rounded-xl border text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
                          active
                            ? 'border-emerald-500 bg-emerald-500 text-black'
                            : 'border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-page)] hover:border-emerald-500/40'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Picker & Quick Time Presets */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] whitespace-nowrap">
                    Alert Time
                  </span>
                  <TimeField
                    value={selectedTime}
                    onChange={val => setLocalSettings({ ...localSettings, reminderTime: val })}
                    ariaLabel="Reminder alert time"
                    className="min-w-[130px]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {['07:00', '08:00', '12:00', '18:00', '20:00'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLocalSettings({ ...localSettings, reminderTime: preset })}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-[11px] font-mono tabular-nums font-bold cursor-pointer transition-colors whitespace-nowrap ${
                        selectedTime === preset
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
                          : 'border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-page)]'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alert Channels & Live Tests */}
              <div className="pt-3 border-t border-[var(--card-border-subtle)] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl border border-[var(--card-border-subtle)] bg-[var(--card-bg-elevated)] flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={localSettings.soundAlertEnabled !== false}
                      onChange={e =>
                        setLocalSettings({ ...localSettings, soundAlertEnabled: e.target.checked })
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer shrink-0"
                    />
                    <Volume2 className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="font-semibold text-[var(--text-page)] truncate">Audible Bell Chime</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => playUrgentAlarmChime(true)}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-amber-500 text-[11px] font-bold text-amber-500 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Test Chime
                  </button>
                </div>

                <div className="p-3 rounded-xl border border-[var(--card-border-subtle)] bg-[var(--card-bg-elevated)] flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={localSettings.voiceAlertEnabled !== false}
                      onChange={e =>
                        setLocalSettings({ ...localSettings, voiceAlertEnabled: e.target.checked })
                      }
                      className="w-4 h-4 accent-emerald-500 cursor-pointer shrink-0"
                    />
                    <Mic className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-semibold text-[var(--text-page)] truncate">Spoken Voice Alert</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      speakUrgentDutyAlert(
                        'Duty reminder test. Weekly teacher duty announcement is ready to review and send.'
                      )
                    }
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500 text-[11px] font-bold text-emerald-500 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Test Voice
                  </button>
                </div>
              </div>

              {/* Calendar Export & iPhone Push Test */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    const sent = await testUrgentNotification();
                    showNotification(
                      sent ? 'Test alert & chime triggered.' : 'Chime played. Allow notifications for lock-screen push.'
                    );
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Bell className="w-3.5 h-3.5 shrink-0" />
                  <span>Test Push &amp; Chime</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const first = upcomingCalendarEvents[0];
                    downloadDutyCalendarAlarm(
                      selectedDay,
                      selectedTime,
                      first?.weekLabel || 'Weekly Teacher Duty',
                      first?.teachersText || 'Teachers on Duty',
                      upcomingCalendarEvents
                    );
                    showNotification(
                      upcomingCalendarEvents.length > 0
                        ? `Calendar file opened with ${upcomingCalendarEvents.length} duty reminder${upcomingCalendarEvents.length === 1 ? '' : 's'}.`
                        : 'Recurring weekly Calendar reminder opened.'
                    );
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Add {upcomingCalendarEvents.length > 0 ? `${upcomingCalendarEvents.length} Weeks` : 'Weekly'} to Apple Calendar (.ics)
                  </span>
                </button>
              </div>

              <div className="p-3 rounded-xl border border-[var(--card-border-subtle)] bg-[var(--card-bg-elevated)] flex items-start gap-2.5 text-[11px] text-[var(--text-muted)]">
                <Send className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[var(--text-page)]">Manual send only:</strong> Alerts notify and open your formatted draft at the scheduled time—nothing is sent or copied automatically until you tap Send on WhatsApp.
                </span>
              </div>
            </div>

            {/* Template Editor Card */}
            <div className="p-4 sm:p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[var(--text-page)]">
                    WhatsApp Duty Announcement Template
                  </h2>
                  <p className="text-[11px] text-[var(--text-muted)] font-mono">
                    {'{WEEK}'}, {'{START_DATE}'}, {'{END_DATE}'}, {'{TEACHERS}'}, {'{DUTY}'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLocalSettings({ ...localSettings, messageTemplate: DEFAULT_TEMPLATE })}
                    className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-xs font-semibold text-[var(--text-muted)] hover:text-emerald-500 cursor-pointer whitespace-nowrap"
                  >
                    Reset OLAG Default
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveSettings(localSettings, 'Template & reminder settings saved.')}
                    disabled={saving}
                    className="min-h-[34px] px-3.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs cursor-pointer whitespace-nowrap"
                  >
                    {saving ? 'Saving...' : 'Save Template'}
                  </button>
                </div>
              </div>

              <textarea
                rows={12}
                value={localSettings.messageTemplate}
                onChange={e => setLocalSettings({ ...localSettings, messageTemplate: e.target.value })}
                className="w-full p-3 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-xs font-mono text-[var(--text-page)] leading-relaxed"
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
};
