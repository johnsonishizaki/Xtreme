import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Sparkles,
  Trash2,
  AlertCircle,
  FileText,
  Loader2,
  Camera
} from 'lucide-react';
import { Roster, DutyAssignment, ParsedRosterPayload, AppSettings } from '../types';
import { deleteRoster, setActiveRoster } from '../services/firebase';
import { formatDutyDate } from '../services/messageGenerator';
import { OperationProgressModal } from './OperationProgressModal';
import { useOperationProgress } from '../hooks/useOperationProgress';

interface RosterTabProps {
  rosters: Roster[];
  assignments: DutyAssignment[];
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => Promise<void>;
  onReviewParsedData: (data: ParsedRosterPayload) => void;
  onRefreshData: () => Promise<void>;
  onLoadSampleRoster: () => Promise<void>;
  onDeleteSampleRoster: () => Promise<void>;
  onDeleteRoster?: (rosterId: string) => Promise<void>;
}

export const RosterTab: React.FC<RosterTabProps> = ({
  rosters,
  assignments,
  onReviewParsedData,
  onRefreshData,
  onLoadSampleRoster,
  onDeleteSampleRoster,
  onDeleteRoster
}) => {
  const [activeImportTab, setActiveImportTab] = useState<'file' | 'sheets' | 'paste'>('file');
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>('');
  const [pastedData, setPastedData] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rosterPendingDelete, setRosterPendingDelete] = useState<Roster | null>(null);
  const [isDeletingRoster, setIsDeletingRoster] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const opProgress = useOperationProgress();

  // File selection handler with live staged progress
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isImage =
      fileName.endsWith('.png') ||
      fileName.endsWith('.jpg') ||
      fileName.endsWith('.jpeg') ||
      fileName.endsWith('.webp') ||
      file.type.startsWith('image/');
    const isPdf = fileName.endsWith('.pdf');
    const isSpreadsheet = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');

    try {
      setErrorMessage(null);

      // Start multi-stage progress modal immediately
      opProgress.startOperation(
        isImage
          ? 'AI Schedule Photo Analysis'
          : isPdf
          ? 'Parsing PDF Duty Schedule'
          : 'Processing Spreadsheet Duty Roster',
        [
          { label: 'Reading file buffer into memory', detail: `${file.name} (${(file.size / 1024).toFixed(1)} KB)` },
          { label: isImage ? 'Multimodal image preprocessing' : 'Scanning document rows & cell values', detail: 'Preparing payload' },
          { label: 'Consulting AI interpretation engine (Gemini Flash)', detail: 'Extracting weeks, dates & teachers' },
          { label: 'Validating assignments & calendar constraints', detail: 'Checking data consistency' },
          { label: 'Opening review workspace for Xtreme', detail: 'Ready for verification' }
        ],
        `Processing "${file.name}" in background. Live progress updates active.`
      );

      opProgress.setStage(0, 'Reading file bytes...', 15);

      if (isSpreadsheet) {
        opProgress.setStage(1, 'SheetJS scanning workbook & duty columns...', 35);
        const buffer = await file.arrayBuffer();
        const { parseSpreadsheet } = await import('../services/rosterParser');
        opProgress.setStage(2, 'Extracting duty periods & teacher roster...', 65);
        const parsed = await parseSpreadsheet(buffer, file.name);
        opProgress.setStage(3, 'Validating structured assignments...', 88);
        await opProgress.completeOperation(`Extracted ${parsed.assignments.length} duty weeks! Opening review...`, 500);
        onReviewParsedData(parsed);
      } else if (isPdf) {
        opProgress.setStage(1, 'PDF.js extracting text tokens & schedule layout...', 35);
        const buffer = await file.arrayBuffer();
        const { parsePdfRoster } = await import('../services/pdfParser');
        opProgress.setStage(2, 'Gemini AI parsing duty weeks & dates from PDF...', 70);
        const parsed = await parsePdfRoster(buffer, file.name);
        opProgress.setStage(3, 'Validating duty weeks...', 90);
        await opProgress.completeOperation(`Extracted ${parsed.assignments.length} duty weeks! Opening review...`, 500);
        onReviewParsedData(parsed);
      } else if (isImage) {
        opProgress.setStage(1, 'Encoding image pixels for Gemini vision analysis...', 35);
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        opProgress.setStage(2, 'Gemini multimodal OCR reading schedule photo...', 70);
        const { parseRosterWithAI } = await import('../services/aiParserClient');
        const parsed = await parseRosterWithAI('', file.name, 'image', undefined, base64, file.type || 'image/jpeg');
        opProgress.setStage(3, 'Validating OCR duty assignments...', 90);
        await opProgress.completeOperation(`Extracted ${parsed.assignments.length} duty weeks from photo!`, 500);
        onReviewParsedData(parsed);
      } else {
        opProgress.setStage(1, 'Reading text document lines...', 35);
        const text = await file.text();
        opProgress.setStage(2, 'AI parsing duty roster from text...', 70);
        const { parseRosterWithAI } = await import('../services/aiParserClient');
        const parsed = await parseRosterWithAI(text, file.name, 'csv');
        opProgress.setStage(3, 'Validating duty entries...', 90);
        await opProgress.completeOperation(`Extracted ${parsed.assignments.length} duty weeks! Opening review...`, 500);
        onReviewParsedData(parsed);
      }
    } catch (err: any) {
      console.error('Error parsing file:', err);
      const msg = err.message || 'Could not parse this file. Please verify the format.';
      opProgress.failOperation(msg);
      setErrorMessage(msg);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Google Sheet Link Import with live staged progress
  const handleGoogleSheetImport = async () => {
    if (!googleSheetUrl.trim()) return;

    try {
      setErrorMessage(null);
      opProgress.startOperation(
        'Importing Google Sheet Duty Schedule',
        [
          { label: 'Connecting to Google Sheets', detail: 'Validating public export link' },
          { label: 'Downloading spreadsheet CSV stream', detail: 'Fetching table rows' },
          { label: 'Analyzing schedule structure & teacher assignments', detail: 'Parsing duty weeks' },
          { label: 'Opening review workspace for Xtreme', detail: 'Ready for confirmation' }
        ],
        'Importing duty schedule from Google Sheet...'
      );

      opProgress.setStage(1, 'Fetching public sheet CSV data...', 40);
      const { importGoogleSheetFromUrl } = await import('../services/sheetsParser');
      opProgress.setStage(2, 'Parsing duty periods & teachers...', 75);
      const parsed = await importGoogleSheetFromUrl(googleSheetUrl);
      opProgress.setStage(3, 'Preparing review...', 95);
      await opProgress.completeOperation(`Imported ${parsed.assignments.length} duty weeks from Google Sheet!`, 500);
      onReviewParsedData(parsed);
    } catch (err: any) {
      console.error('Google Sheet import failed:', err);
      const msg = err.message || 'Failed to import Google Sheet. Ensure it is shared publicly.';
      opProgress.failOperation(msg);
      setErrorMessage(msg);
    }
  };

  // Pasted Text Import with live staged progress
  const handlePastedDataImport = async () => {
    if (!pastedData.trim()) return;

    try {
      setErrorMessage(null);
      opProgress.startOperation(
        'Parsing Pasted Schedule Text',
        [
          { label: 'Scanning text tokens', detail: `${pastedData.length} characters` },
          { label: 'Detecting duty weeks, dates & staff names' },
          { label: 'Validating structured assignments' },
          { label: 'Opening review workspace for Xtreme' }
        ],
        'Interpreting pasted duty schedule...'
      );

      opProgress.setStage(1, 'Parsing lines and table delimiters...', 50);
      const { parsePastedSheetData } = await import('../services/sheetsParser');
      const parsed = await parsePastedSheetData(pastedData);
      opProgress.setStage(2, 'Verifying duty weeks...', 85);
      await opProgress.completeOperation(`Parsed ${parsed.assignments.length} duty weeks!`, 500);
      onReviewParsedData(parsed);
    } catch (err: any) {
      console.error('Pasted data parse failed:', err);
      const msg = err.message || 'Failed to parse pasted text.';
      opProgress.failOperation(msg);
      setErrorMessage(msg);
    }
  };

  // Load Demo Roster with live staged progress
  const handleLoadDemoWithProgress = async () => {
    try {
      setErrorMessage(null);
      opProgress.startOperation(
        'Loading Demo Duty Roster',
        [
          { label: 'Preparing sample 12-week duty schedule', detail: 'Term 1 calendar dates & rotating staff' },
          { label: 'Writing roster metadata to Cloud Firestore', detail: 'ai-studio-remixxtreme database' },
          { label: 'Batch saving 12 weekly duty assignments', detail: 'Setting statuses & teachers' },
          { label: 'Activating schedule for Senior Houseparent', detail: 'Refreshing application view' }
        ],
        'Seeding full demo duty roster in background...'
      );

      opProgress.setStage(1, 'Writing to Cloud Firestore...', 35);
      await onLoadSampleRoster();
      opProgress.setStage(2, 'Syncing 12 duty weeks...', 80);
      opProgress.setStage(3, 'Activating schedule...', 95);
      await opProgress.completeOperation('Demo roster loaded and active! Redirecting to Home...', 600);
    } catch (err: any) {
      console.error('Failed to load demo roster:', err);
      const msg = err.message || 'Failed to load demo roster.';
      opProgress.failOperation(msg);
      setErrorMessage(msg);
    }
  };

  // Remove Demo Roster with live staged progress
  const handleRemoveDemoWithProgress = async () => {
    try {
      setErrorMessage(null);
      opProgress.startOperation(
        'Removing Demo Roster',
        [
          { label: 'Locating demo roster records in Firestore', detail: 'Querying sample identifiers' },
          { label: 'Deleting assignments & cleaning up database', detail: 'Removing sample duty weeks' },
          { label: 'Refreshing application state', detail: 'Updating active roster' }
        ],
        'Removing demo data in background...'
      );

      opProgress.setStage(1, 'Deleting sample records...', 50);
      await onDeleteSampleRoster();
      opProgress.setStage(2, 'Refreshing cache...', 90);
      await opProgress.completeOperation('Demo roster removed successfully.', 500);
    } catch (err: any) {
      console.error('Failed to remove demo roster:', err);
      const msg = err.message || 'Failed to remove demo roster.';
      opProgress.failOperation(msg);
      setErrorMessage(msg);
    }
  };

  // Delete roster confirm
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
      console.error('Failed to delete roster:', err);
      setErrorMessage(err.message || 'Failed to delete roster.');
    } finally {
      setIsDeletingRoster(false);
    }
  };

  // Set active roster
  const handleSetActive = async (rosterId: string) => {
    try {
      await setActiveRoster(rosterId);
      await onRefreshData();
    } catch (err: any) {
      console.error('Failed to activate roster:', err);
      setErrorMessage(err.message || 'Failed to set active roster.');
    }
  };

  const hasSampleRoster = rosters.some(r => r.sourceType === 'sample');

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-6 pb-28 text-left">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-500">
            Duty Rosters
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--text-page)]">
            Manage & Import
          </h1>
        </div>

        {hasSampleRoster ? (
          <button
            type="button"
            onClick={handleRemoveDemoWithProgress}
            className="text-xs text-rose-500 hover:text-rose-600 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl font-mono font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Demo</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLoadDemoWithProgress}
            className="text-xs text-amber-600 hover:text-amber-700 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl font-mono font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Load Demo</span>
          </button>
        )}
      </div>

      {/* Import Card */}
      <div className="p-5 rounded-3xl border border-[var(--card-border)] shadow-xl bg-[var(--card-bg)] text-[var(--text-page)] backdrop-blur-xl space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-500">
            <Upload className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--text-page)]">Import Duty Schedule</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Upload Excel, CSV, PDF, or a photo/picture of the roster
            </p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl border border-[var(--card-border)] bg-[var(--nav-bg)]">
          <button
            type="button"
            onClick={() => { setActiveImportTab('file'); setErrorMessage(null); }}
            className={`py-2 px-2 text-xs font-mono font-semibold rounded-xl transition-all cursor-pointer ${
              activeImportTab === 'file'
                ? 'bg-emerald-500 text-black shadow-md'
                : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
            }`}
          >
            File / Photo
          </button>
          <button
            type="button"
            onClick={() => { setActiveImportTab('sheets'); setErrorMessage(null); }}
            className={`py-2 px-2 text-xs font-mono font-semibold rounded-xl transition-all cursor-pointer ${
              activeImportTab === 'sheets'
                ? 'bg-emerald-500 text-black shadow-md'
                : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
            }`}
          >
            Google Sheet
          </button>
          <button
            type="button"
            onClick={() => { setActiveImportTab('paste'); setErrorMessage(null); }}
            className={`py-2 px-2 text-xs font-mono font-semibold rounded-xl transition-all cursor-pointer ${
              activeImportTab === 'paste'
                ? 'bg-emerald-500 text-black shadow-md'
                : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
            }`}
          >
            Paste Text
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Tab 1: File Upload */}
        {activeImportTab === 'file' && !opProgress.isOpen && (
          <div className="space-y-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp,.txt,image/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer group active:scale-[0.99] border-[var(--card-border-hover)] hover:border-emerald-500/60 bg-[var(--code-bg)] hover:bg-[var(--card-bg-elevated)]"
            >
              <div className="flex items-center justify-center gap-3 mb-2">
                <FileSpreadsheet className="w-8 h-8 transition-colors text-[var(--text-subtle)] group-hover:text-emerald-500" />
                <Camera className="w-8 h-8 transition-colors text-[var(--text-subtle)] group-hover:text-teal-500" />
              </div>
              <div className="text-sm font-bold mb-1 text-[var(--text-page)]">
                Tap to choose file or photo
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Supports Excel (.xlsx, .xls), CSV, PDF, or Camera/Roster Photos
              </p>
            </button>
          </div>
        )}

        {/* Tab 2: Google Sheet */}
        {activeImportTab === 'sheets' && !opProgress.isOpen && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-mono font-bold uppercase tracking-wider block mb-1 text-[var(--text-muted)]">
                Google Sheet Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={googleSheetUrl}
                  onChange={e => setGoogleSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 px-3 py-2.5 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)]"
                />
                <button
                  type="button"
                  onClick={handleGoogleSheetImport}
                  disabled={!googleSheetUrl.trim()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-bold text-xs shadow-md transition-all shrink-0 cursor-pointer"
                >
                  Import
                </button>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--text-subtle)]">
              Make sure the sheet&rsquo;s sharing setting is set to <strong>&ldquo;Anyone with the link can view&rdquo;</strong>.
            </p>
          </div>
        )}

        {/* Tab 3: Paste Text */}
        {activeImportTab === 'paste' && !opProgress.isOpen && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-mono font-bold uppercase tracking-wider block mb-1 text-[var(--text-muted)]">
                Paste Spreadsheet Rows or CSV
              </label>
              <textarea
                value={pastedData}
                onChange={e => setPastedData(e.target.value)}
                rows={5}
                placeholder="Copy cells from Excel or Google Sheets and paste here..."
                className="w-full p-3 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)]"
              />
            </div>
            <button
              type="button"
              onClick={handlePastedDataImport}
              disabled={!pastedData.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              Parse Pasted Content
            </button>
          </div>
        )}
      </div>

      {/* Loaded Rosters List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-subtle)]">
          <span>Loaded Rosters ({rosters.length})</span>
        </div>

        {rosters.length === 0 ? (
          <div className="p-6 rounded-2xl border border-[var(--card-border)] text-center text-xs bg-[var(--card-bg)] text-[var(--text-muted)]">
            No rosters loaded yet. Upload one above or tap &ldquo;Load Demo&rdquo;.
          </div>
        ) : (
          rosters.map((roster, idx) => (
            <div
              key={`roster-${roster.id}-${idx}`}
              className={`p-4 rounded-2xl border transition-all ${
                roster.isActive
                  ? 'border-emerald-500/50 bg-[var(--card-bg-elevated)] shadow-lg text-[var(--text-page)]'
                  : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:border-[var(--card-border-hover)]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                    roster.isActive
                      ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                      : 'bg-[var(--code-bg)] text-[var(--text-subtle)]'
                  }`}>
                    {roster.sourceType === 'pdf' ? (
                      <FileText className="w-4 h-4" />
                    ) : roster.sourceType === 'sample' ? (
                      <Sparkles className="w-4 h-4 text-amber-500" />
                    ) : (
                      <FileSpreadsheet className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold truncate text-[var(--text-page)]">
                        {roster.name}
                      </span>
                      {roster.sourceType === 'sample' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-amber-500/20 text-amber-500">
                          Demo
                        </span>
                      )}
                      {roster.isActive && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-emerald-500/20 text-emerald-500">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono mt-0.5 text-[var(--text-muted)]">
                      {roster.totalWeeks} weekly assignments
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {!roster.isActive && (
                    <button
                      type="button"
                      onClick={() => handleSetActive(roster.id)}
                      className="text-[11px] font-mono font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-[var(--text-page)] transition-all cursor-pointer"
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRosterPendingDelete(roster)}
                    aria-label={`Delete ${roster.name}`}
                    title="Delete roster"
                    className="p-1.5 text-[var(--text-subtle)] hover:text-rose-500 rounded-lg hover:bg-rose-500/10 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Roster Assignment Breakdown */}
      {assignments.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-subtle)]">
            All Duty Schedule Periods ({assignments.length})
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {assignments.map((assign, idx) => (
              <div
                key={assign.id}
                className="p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-xs flex items-center justify-between text-[var(--text-page)]"
              >
                <div>
                  <div className="font-bold text-[var(--text-page)]">
                    {assign.weekLabel || `Week ${idx + 1}`}
                  </div>
                  <div className="text-[11px] font-mono text-[var(--text-muted)]">
                    {formatDutyDate(assign.startDate)} - {formatDutyDate(assign.endDate)}
                  </div>
                  <div className="text-[11px] text-emerald-500 font-semibold mt-0.5">
                    {assign.teachers.map(t => t.name).join(', ')}
                  </div>
                </div>
                <div className="text-[10px] font-mono px-2 py-0.5 rounded border border-[var(--card-border)] bg-[var(--code-bg)] text-[var(--text-muted)]">
                  {assign.dutyTitle || 'Campus'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: In-app Confirm Delete Roster */}
      {rosterPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="border border-[var(--card-border)] rounded-3xl max-w-sm w-full p-5 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4 bg-[var(--modal-bg)] text-[var(--text-page)]">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-black text-[var(--text-page)]">Delete Duty Roster?</h3>
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                Are you sure you want to delete <strong>&ldquo;{rosterPendingDelete.name}&rdquo;</strong>? This will permanently remove its <strong>{rosterPendingDelete.totalWeeks} weekly assignments</strong> from your schedule.
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
                className="flex-1 py-2.5 px-3 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-[var(--text-page)]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingRoster}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-mono font-bold shadow-lg shadow-rose-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isDeletingRoster ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Staged Operation Progress Modal */}
      <OperationProgressModal {...opProgress} onClose={opProgress.close} />
    </div>
  );
};
