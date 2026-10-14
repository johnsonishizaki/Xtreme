import React, { useState, useMemo, useRef } from 'react';
import {
  Calendar,
  Copy,
  CheckCircle2,
  Send,
  Sparkles,
  FileSpreadsheet,
  Upload,
  Search,
  X,
  FileText,
  AlertTriangle,
  Loader2,
  Trash2,
  Check,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  DutyAssignment,
  Roster,
  AppSettings,
  SendHistory,
  ParsedRosterPayload
} from '../types';
import {
  generateAnnouncementMessage,
  copyToClipboard,
  openWhatsApp,
  formatDutyDate
} from '../services/messageGenerator';
import {
  recordSendHistory,
  deleteRoster,
  setActiveRoster
} from '../services/firebase';
import { getDutyBadgeConfig } from '../services/dutyBadgeHelper';

interface DutyTabProps {
  rosters: Roster[];
  assignments: DutyAssignment[];
  settings: AppSettings;
  sendHistory: SendHistory[];
  onReviewParsedData: (data: ParsedRosterPayload) => void;
  onRefreshData: () => Promise<void>;
  onLoadSampleRoster: () => Promise<void>;
  onDeleteSampleRoster: () => Promise<void>;
  onDeleteRoster?: (rosterId: string) => Promise<void>;
}

export const DutyTab: React.FC<DutyTabProps> = ({
  rosters,
  assignments,
  settings,
  sendHistory,
  onReviewParsedData,
  onRefreshData,
  onLoadSampleRoster,
  onDeleteSampleRoster,
  onDeleteRoster
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [sentNotification, setSentNotification] = useState(false);
  const [showImportSection, setShowImportSection] = useState(false);

  // Roster Import states
  const [activeImportTab, setActiveImportTab] = useState<'file' | 'sheets' | 'paste'>('file');
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [pastedData, setPastedData] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStep, setImportStep] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [rosterPendingDelete, setRosterPendingDelete] = useState<Roster | null>(null);
  const [isDeletingRoster, setIsDeletingRoster] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeRoster = useMemo(() => {
    return rosters.find(r => r.isActive) || rosters[0] || null;
  }, [rosters]);

  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  // Filter assignments by active roster
  const activeAssignments = useMemo(() => {
    if (!activeRoster) return assignments;
    const rosterSpecific = assignments.filter(a => a.rosterId === activeRoster.id);
    return rosterSpecific.length > 0 ? rosterSpecific : assignments;
  }, [assignments, activeRoster]);

  const sortedAssignments = useMemo(() => {
    return [...activeAssignments].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [activeAssignments]);

  const currentWeekIdx = useMemo(() => {
    if (sortedAssignments.length === 0) return -1;
    const idx = sortedAssignments.findIndex(a => todayStr >= a.startDate && todayStr <= a.endDate);
    if (idx !== -1) return idx;
    const upcoming = sortedAssignments.findIndex(a => a.startDate > todayStr);
    if (upcoming !== -1) return upcoming;
    return 0;
  }, [sortedAssignments, todayStr]);

  const comingWeekIdx = useMemo(() => {
    if (currentWeekIdx === -1) return -1;
    if (currentWeekIdx + 1 < sortedAssignments.length) return currentWeekIdx + 1;
    return currentWeekIdx;
  }, [currentWeekIdx, sortedAssignments.length]);

  // Search filter
  const filteredAssignments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedAssignments;
    return sortedAssignments.filter(a => {
      const matchTeacher = a.teachers?.some(t =>
        t.name.toLowerCase().includes(q) || (t.role && t.role.toLowerCase().includes(q))
      );
      const matchTitle = a.dutyTitle && a.dutyTitle.toLowerCase().includes(q);
      const matchWeek = a.weekLabel && a.weekLabel.toLowerCase().includes(q);
      return matchTeacher || matchTitle || matchWeek;
    });
  }, [sortedAssignments, searchQuery]);

  // Current selected assignment
  const currentAssignment = useMemo(() => {
    if (filteredAssignments.length === 0) return null;
    if (selectedAssignmentId) {
      const match = filteredAssignments.find(a => a.id === selectedAssignmentId);
      if (match) return match;
    }
    // Default to coming week if today is Sunday, else current week
    const targetIdx = comingWeekIdx !== -1 ? comingWeekIdx : 0;
    return filteredAssignments[targetIdx] || filteredAssignments[0];
  }, [filteredAssignments, selectedAssignmentId, comingWeekIdx]);

  // Generated announcement message
  const generatedMessage = useMemo(() => {
    if (!currentAssignment) return '';
    return generateAnnouncementMessage(settings.messageTemplate, currentAssignment);
  }, [currentAssignment, settings.messageTemplate]);

  // Check if sent in history
  const isAlreadySent = useMemo(() => {
    if (!currentAssignment) return false;
    return sendHistory.some(h => h.assignmentId === currentAssignment.id && h.status === 'sent_confirmed');
  }, [currentAssignment, sendHistory]);

  const handleCopyMessage = async () => {
    if (!generatedMessage || !currentAssignment) return;
    const success = await copyToClipboard(generatedMessage);
    if (success) {
      setCopiedNotification(true);
      const item: SendHistory = {
        id: `copy-${Date.now()}`,
        assignmentId: currentAssignment.id,
        weekLabel: currentAssignment.weekLabel,
        dutyPeriod: `${formatDutyDate(currentAssignment.startDate)} - ${formatDutyDate(currentAssignment.endDate)}`,
        message: generatedMessage,
        timestamp: new Date().toISOString(),
        status: 'copied'
      };
      await recordSendHistory(item);
      await onRefreshData();
      setTimeout(() => setCopiedNotification(false), 3000);
    }
  };

  const handleOpenWhatsApp = () => {
    if (!generatedMessage) return;
    openWhatsApp(generatedMessage, settings.whatsAppBehavior || 'app');
  };

  const handleMarkAsSent = async () => {
    if (!currentAssignment || !generatedMessage) return;
    const item: SendHistory = {
      id: `sent-${Date.now()}`,
      assignmentId: currentAssignment.id,
      weekLabel: currentAssignment.weekLabel,
      dutyPeriod: `${formatDutyDate(currentAssignment.startDate)} - ${formatDutyDate(currentAssignment.endDate)}`,
      message: generatedMessage,
      timestamp: new Date().toISOString(),
      status: 'sent_confirmed'
    };
    await recordSendHistory(item);
    await onRefreshData();
    setSentNotification(true);
    setTimeout(() => setSentNotification(false), 3500);
  };

  // File selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      setImportError(null);
      setImportStep('Reading file contents...');

      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
        setImportStep('Parsing spreadsheet rows...');
        const buffer = await file.arrayBuffer();
        const { parseSpreadsheet } = await import('../services/rosterParser');
        const parsed = await parseSpreadsheet(buffer, file.name);
        onReviewParsedData(parsed);
      } else if (fileName.endsWith('.pdf')) {
        setImportStep('Reading PDF document pages...');
        const buffer = await file.arrayBuffer();
        const { parsePdfRoster } = await import('../services/pdfParser');
        const parsed = await parsePdfRoster(buffer, file.name);
        onReviewParsedData(parsed);
      } else {
        setImportStep('Analyzing table layout with AI...');
        const text = await file.text();
        const { parseRosterWithAI } = await import('../services/aiParserClient');
        const parsed = await parseRosterWithAI(text, file.name, 'csv');
        onReviewParsedData(parsed);
      }
    } catch (err: any) {
      setImportError(err.message || 'Could not parse this file. Please verify format.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGoogleSheetImport = async () => {
    if (!googleSheetUrl.trim()) return;
    try {
      setIsImporting(true);
      setImportError(null);
      setImportStep('Fetching Google Sheet...');
      const { importGoogleSheetFromUrl } = await import('../services/sheetsParser');
      const parsed = await importGoogleSheetFromUrl(googleSheetUrl);
      onReviewParsedData(parsed);
    } catch (err: any) {
      setImportError(err.message || 'Failed to import Google Sheet. Ensure it is accessible.');
    } finally {
      setIsImporting(false);
    }
  };

  const handlePastedDataImport = async () => {
    if (!pastedData.trim()) return;
    try {
      setIsImporting(true);
      setImportError(null);
      setImportStep('Parsing pasted text...');
      const { parsePastedSheetData } = await import('../services/sheetsParser');
      const parsed = await parsePastedSheetData(pastedData);
      onReviewParsedData(parsed);
    } catch (err: any) {
      setImportError(err.message || 'Failed to parse text.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!rosterPendingDelete) return;
    try {
      setIsDeletingRoster(true);
      if (onDeleteRoster) {
        await onDeleteRoster(rosterPendingDelete.id);
      } else {
        await deleteRoster(rosterPendingDelete.id);
        await onRefreshData();
      }
      setRosterPendingDelete(null);
    } catch (err: any) {
      setImportError(err.message || 'Failed to delete roster.');
    } finally {
      setIsDeletingRoster(false);
    }
  };

  const badgeConfig = currentAssignment ? getDutyBadgeConfig(currentAssignment.dutyTitle) : null;
  const DutyIcon = badgeConfig?.icon || ShieldCheck;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-28 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-500">
            Weekly Teacher Duty Module
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-page)]">
            Duty Reminder
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Roster analysis &bull; Sunday announcement &bull; WhatsApp manual dispatch
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowImportSection(!showImportSection)}
          className="px-3.5 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer text-[var(--text-page)] transition-all self-start sm:self-auto"
        >
          <Upload className="w-4 h-4 text-emerald-500" />
          <span>{showImportSection ? 'Hide Roster Manager' : 'Import / Manage Roster'}</span>
          {showImportSection ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ROSTER IMPORT & MANAGEMENT ACCORDION */}
      {showImportSection && (
        <div className="p-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-5 animate-in slide-in-from-top-3 duration-200">
          <div className="flex items-center justify-between border-b border-[var(--card-border-subtle)] pb-3">
            <h3 className="text-sm font-bold text-[var(--text-page)] flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span>Duty Roster Sources</span>
            </h3>
            <button
              type="button"
              onClick={onLoadSampleRoster}
              className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load Demo Schedule</span>
            </button>
          </div>

          {importError && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          {/* Import Tabs */}
          <div className="flex rounded-xl p-1 bg-[var(--nav-bg)] border border-[var(--card-border)]">
            <button
              type="button"
              onClick={() => setActiveImportTab('file')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                activeImportTab === 'file' ? 'bg-emerald-500 text-black' : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
              }`}
            >
              Excel / CSV / PDF
            </button>
            <button
              type="button"
              onClick={() => setActiveImportTab('sheets')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                activeImportTab === 'sheets' ? 'bg-emerald-500 text-black' : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
              }`}
            >
              Google Sheet Link
            </button>
            <button
              type="button"
              onClick={() => setActiveImportTab('paste')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                activeImportTab === 'paste' ? 'bg-emerald-500 text-black' : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
              }`}
            >
              Paste Rows
            </button>
          </div>

          {activeImportTab === 'file' && (
            <div className="text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="w-full border-2 border-dashed border-[var(--card-border)] hover:border-emerald-500 rounded-2xl p-6 transition-all text-center group cursor-pointer"
              >
                <Upload className="w-6 h-6 text-emerald-500 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-bold text-[var(--text-page)]">
                  {isImporting ? importStep : 'Choose Excel (.xlsx), CSV, or PDF'}
                </div>
                <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1">
                  Deterministic parsing first &bull; Gemini table AI fallback
                </p>
              </button>
            </div>
          )}

          {activeImportTab === 'sheets' && (
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Google Sheet Link</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={googleSheetUrl}
                  onChange={e => setGoogleSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-mono border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)]"
                />
                <button
                  type="button"
                  onClick={handleGoogleSheetImport}
                  disabled={isImporting || !googleSheetUrl.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs font-mono uppercase cursor-pointer"
                >
                  Import
                </button>
              </div>
            </div>
          )}

          {activeImportTab === 'paste' && (
            <div className="space-y-2">
              <textarea
                rows={4}
                value={pastedData}
                onChange={e => setPastedData(e.target.value)}
                placeholder="Paste copied cells from Google Sheets or Excel here..."
                className="w-full p-2.5 rounded-xl text-xs font-mono border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)]"
              />
              <button
                type="button"
                onClick={handlePastedDataImport}
                disabled={isImporting || !pastedData.trim()}
                className="w-full py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs font-mono uppercase cursor-pointer"
              >
                Parse Content
              </button>
            </div>
          )}

          {/* Active Rosters List */}
          <div className="space-y-2 pt-2 border-t border-[var(--card-border-subtle)]">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Loaded Rosters ({rosters.length})</div>
            {rosters.map((r, idx) => (
              <div
                key={`duty-roster-${r.id}-${idx}`}
                className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
                  r.isActive ? 'border-emerald-500/50 bg-[var(--card-bg-elevated)]' : 'border-[var(--card-border)] bg-[var(--card-bg)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${r.isActive ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="font-bold text-[var(--text-page)]">{r.name}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">({r.totalWeeks} weeks)</span>
                </div>
                <div className="flex items-center gap-2">
                  {!r.isActive && (
                    <button
                      type="button"
                      onClick={() => setActiveRoster(r.id).then(() => onRefreshData())}
                      className="text-[10px] text-emerald-400 hover:underline cursor-pointer"
                    >
                      Make Active
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRosterPendingDelete(r)}
                    className="p-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SEARCH BAR */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--text-subtle)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search teacher name or duty title..."
          className="w-full pl-10 pr-9 py-3 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] shadow-inner"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-3 text-[var(--text-subtle)] hover:text-[var(--text-page)]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* DUTY WEEK SELECTOR PILLS */}
      {filteredAssignments.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
            Duty Periods ({filteredAssignments.length})
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {filteredAssignments.map((a, idx) => {
              const isSelected = currentAssignment?.id === a.id;
              const isCurrent = currentWeekIdx !== -1 && sortedAssignments[currentWeekIdx]?.id === a.id;
              const isComing = comingWeekIdx !== -1 && sortedAssignments[comingWeekIdx]?.id === a.id && !isCurrent;

              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAssignmentId(a.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-mono shrink-0 transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-emerald-500 text-black font-extrabold border-emerald-500 shadow-lg shadow-emerald-500/20'
                      : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-page)] hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{a.weekLabel || `Week ${idx + 1}`}</span>
                    {isCurrent && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                        isSelected ? 'bg-black text-emerald-400' : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        Current
                      </span>
                    )}
                    {isComing && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                        isSelected ? 'bg-black text-amber-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        Next
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ACTIVE DUTY ANNOUNCEMENT CARD */}
      {currentAssignment ? (
        <div className="p-6 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--shadow-card)] space-y-5">
          {/* Duty Title & Badges */}
          <div className="flex items-start justify-between border-b border-[var(--card-border-subtle)] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold">
                <DutyIcon className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                  {currentAssignment.weekLabel}
                </div>
                <h2 className="text-xl font-black text-[var(--text-page)]">
                  {currentAssignment.dutyTitle || 'Weekly Campus Duty'}
                </h2>
                <p className="text-xs font-mono text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3 text-emerald-500" />
                  <span>{formatDutyDate(currentAssignment.startDate)} &ndash; {formatDutyDate(currentAssignment.endDate)}</span>
                </p>
              </div>
            </div>

            {isAlreadySent ? (
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>Marked Sent</span>
              </span>
            ) : (
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Ready to Send</span>
              </span>
            )}
          </div>

          {/* Assigned Teachers List */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Teacher(s) on Duty</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {currentAssignment.teachers.map((t, tid) => (
                <div
                  key={t.id || tid}
                  className="p-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] flex items-center justify-between"
                >
                  <span className="text-sm font-bold text-[var(--text-page)]">{t.name}</span>
                  {t.role && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-black/30 border border-white/5 text-[var(--text-muted)]">
                      {t.role}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Message Live Preview Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] uppercase">
              <span>Announcement Message Preview</span>
              <span className="text-emerald-400">Preserves line breaks</span>
            </div>
            <div className="p-4 rounded-2xl border border-[var(--card-border-subtle)] bg-[var(--code-bg)] font-mono text-xs whitespace-pre-wrap leading-relaxed text-[var(--text-page)]">
              {generatedMessage}
            </div>
          </div>

          {/* Action Buttons: COPY, OPEN WHATSAPP, MARK AS SENT */}
          <div className="space-y-2.5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleCopyMessage}
                className={`py-3.5 px-4 rounded-2xl font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                  copiedNotification
                    ? 'bg-emerald-500 text-black shadow-emerald-500/30'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
                }`}
              >
                {copiedNotification ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Message Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Message</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="py-3.5 px-4 rounded-2xl font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:bg-[var(--card-bg)] text-[var(--text-page)] shadow-md"
              >
                <Send className="w-4 h-4 text-emerald-500" />
                <span>Open WhatsApp</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleMarkAsSent}
              className={`w-full py-2.5 px-4 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                isAlreadySent || sentNotification
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-page)]'
              }`}
            >
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span>{sentNotification ? 'Marked as Sent in History!' : isAlreadySent ? 'Already Marked Sent' : 'Mark as Sent'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-page)]">No Duty Schedule Loaded</h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
            Upload a duty spreadsheet (.xlsx, .csv, .pdf) or tap below to load the demo schedule.
          </p>
          <button
            type="button"
            onClick={onLoadSampleRoster}
            className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs font-mono uppercase cursor-pointer"
          >
            Load Demo Schedule
          </button>
        </div>
      )}

      {/* Delete Roster Confirm Modal */}
      {rosterPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="border border-[var(--card-border)] rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4 bg-[var(--modal-bg)] text-[var(--text-page)]">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-black text-[var(--text-page)]">Delete Duty Roster?</h3>
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                Are you sure you want to delete <strong>&ldquo;{rosterPendingDelete.name}&rdquo;</strong>?
              </p>
            </div>

            {isDeletingRoster && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[10px] font-mono font-bold text-rose-500">
                  <span>DELETING FROM DATABASE</span>
                  <span className="animate-pulse">PROCESSING...</span>
                </div>
                <div className="w-full h-1.5 bg-rose-500/10 rounded-full overflow-hidden border border-rose-500/20 relative">
                  <div className="absolute top-0 bottom-0 left-0 w-2/3 bg-gradient-to-r from-rose-500 via-pink-400 to-rose-500 rounded-full animate-progress-loading" />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setRosterPendingDelete(null)}
                disabled={isDeletingRoster}
                className="flex-1 py-2.5 px-3 rounded-xl text-xs font-mono font-bold border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-page)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingRoster}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-500 text-white text-xs font-mono font-bold cursor-pointer"
              >
                {isDeletingRoster ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
