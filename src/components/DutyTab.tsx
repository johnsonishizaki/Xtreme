import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  ChevronUp,
  Camera,
  Bell,
  Radio
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
import { checkAndTriggerDutyAlert } from '../services/notificationService';

interface DutyTabProps {
  rosters: Roster[];
  assignments: DutyAssignment[];
  settings: AppSettings;
  sendHistory: SendHistory[];
  onReviewParsedData: (data: ParsedRosterPayload) => void;
  onRefreshData: () => Promise<void>;
  onLoadSampleRoster?: () => Promise<void>;
  onDeleteSampleRoster?: () => Promise<void>;
  onDeleteRoster?: (rosterId: string) => Promise<void>;
}

export const DutyTab: React.FC<DutyTabProps> = ({
  rosters,
  assignments,
  settings,
  sendHistory,
  onReviewParsedData,
  onRefreshData,
  onDeleteRoster
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [sentNotification, setSentNotification] = useState(false);
  const [copiedTallyLink, setCopiedTallyLink] = useState(false);
  const [showImportSection, setShowImportSection] = useState(false);

  // Roster Import states - includes 'camera' for taking photo
  const [activeImportTab, setActiveImportTab] = useState<'camera' | 'file' | 'sheets' | 'paste'>('camera');
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [pastedData, setPastedData] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [rosterPendingDelete, setRosterPendingDelete] = useState<Roster | null>(null);
  const [isDeletingRoster, setIsDeletingRoster] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

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

  // ALWAYS feature THIS WEEK'S duty (never jump to another week unless user picked one)
  const currentAssignment = useMemo(() => {
    if (filteredAssignments.length === 0) return null;
    if (selectedAssignmentId) {
      const match = filteredAssignments.find(a => a.id === selectedAssignmentId);
      if (match) return match;
    }
    // Strictly find this week's assignment where today is within [startDate, endDate]
    const thisWeek = filteredAssignments.find(a => todayStr >= a.startDate && todayStr <= a.endDate);
    if (thisWeek) return thisWeek;
    const targetIdx = currentWeekIdx !== -1 ? currentWeekIdx : 0;
    return filteredAssignments[targetIdx] || filteredAssignments[0];
  }, [filteredAssignments, selectedAssignmentId, todayStr, currentWeekIdx]);

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

  // Push notifications & alert reminder watchdog until marked done
  useEffect(() => {
    if (currentAssignment) {
      const teachersText = currentAssignment.teachers.map(t => t.name).join(', ') || 'Teachers';
      checkAndTriggerDutyAlert(
        currentAssignment.id,
        currentAssignment.weekLabel,
        teachersText,
        isAlreadySent
      );
    }
  }, [currentAssignment, isAlreadySent]);

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
    const isNowSent = !isAlreadySent;
    const item: SendHistory = {
      id: `sent-${Date.now()}`,
      assignmentId: currentAssignment.id,
      weekLabel: currentAssignment.weekLabel,
      dutyPeriod: `${formatDutyDate(currentAssignment.startDate)} - ${formatDutyDate(currentAssignment.endDate)}`,
      message: generatedMessage,
      timestamp: new Date().toISOString(),
      status: isNowSent ? 'sent_confirmed' : 'copied'
    };
    await recordSendHistory(item);
    await onRefreshData();
    setSentNotification(true);
    setTimeout(() => setSentNotification(false), 3500);
  };

  // Taking photo of roster via phone camera / webcam
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportError(null);
      setIsImporting(true);
      const fileName = file.name || `roster_photo_${Date.now()}.jpg`;
      const mimeType = file.type || 'image/jpeg';

      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          const clean = res.includes(',') ? res.split(',')[1] : res;
          resolve(clean);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { parseRosterWithAI } = await import('../services/aiParserClient');
      const parsed = await parseRosterWithAI('', fileName, 'image', undefined, base64Data, mimeType);
      onReviewParsedData(parsed);
    } catch (err: any) {
      setImportError(err.message || 'Could not parse roster photo with AI. Please make sure the table is clear.');
    } finally {
      setIsImporting(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  // Progressive File selection (handles Excel, CSV, PDF, and Photos)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportError(null);
      setIsImporting(true);
      const fileName = file.name;
      const lower = fileName.toLowerCase();

      // Check if image file
      if (file.type.startsWith('image/') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
        const mimeType = file.type || 'image/jpeg';
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            const clean = res.includes(',') ? res.split(',')[1] : res;
            resolve(clean);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const { parseRosterWithAI } = await import('../services/aiParserClient');
        const parsed = await parseRosterWithAI('', fileName, 'image', undefined, base64Data, mimeType);
        onReviewParsedData(parsed);
        return;
      }

      const buffer = await file.arrayBuffer();

      if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
        const { parseSpreadsheet } = await import('../services/rosterParser');
        const parsed = await parseSpreadsheet(buffer, fileName);
        onReviewParsedData(parsed);
      } else if (lower.endsWith('.pdf')) {
        const { parsePdfRoster } = await import('../services/pdfParser');
        const parsed = await parsePdfRoster(buffer, fileName);
        onReviewParsedData(parsed);
      } else {
        const text = await file.text();
        const { parseRosterWithAI } = await import('../services/aiParserClient');
        const parsed = await parseRosterWithAI(text, fileName, 'csv');
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
      setImportError(null);
      setIsImporting(true);
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
      setImportError(null);
      setIsImporting(true);
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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-page)]">
            Teacher Duty
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Weekly duty schedule and announcements
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowImportSection(!showImportSection)}
          className="px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-xs font-medium flex items-center gap-1.5 cursor-pointer text-[var(--text-page)] transition-all self-start sm:self-auto"
        >
          <Upload className="w-3.5 h-3.5 text-emerald-500" />
          <span>{showImportSection ? 'Hide Roster Tools' : 'Import Roster'}</span>
          {showImportSection ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ROSTER IMPORT & MANAGEMENT ACCORDION */}
      {showImportSection && (
        <div className="p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--card-border-subtle)] pb-2.5">
            <h3 className="text-xs font-semibold text-[var(--text-page)] flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span>Roster Sources</span>
            </h3>
          </div>

          {importError && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          {/* Import Tabs */}
          <div className="flex rounded-xl p-1 bg-[var(--nav-bg)] border border-[var(--card-border)] gap-1">
            <button
              type="button"
              onClick={() => setActiveImportTab('camera')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1 ${
                activeImportTab === 'camera' ? 'bg-emerald-500 text-black font-semibold' : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Take Photo</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveImportTab('file')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeImportTab === 'file' ? 'bg-emerald-500 text-black font-semibold' : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
              }`}
            >
              File
            </button>
            <button
              type="button"
              onClick={() => setActiveImportTab('sheets')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeImportTab === 'sheets' ? 'bg-emerald-500 text-black font-semibold' : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
              }`}
            >
              Google Sheet
            </button>
            <button
              type="button"
              onClick={() => setActiveImportTab('paste')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeImportTab === 'paste' ? 'bg-emerald-500 text-black font-semibold' : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
              }`}
            >
              Paste
            </button>
          </div>

          {activeImportTab === 'camera' && (
            <div className="text-center">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoCapture}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isImporting}
                className="w-full border-2 border-dashed border-emerald-500/50 hover:border-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 rounded-xl p-5 transition-all text-center group cursor-pointer"
              >
                {isImporting ? (
                  <div className="py-2">
                    <Loader2 className="w-6 h-6 text-emerald-400 mx-auto mb-2 animate-spin" />
                    <div className="text-xs font-semibold text-[var(--text-page)]">Reading roster photo with AI...</div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">Analyzing weeks, dates, and teachers on duty</p>
                  </div>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-semibold text-[var(--text-page)]">
                      Tap to Take Photo of Printed Roster
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-xs mx-auto">
                      Snap a picture with your camera or upload an image. AI will automatically extract all duty weeks and teachers.
                    </p>
                  </>
                )}
              </button>
            </div>
          )}

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
                className="w-full border-2 border-dashed border-[var(--card-border)] hover:border-emerald-500 rounded-xl p-5 transition-all text-center group cursor-pointer"
              >
                <Upload className="w-5 h-5 text-emerald-500 mx-auto mb-1.5 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-medium text-[var(--text-page)]">
                  {isImporting ? 'Processing roster...' : 'Select Excel (.xlsx), CSV, or PDF'}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Automatic table extraction & matching
                </p>
              </button>
            </div>
          )}

          {activeImportTab === 'sheets' && (
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--text-muted)]">Google Sheet URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={googleSheetUrl}
                  onChange={e => setGoogleSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 px-3 py-2 rounded-xl text-xs border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] focus:border-emerald-500 outline-none"
                />
                <button
                  type="button"
                  onClick={handleGoogleSheetImport}
                  disabled={isImporting || !googleSheetUrl.trim()}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 text-black font-semibold text-xs cursor-pointer hover:bg-emerald-400 transition-colors"
                >
                  Import
                </button>
              </div>
            </div>
          )}

          {activeImportTab === 'paste' && (
            <div className="space-y-1.5">
              <textarea
                rows={3}
                value={pastedData}
                onChange={e => setPastedData(e.target.value)}
                placeholder="Paste rows copied from spreadsheet..."
                className="w-full p-2.5 rounded-xl text-xs border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] focus:border-emerald-500 outline-none"
              />
              <button
                type="button"
                onClick={handlePastedDataImport}
                disabled={isImporting || !pastedData.trim()}
                className="w-full py-2 rounded-xl bg-emerald-500 text-black font-semibold text-xs cursor-pointer hover:bg-emerald-400 transition-colors"
              >
                Parse Rows
              </button>
            </div>
          )}

          {/* Active Rosters List */}
          {rosters.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-[var(--card-border-subtle)]">
              <div className="text-xs text-[var(--text-muted)]">Rosters ({rosters.length})</div>
              {rosters.map((r, idx) => (
                <div
                  key={`duty-roster-${r.id}-${idx}`}
                  className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                    r.isActive ? 'border-emerald-500/40 bg-[var(--card-bg-elevated)]' : 'border-[var(--card-border)] bg-[var(--card-bg)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${r.isActive ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    <span className="font-semibold text-[var(--text-page)]">{r.name}</span>
                    <span className="text-xs text-[var(--text-muted)]">· {r.totalWeeks} weeks</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!r.isActive && (
                      <button
                        type="button"
                        onClick={() => setActiveRoster(r.id).then(() => onRefreshData())}
                        className="text-xs text-emerald-500 hover:underline cursor-pointer"
                      >
                        Make Active
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRosterPendingDelete(r)}
                      className="p-1 text-[var(--text-muted)] hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SEARCH BAR */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-[var(--text-muted)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search teacher or week..."
          className="w-full pl-9 pr-8 py-2 rounded-xl text-xs border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] focus:border-emerald-500 outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-page)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* DUTY WEEK SELECTOR */}
      {filteredAssignments.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {filteredAssignments.map((a, idx) => {
              const isSelected = currentAssignment?.id === a.id;
              const isCurrent = currentWeekIdx !== -1 && sortedAssignments[currentWeekIdx]?.id === a.id;
              const isComing = comingWeekIdx !== -1 && sortedAssignments[comingWeekIdx]?.id === a.id && !isCurrent;

              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAssignmentId(a.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs shrink-0 transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-emerald-500 text-black font-semibold border-emerald-500'
                      : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-page)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{a.weekLabel || `Week ${idx + 1}`}</span>
                    {isCurrent && (
                      <span className={`text-[10px] font-medium ${isSelected ? 'text-black/80' : 'text-emerald-500'}`}>
                        (Current)
                      </span>
                    )}
                    {isComing && (
                      <span className={`text-[10px] font-medium ${isSelected ? 'text-black/80' : 'text-amber-500'}`}>
                        (Next)
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
        <div className="p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
          {/* Duty Title & Status */}
          <div className="flex items-start justify-between border-b border-[var(--card-border-subtle)] pb-3">
            <div>
              <div className="text-xs text-[var(--text-muted)]">
                {currentAssignment.weekLabel}
              </div>
              <h2 className="text-base font-bold text-[var(--text-page)] mt-0.5">
                {currentAssignment.dutyTitle || 'Weekly Campus Duty'}
              </h2>
              <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3 text-emerald-500" />
                <span>{formatDutyDate(currentAssignment.startDate)} – {formatDutyDate(currentAssignment.endDate)}</span>
              </p>
            </div>

            {isAlreadySent ? (
              <span className="text-xs font-medium text-emerald-500 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>Sent</span>
              </span>
            ) : (
              <span className="text-xs font-medium text-amber-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Ready to send</span>
              </span>
            )}
          </div>

          {/* Assigned Teachers */}
          <div className="space-y-1">
            <div className="text-xs text-[var(--text-muted)]">Teachers on Duty</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {currentAssignment.teachers.map((t, tid) => (
                <div
                  key={t.id || tid}
                  className="p-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-[var(--text-page)]">{t.name}</span>
                  {t.role && (
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {t.role}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Message Preview Box */}
          <div className="space-y-1">
            <div className="text-xs text-[var(--text-muted)]">
              Message Preview
            </div>
            <div className="p-3.5 rounded-xl border border-[var(--card-border-subtle)] bg-[var(--code-bg)] font-mono text-xs whitespace-pre-wrap leading-relaxed text-[var(--text-page)] max-h-48 overflow-y-auto scrollbar-thin">
              {generatedMessage}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyMessage}
                className="py-2.5 px-4 rounded-xl font-semibold text-xs bg-emerald-500 hover:bg-emerald-400 text-black transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                {copiedNotification ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Message</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="py-2.5 px-4 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:bg-[var(--card-bg)] text-[var(--text-page)]"
              >
                <Send className="w-3.5 h-3.5 text-emerald-500" />
                <span>Open WhatsApp</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleMarkAsSent}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                isAlreadySent || sentNotification
                  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/15'
                  : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-page)] hover:border-emerald-500/50'
              }`}
            >
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {sentNotification
                  ? 'Marked as Sent for This Week (Reminders Silenced)'
                  : isAlreadySent
                  ? 'Marked Done for This Week (Click to Unmark)'
                  : 'Mark Done for This Week (Silences Notification Reminder)'}
              </span>
            </button>

            <button
              type="button"
              onClick={async () => {
                const ok = await copyToClipboard('https://tally.so/r/2jBVWA');
                if (ok) {
                  setCopiedTallyLink(true);
                  setTimeout(() => setCopiedTallyLink(false), 2500);
                }
              }}
              className="w-full py-2 px-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:bg-[var(--card-bg)] text-xs text-[var(--text-page)] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>{copiedTallyLink ? 'Form Link Copied!' : 'Copy House Arrival Form Link'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] text-center space-y-3">
          <FileSpreadsheet className="w-9 h-9 text-emerald-500 mx-auto" />
          <h3 className="text-sm font-semibold text-[var(--text-page)]">No Duty Schedule Uploaded</h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
            Upload your school&apos;s Excel, CSV, or PDF schedule above to view weekly duty assignments and announcements.
          </p>
          <button
            type="button"
            onClick={() => setShowImportSection(true)}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs cursor-pointer shadow-xs transition-colors"
          >
            Import Roster
          </button>
        </div>
      )}

      {/* Delete Roster Confirm Modal */}
      {rosterPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="border border-[var(--card-border)] rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 bg-[var(--modal-bg)] text-[var(--text-page)]">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold text-[var(--text-page)]">Delete Duty Schedule?</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Delete <strong>{rosterPendingDelete.name}</strong> and all its weekly assignments?
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRosterPendingDelete(null)}
                disabled={isDeletingRoster}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-medium border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-[var(--text-page)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingRoster}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold cursor-pointer transition-colors"
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
