import React, { useState } from 'react';
import {
  Users,
  Calendar,
  MessageSquare,
  CheckCircle2,
  Save,
  Plus,
  RotateCcw,
  Trash2,
  Check
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
  deleteTerm,
  DEFAULT_TEMPLATE
} from '../services/firebase';
import { DEFAULT_HOUSES } from '../services/sampleData';

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
  const [activeSection, setActiveSection] = useState<string>(initialSection === 'tally' ? 'general' : initialSection);
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

  // Term deletion state (no window.confirm, safe for iframes)
  const [termPendingDelete, setTermPendingDelete] = useState<string | null>(null);

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
      showNotification('8 Houses numbers saved.');
    } catch (err: any) {
      showErrorNotification('Failed to save houses: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Reset to default 8 houses (4 Boys, 4 Girls)
  const handleResetHouses = async () => {
    try {
      setSaving(true);
      await saveHouses(DEFAULT_HOUSES);
      setLocalHouses(DEFAULT_HOUSES);
      await onRefreshData();
      showNotification('Reset to standard 8 houses.');
    } catch (err: any) {
      showErrorNotification('Failed to reset houses: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // House field updater
  const updateHouseField = (id: string, field: keyof HouseConfig, value: any) => {
    setLocalHouses((prev: HouseConfig[]) =>
      prev.map((h: HouseConfig) => (h.id === id ? { ...h, [field]: value } : h))
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
        houseExpectedCounts: Object.fromEntries(localHouses.map((h: HouseConfig) => [h.id, h.expectedStudentCount])),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await saveTerm(newTerm);
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

  // Delete Academic Term directly without window.confirm
  const handleDeleteTerm = async (termId: string, termName: string) => {
    try {
      setSaving(true);
      await deleteTerm(termId);
      setTermPendingDelete(null);
      await onRefreshData();
      showNotification(`Deleted ${termName}.`);
    } catch (err: any) {
      showErrorNotification('Failed to delete term: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-28 text-left">
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
      <div className="pb-1">
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-page)]">
          Settings
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          House quotas, academic terms, and duty reminders
        </p>
      </div>

      {/* Section Navigation Tabs */}
      <div className="flex rounded-xl p-1 bg-[var(--nav-bg)] border border-[var(--card-border)] overflow-x-auto scrollbar-thin">
        {[
          { id: 'general', label: 'House Quotas', icon: Users },
          { id: 'terms', label: 'Academic Terms', icon: Calendar },
          { id: 'duty', label: 'Duty Message Template', icon: MessageSquare }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                isActive ? 'bg-emerald-500 text-black font-semibold' : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION 1: 8 HOUSES NUMBERS & QUOTAS */}
      {activeSection === 'general' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--card-border-subtle)] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-page)]">
                  8 Houses Setup
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Set student capacity numbers for 4 Boys houses and 4 Girls houses
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetHouses}
                  disabled={saving}
                  className="px-2.5 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:bg-[var(--card-bg)] text-[var(--text-page)] font-medium text-xs flex items-center gap-1 cursor-pointer transition-all"
                  title="Reset to 8 standard houses"
                >
                  <RotateCcw className="w-3 h-3 text-emerald-500" />
                  <span>Reset</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveHouses}
                  disabled={saving}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Quotas</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {localHouses.map((h: HouseConfig) => (
                <div
                  key={h.id}
                  className="p-3.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${h.category === 'Boys' ? 'text-blue-400' : 'text-pink-400'}`}>
                      {h.category} House ({h.id})
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">Target: {h.expectedStudentCount} students</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">House Name</label>
                      <input
                        type="text"
                        value={h.name}
                        onChange={e => updateHouseField(h.id, 'name', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-bold text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">Assigned Houseparent</label>
                      <input
                        type="text"
                        value={h.assignedHouseparent}
                        onChange={e => updateHouseField(h.id, 'assignedHouseparent', e.target.value)}
                        placeholder="Houseparent name"
                        className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">Expected Student Quota</label>
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

      {/* SECTION 2: ACADEMIC TERMS MANAGEMENT */}
      {activeSection === 'terms' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--card-border-subtle)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-page)]">Academic Terms</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Add new academic terms or delete completed ones
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowNewTermForm(!showNewTermForm)}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs flex items-center gap-1 cursor-pointer transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showNewTermForm ? 'Cancel' : 'New Term'}</span>
              </button>
            </div>

            {/* New Term Setup Form */}
            {showNewTermForm && (
              <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
                <div className="text-xs font-bold text-emerald-400">Add Academic Term</div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] text-[var(--text-muted)] block mb-1">Academic Year</label>
                    <input
                      type="text"
                      value={newTermYear}
                      onChange={e => setNewTermYear(e.target.value)}
                      placeholder="e.g. 2026/2027"
                      className="w-full px-3 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[var(--text-muted)] block mb-1">Term Name</label>
                    <input
                      type="text"
                      value={newTermName}
                      onChange={e => setNewTermName(e.target.value)}
                      placeholder="e.g. Term 2"
                      className="w-full px-3 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-[var(--text-muted)] block mb-1">Opening Date</label>
                    <input
                      type="date"
                      value={newTermOpeningDate}
                      onChange={e => setNewTermOpeningDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] block mb-1">Reporting Start</label>
                      <input
                        type="date"
                        value={newTermStartDate}
                        onChange={e => setNewTermStartDate(e.target.value)}
                        className="w-full px-2 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] block mb-1">Reporting End</label>
                      <input
                        type="date"
                        value={newTermEndDate}
                        onChange={e => setNewTermEndDate(e.target.value)}
                        className="w-full px-2 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreateNewTerm}
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs cursor-pointer transition-all"
                >
                  Create &amp; Activate Term
                </button>
              </div>
            )}

            {/* Terms List */}
            <div className="space-y-2.5">
              {terms.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-[var(--card-border)] text-center text-xs text-[var(--text-muted)]">
                  No academic terms configured. Click &quot;New Term&quot; to add one.
                </div>
              ) : (
                terms.map(t => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-page)] text-sm">{t.termName}</span>
                        <span className="text-[11px] text-[var(--text-muted)]">({t.academicYear})</span>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold uppercase">
                          Active
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-1">
                        Reporting Window: {t.reportingStartDate} &ndash; {t.reportingEndDate}
                      </div>
                    </div>

                    {/* Inline Delete Button - Guaranteed Working Without window.confirm */}
                    <div>
                      {termPendingDelete === t.id ? (
                        <div className="flex items-center gap-1.5 animate-in fade-in">
                          <button
                            type="button"
                            onClick={() => handleDeleteTerm(t.id, t.termName)}
                            disabled={saving}
                            className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer shadow-xs transition-colors"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setTermPendingDelete(null)}
                            className="px-2.5 py-1.5 rounded-xl border border-[var(--card-border)] text-xs text-[var(--text-muted)] hover:text-[var(--text-page)] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setTermPendingDelete(t.id)}
                          disabled={saving}
                          className="px-3 py-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 cursor-pointer transition-all flex items-center gap-1.5 shrink-0"
                          title="Delete Academic Term"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: DUTY SETTINGS & TEMPLATES */}
      {activeSection === 'duty' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--card-border-subtle)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-page)]">Duty Reminder Template</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  WhatsApp template tags: {'{TEACHERS}'}, {'{START_DATE}'}, {'{END_DATE}'}, {'{WEEK}'}, {'{DUTY}'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs cursor-pointer transition-all shadow-xs"
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
              className="text-xs text-[var(--text-muted)] hover:text-emerald-400 underline cursor-pointer"
            >
              Reset to Default Template
            </button>
          </div>

          {/* Sunday Reminder Settings */}
          <div className="p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-3">
            <h3 className="text-sm font-bold text-[var(--text-page)]">Weekly Sunday Reminder</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-center justify-between">
                <span>Reminder Alert:</span>
                <input
                  type="checkbox"
                  checked={localSettings.reminderEnabled}
                  onChange={e => setLocalSettings({ ...localSettings, reminderEnabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-center justify-between">
                <span>Alert Time:</span>
                <input
                  type="time"
                  value={localSettings.reminderTime}
                  onChange={e => setLocalSettings({ ...localSettings, reminderTime: e.target.value })}
                  className="bg-transparent font-bold text-[var(--text-page)] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
