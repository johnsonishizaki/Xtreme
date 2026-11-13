import React, { useState } from 'react';
import {
  Users,
  Calendar,
  MessageSquare,
  CheckCircle2,
  Save,
  Plus,
  RotateCcw,
  Trash2
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
  initialSection = 'terms'
}) => {
  const [activeSection, setActiveSection] = useState<string>(
    initialSection === 'tally' || initialSection === 'general' ? 'terms' : initialSection
  );
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [localHouses, setLocalHouses] = useState<HouseConfig[]>(houses);
  const [localTerms, setLocalTerms] = useState<AcademicTerm[]>(terms);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    setLocalTerms(terms);
  }, [terms]);

  const [showNewTermForm, setShowNewTermForm] = useState(false);
  const [newTermYear, setNewTermYear] = useState('2026/2027');
  const [newTermName, setNewTermName] = useState('Term 2');
  const [newTermOpeningDate, setNewTermOpeningDate] = useState('2027-01-10');
  const [newTermStartDate, setNewTermStartDate] = useState('2027-01-10');
  const [newTermEndDate, setNewTermEndDate] = useState('2027-01-15');

  const [termPendingDelete, setTermPendingDelete] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 2500);
  };

  const showErrorNotification = (msg: string) => {
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 3500);
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      await saveSettings(localSettings);
      await onRefreshData();
      showNotification('Template & alerts saved.');
    } catch (err: any) {
      showErrorNotification(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHouses = async () => {
    try {
      setSaving(true);
      await saveHouses(localHouses);
      await onRefreshData();
      showNotification('House quotas saved.');
    } catch (err: any) {
      showErrorNotification(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetHouses = async () => {
    try {
      setSaving(true);
      await saveHouses(DEFAULT_HOUSES);
      setLocalHouses(DEFAULT_HOUSES);
      await onRefreshData();
      showNotification('Reset to default 8 houses.');
    } catch (err: any) {
      showErrorNotification(err.message);
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

      setLocalTerms(prev => [newTerm, ...prev]);
      await saveTerm(newTerm);
      const updatedSettings = { ...localSettings, activeTermId: newTerm.id };
      setLocalSettings(updatedSettings);
      await saveSettings(updatedSettings);
      await onRefreshData();
      setShowNewTermForm(false);
      showNotification(`${newTerm.termName} activated.`);
    } catch (err: any) {
      showErrorNotification(err.message);
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
      showErrorNotification(err.message);
      await onRefreshData();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 space-y-5 pb-16 text-left">
      {successToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs shadow-xl flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successToast}</span>
        </div>
      )}

      {errorToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-rose-500 text-white font-bold text-xs shadow-xl">
          {errorToast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg font-extrabold tracking-tight text-[var(--text-page)]">
          Terms &amp; Quotas
        </h1>

        <div className="flex rounded-xl p-1 bg-[var(--nav-bg)] border border-[var(--card-border)] gap-1 self-start sm:self-auto">
          {[
            { id: 'terms', label: 'Terms', icon: Calendar },
            { id: 'general', label: 'Quotas', icon: Users },
            { id: 'duty', label: 'Template', icon: MessageSquare }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors ${
                  activeSection === tab.id ? 'bg-emerald-500 text-black' : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 1: ACADEMIC TERMS (flat list with hairline dividers) */}
      {activeSection === 'terms' && (
        <div className="p-4 sm:p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[var(--text-page)]">Academic Terms</h2>
            <button
              type="button"
              onClick={() => setShowNewTermForm(!showNewTermForm)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showNewTermForm ? 'Cancel' : 'New Term'}</span>
            </button>
          </div>

          {showNewTermForm && (
            <div className="p-4 rounded-xl border border-emerald-500/35 bg-emerald-500/5 space-y-3">
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
                  <label className="text-[11px] text-[var(--text-muted)] block mb-1">Term Name</label>
                  <input
                    type="text"
                    value={newTermName}
                    onChange={e => setNewTermName(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--text-muted)] block mb-1">Opening Date</label>
                  <input
                    type="date"
                    value={newTermOpeningDate}
                    onChange={e => setNewTermOpeningDate(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">Start</label>
                    <input
                      type="date"
                      value={newTermStartDate}
                      onChange={e => setNewTermStartDate(e.target.value)}
                      className="w-full min-h-[38px] px-2 py-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">End</label>
                    <input
                      type="date"
                      value={newTermEndDate}
                      onChange={e => setNewTermEndDate(e.target.value)}
                      className="w-full min-h-[38px] px-2 py-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs font-mono"
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
                Save Term
              </button>
            </div>
          )}

          <div className="divide-y divide-[var(--card-border-subtle)]">
            {localTerms.length === 0 ? (
              <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                No academic terms configured.
              </div>
            ) : (
              localTerms.map(t => (
                <div key={t.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--text-page)] text-sm">{t.termName}</span>
                      <span className="text-[var(--text-muted)] font-mono tabular-nums">({t.academicYear})</span>
                      <span className="text-[10px] font-bold uppercase text-emerald-500">Active</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5 font-mono tabular-nums">
                      {t.reportingStartDate} – {t.reportingEndDate}
                    </div>
                  </div>

                  <div>
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
              ))
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: 8 HOUSES QUOTAS (clean flat rows without nested card bloat) */}
      {activeSection === 'general' && (
        <div className="p-4 sm:p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-[var(--text-page)]">8 Houses Student Quotas</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetHouses}
                disabled={saving}
                className="min-h-[36px] px-3 py-1 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-[var(--text-page)] font-semibold text-xs flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-emerald-500" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={handleSaveHouses}
                disabled={saving}
                className="min-h-[36px] px-3.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Quotas</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-[var(--card-border-subtle)]">
            {localHouses.map((h: HouseConfig) => (
              <div key={h.id} className="py-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center text-xs">
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    value={h.name}
                    onChange={e => updateHouseField(h.id, 'name', e.target.value)}
                    aria-label="House Name"
                    className="w-full min-h-[36px] px-2.5 py-1 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-bold text-xs"
                  />
                </div>
                <div className="sm:col-span-5">
                  <input
                    type="text"
                    value={h.assignedHouseparent}
                    onChange={e => updateHouseField(h.id, 'assignedHouseparent', e.target.value)}
                    placeholder="Houseparent name"
                    aria-label="Houseparent"
                    className="w-full min-h-[36px] px-2.5 py-1 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] text-xs"
                  />
                </div>
                <div className="sm:col-span-3 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={h.expectedStudentCount}
                    onChange={e => updateHouseField(h.id, 'expectedStudentCount', Number(e.target.value))}
                    aria-label="Expected Quota"
                    className="w-full min-h-[36px] px-2.5 py-1 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] font-bold text-xs font-mono tabular-nums"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 3: DUTY MESSAGE TEMPLATE */}
      {activeSection === 'duty' && (
        <div className="p-4 sm:p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-page)]">WhatsApp Duty Template</h2>
              <p className="text-[11px] text-[var(--text-muted)] font-mono">
                {'{TEACHERS}'}, {'{START_DATE}'}, {'{END_DATE}'}, {'{WEEK}'}, {'{DUTY}'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveSettings}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs cursor-pointer shrink-0"
            >
              Save
            </button>
          </div>

          <textarea
            rows={8}
            value={localSettings.messageTemplate}
            onChange={e => setLocalSettings({ ...localSettings, messageTemplate: e.target.value })}
            className="w-full p-3 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-xs font-mono text-[var(--text-page)] leading-relaxed"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.reminderEnabled}
                  onChange={e => setLocalSettings({ ...localSettings, reminderEnabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
                <span className="font-medium text-[var(--text-page)]">Sunday alert</span>
              </label>

              <input
                type="time"
                value={localSettings.reminderTime}
                onChange={e => setLocalSettings({ ...localSettings, reminderTime: e.target.value })}
                className="px-2 py-1 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] font-mono tabular-nums text-[var(--text-page)]"
              />
            </div>

            <button
              type="button"
              onClick={() => setLocalSettings({ ...localSettings, messageTemplate: DEFAULT_TEMPLATE })}
              className="text-xs text-[var(--text-muted)] hover:text-emerald-500 underline cursor-pointer"
            >
              Reset Default
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
