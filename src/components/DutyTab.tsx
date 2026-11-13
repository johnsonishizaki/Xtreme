import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Copy,
  CheckCircle2,
  Send,
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  Loader2,
  Trash2,
  Check,
  Clock,
  Camera,
  Radio,
  Volume2,
  CalendarPlus
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
import {
  checkAndTriggerDutyAlert,
  testUrgentNotification,
  downloadDutyCalendarAlarm
} from '../services/notificationService';

interface DutyTabProps {
  rosters: Roster[];
  assignments: DutyAssignment[];
  settings: AppSettings;
  sendHistory: SendHistory[];
  onReviewParsedData: (data: ParsedRosterPayload) => void;
  onRefreshData: () => Promise<void>;
  onDeleteRoster?: (rosterId: string) => Promise<void>;
  onWhatsAppLaunched?: () => void;
  onTriggerAlarmTest?: () => void;
}

export const DutyTab: React.FC<DutyTabProps> = ({
  rosters,
  assignments,
  settings,
  sendHistory,
  onReviewParsedData,
  onRefreshData,
  onDeleteRoster,
  onWhatsAppLaunched,
  onTriggerAlarmTest
}) => {
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [sentNotification, setSentNotification] = useState(false);
  const [copiedTallyLink, setCopiedTallyLink] = useState(false);
  const [showImportSection, setShowImportSection] = useState(false);

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

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

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
    return upcoming !== -1 ? upcoming : 0;
  }, [sortedAssignments, todayStr]);

  // Always default to THIS week's duty
  const currentAssignment = useMemo(() => {
    if (sortedAssignments.length === 0) return null;
    if (selectedAssignmentId) {
      const match = sortedAssignments.find(a => a.id === selectedAssignmentId);
      if (match) return match;
    }
    const thisWeek = sortedAssignments.find(a => todayStr >= a.startDate && todayStr <= a.endDate);
    if (thisWeek) return thisWeek;
    const targetIdx = currentWeekIdx !== -1 ? currentWeekIdx : 0;
    return sortedAssignments[targetIdx] || sortedAssignments[0];
  }, [sortedAssignments, selectedAssignmentId, todayStr, currentWeekIdx]);

  const generatedMessage = useMemo(() => {
    if (!currentAssignment) return '';
    return generateAnnouncementMessage(settings.messageTemplate, currentAssignment);
  }, [currentAssignment, settings.messageTemplate]);

  const isAlreadySent = useMemo(() => {
    if (!currentAssignment) return false;
    return sendHistory.some(h => h.assignmentId === currentAssignment.id && h.status === 'sent_confirmed');
  }, [currentAssignment, sendHistory]);

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
      await recordSendHistory({
        id: `copy-${Date.now()}`,
        assignmentId: currentAssignment.id,
        weekLabel: currentAssignment.weekLabel,
        dutyPeriod: `${formatDutyDate(currentAssignment.startDate)} - ${formatDutyDate(currentAssignment.endDate)}`,
        message: generatedMessage,
        timestamp: new Date().toISOString(),
        status: 'copied'
      });
      await onRefreshData();
      setTimeout(() => setCopiedNotification(false), 2500);
    }
  };

  const handleOpenWhatsApp = () => {
    if (!generatedMessage) return;
    onWhatsAppLaunched?.();
    openWhatsApp(generatedMessage, settings.whatsAppBehavior || 'app');
  };

  const handleMarkAsSent = async () => {
    if (!currentAssignment || !generatedMessage) return;
    await recordSendHistory({
      id: `sent-${Date.now()}`,
      assignmentId: currentAssignment.id,
      weekLabel: currentAssignment.weekLabel,
      dutyPeriod: `${formatDutyDate(currentAssignment.startDate)} - ${formatDutyDate(currentAssignment.endDate)}`,
      message: generatedMessage,
      timestamp: new Date().toISOString(),
      status: !isAlreadySent ? 'sent_confirmed' : 'copied'
    });
    await onRefreshData();
    setSentNotification(true);
    setTimeout(() => setSentNotification(false), 2500);
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImportError(null);
      setIsImporting(true);
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          resolve(res.includes(',') ? res.split(',')[1] : res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { parseRosterWithAI } = await import('../services/aiParserClient');
      const parsed = await parseRosterWithAI('', file.name || `roster_${Date.now()}.jpg`, 'image', undefined, base64Data, file.type || 'image/jpeg');
      onReviewParsedData(parsed);
    } catch (err: any) {
      setImportError(err.message || 'Could not read roster photo.');
    } finally {
      setIsImporting(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImportError(null);
      setIsImporting(true);
      const lower = file.name.toLowerCase();
      if (file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/.test(lower)) {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            resolve(res.includes(',') ? res.split(',')[1] : res);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const { parseRosterWithAI } = await import('../services/aiParserClient');
        onReviewParsedData(await parseRosterWithAI('', file.name, 'image', undefined, base64Data, file.type || 'image/jpeg'));
        return;
      }
      const buffer = await file.arrayBuffer();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
        const { parseSpreadsheet } = await import('../services/rosterParser');
        onReviewParsedData(await parseSpreadsheet(buffer, file.name));
      } else if (lower.endsWith('.pdf')) {
        const { parsePdfRoster } = await import('../services/pdfParser');
        onReviewParsedData(await parsePdfRoster(buffer, file.name));
      } else {
        const { parseRosterWithAI } = await import('../services/aiParserClient');
        onReviewParsedData(await parseRosterWithAI(await file.text(), file.name, 'csv'));
      }
    } catch (err: any) {
      setImportError(err.message || 'Could not parse file.');
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
      onReviewParsedData(await importGoogleSheetFromUrl(googleSheetUrl));
    } catch (err: any) {
      setImportError(err.message || 'Failed to import Google Sheet.');
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
      onReviewParsedData(await parsePastedSheetData(pastedData));
    } catch (err: any) {
      setImportError(err.message || 'Failed to parse rows.');
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 space-y-5 pb-16 text-left">
      {/* Header + Add Roster Button */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-[var(--text-page)]">
            Teacher Duty
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            {activeRoster ? activeRoster.name : 'Weekly announcement'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowImportSection(!showImportSection)}
          className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500/40 text-xs font-semibold flex items-center gap-1.5 cursor-pointer text-[var(--text-page)] transition-colors shrink-0"
        >
          <Camera className="w-3.5 h-3.5 text-emerald-500" />
          <span>{showImportSection ? 'Close' : 'Add Roster'}</span>
        </button>
      </div>

      {/* Collapsible Roster Upload Drawer */}
      {showImportSection && (
        <div className="p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-3.5">
          {importError && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-500 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          <div className="grid grid-cols-4 rounded-xl p-1 bg-[var(--nav-bg)] border border-[var(--card-border)] gap-1">
            {[
              { id: 'camera', label: 'Photo', icon: Camera },
              { id: 'file', label: 'File', icon: Upload },
              { id: 'sheets', label: 'Sheet', icon: FileSpreadsheet },
              { id: 'paste', label: 'Paste', icon: Copy }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveImportTab(tab.id as any)}
                  className={`min-h-[34px] py-1 px-2 rounded-lg text-xs font-semibold cursor-pointer flex items-center justify-center gap-1 transition-colors ${
                    activeImportTab === tab.id
                      ? 'bg-emerald-500 text-black'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {activeImportTab === 'camera' && (
            <>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isImporting}
                className="w-full border-2 border-dashed border-emerald-500/45 hover:border-emerald-400 bg-emerald-500/5 rounded-xl p-5 text-center cursor-pointer transition-colors"
              >
                {isImporting ? (
                  <div className="flex items-center justify-center gap-2 text-xs font-semibold">
                    <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                    <span>Reading roster photo...</span>
                  </div>
                ) : (
                  <div className="text-xs font-bold text-[var(--text-page)]">
                    Tap to Take Photo or Pick Roster Image
                  </div>
                )}
              </button>
            </>
          )}

          {activeImportTab === 'file' && (
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf,image/*" onChange={handleFileChange} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="w-full border-2 border-dashed border-[var(--card-border)] hover:border-emerald-500 rounded-xl p-5 text-center cursor-pointer transition-colors text-xs font-bold text-[var(--text-page)]"
              >
                {isImporting ? 'Processing...' : 'Select Excel, CSV, or PDF'}
              </button>
            </>
          )}

          {activeImportTab === 'sheets' && (
            <div className="flex gap-2">
              <input
                type="url"
                value={googleSheetUrl}
                onChange={e => setGoogleSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl text-xs border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleGoogleSheetImport}
                disabled={isImporting || !googleSheetUrl.trim()}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-500 text-black font-bold text-xs cursor-pointer"
              >
                Import
              </button>
            </div>
          )}

          {activeImportTab === 'paste' && (
            <div className="space-y-2">
              <textarea
                rows={3}
                value={pastedData}
                onChange={e => setPastedData(e.target.value)}
                placeholder="Paste rows from Excel or Google Sheets..."
                className="w-full p-2.5 rounded-xl text-xs border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handlePastedDataImport}
                disabled={isImporting || !pastedData.trim()}
                className="w-full min-h-[38px] py-1.5 rounded-xl bg-emerald-500 text-black font-bold text-xs cursor-pointer"
              >
                Parse Rows
              </button>
            </div>
          )}

          {rosters.length > 0 && (
            <div className="divide-y divide-[var(--card-border-subtle)] pt-1">
              {rosters.map((r, idx) => (
                <div key={`duty-roster-${r.id}-${idx}`} className="py-2 flex items-center justify-between text-xs gap-2">
                  <div className="truncate">
                    <span className="font-semibold text-[var(--text-page)]">{r.name}</span>
                    <span className="text-[var(--text-muted)] ml-1.5 tabular-nums">({r.totalWeeks} wks)</span>
                    {r.isActive && <span className="text-emerald-500 font-bold ml-2">Active</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!r.isActive && (
                      <button
                        type="button"
                        onClick={() => setActiveRoster(r.id).then(() => onRefreshData())}
                        className="text-xs font-semibold text-emerald-500 hover:underline cursor-pointer"
                      >
                        Use
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRosterPendingDelete(r)}
                      aria-label={`Delete ${r.name}`}
                      className="p-1 text-[var(--text-muted)] hover:text-rose-500 cursor-pointer"
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

      {/* Horizontal Week Selector */}
      {sortedAssignments.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {sortedAssignments.map((a, idx) => {
            const isSelected = currentAssignment?.id === a.id;
            const isCurrent = currentWeekIdx !== -1 && sortedAssignments[currentWeekIdx]?.id === a.id;

            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedAssignmentId(a.id)}
                className={`min-h-[34px] px-3 py-1 rounded-xl text-xs shrink-0 transition-colors cursor-pointer border tabular-nums ${
                  isSelected
                    ? 'bg-emerald-500 text-black font-bold border-emerald-500'
                    : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-page)]'
                }`}
              >
                {a.weekLabel || `Week ${idx + 1}`}
                {isCurrent && (
                  <span className={`ml-1 text-[10px] ${isSelected ? 'text-black/75' : 'text-emerald-500'}`}>
                    (Now)
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Active Duty Card */}
      {currentAssignment ? (
        <div className="p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
          <div className="flex items-start justify-between border-b border-[var(--card-border-subtle)] pb-3 gap-3">
            <div>
              <h2 className="text-base font-extrabold text-[var(--text-page)]">
                {currentAssignment.weekLabel} · {currentAssignment.dutyTitle || 'Weekly Duty'}
              </h2>
              <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 mt-1 font-mono tabular-nums">
                <Clock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>{formatDutyDate(currentAssignment.startDate)} – {formatDutyDate(currentAssignment.endDate)}</span>
              </p>
            </div>

            <span className={`text-xs font-bold flex items-center gap-1 shrink-0 ${isAlreadySent ? 'text-emerald-500' : 'text-amber-500'}`}>
              {isAlreadySent ? <Check className="w-4 h-4" /> : <Clock className="w-3.5 h-3.5" />}
              <span>{isAlreadySent ? 'Sent' : 'Pending'}</span>
            </span>
          </div>

          {/* Teachers on Duty */}
          <div className="flex flex-wrap gap-2">
            {currentAssignment.teachers.map((t, tid) => (
              <div
                key={t.id || tid}
                className="px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-xs font-bold text-[var(--text-page)]"
              >
                {t.name}
                {t.role && <span className="font-normal text-[var(--text-muted)] ml-1.5">· {t.role}</span>}
              </div>
            ))}
          </div>

          {/* Compact Message Preview */}
          <div className="p-3.5 rounded-xl border border-[var(--card-border-subtle)] bg-[var(--code-bg)] font-mono text-xs whitespace-pre-wrap leading-relaxed text-[var(--text-page)] max-h-44 overflow-y-auto">
            {generatedMessage}
          </div>

          {/* Primary Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="min-h-[42px] py-2 px-4 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-black transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Send WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleCopyMessage}
              className="min-h-[42px] py-2 px-4 rounded-xl font-bold text-xs border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:border-emerald-500/50 text-[var(--text-page)] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copiedNotification ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span>{copiedNotification ? 'Copied' : 'Copy Text'}</span>
            </button>

            <button
              type="button"
              onClick={handleMarkAsSent}
              className={`min-h-[42px] py-2 px-4 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer border ${
                isAlreadySent || sentNotification
                  ? 'border-emerald-500/45 text-emerald-500 bg-emerald-500/10'
                  : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-page)] hover:border-emerald-500/50'
              }`}
            >
              <Check className="w-4 h-4 text-emerald-500" />
              <span>{isAlreadySent || sentNotification ? 'Done (Undo)' : 'Mark Done'}</span>
            </button>
          </div>

          {/* Secondary Utility Links */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--card-border-subtle)] text-xs">
            <button
              type="button"
              onClick={() => {
                testUrgentNotification();
                onTriggerAlarmTest?.();
              }}
              className="text-[var(--text-muted)] hover:text-amber-500 font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Test Alarm &amp; Push</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const teachersText = currentAssignment.teachers.map(t => t.name).join(', ') || 'Teachers on duty';
                downloadDutyCalendarAlarm(
                  settings.reminderDay ?? 0,
                  settings.reminderTime ?? '08:00',
                  currentAssignment.weekLabel,
                  teachersText
                );
              }}
              className="text-[var(--text-muted)] hover:text-emerald-500 font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              <span>iPhone Lock Alarm (.ics)</span>
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
              className="text-[var(--text-muted)] hover:text-emerald-500 font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{copiedTallyLink ? 'Form Link Copied' : 'Copy Arrival Form Link'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] text-center space-y-3">
          <FileSpreadsheet className="w-8 h-8 text-emerald-500 mx-auto" />
          <div className="text-sm font-bold text-[var(--text-page)]">No Duty Schedule Uploaded</div>
          <p className="text-xs text-[var(--text-muted)] max-w-xs mx-auto">
            Snap a photo of your printed roster or upload a file to begin.
          </p>
          <button
            type="button"
            onClick={() => setShowImportSection(true)}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs cursor-pointer"
          >
            Add Roster
          </button>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {rosterPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="border border-[var(--card-border)] rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 bg-[var(--modal-bg)] text-[var(--text-page)]">
            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold">Delete Duty Schedule?</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Delete <strong>{rosterPendingDelete.name}</strong> and all weekly assignments?
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRosterPendingDelete(null)}
                disabled={isDeletingRoster}
                className="flex-1 min-h-[38px] rounded-xl text-xs font-semibold border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-page)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingRoster}
                className="flex-1 min-h-[38px] rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold cursor-pointer"
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
