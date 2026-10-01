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
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rosterPendingDelete, setRosterPendingDelete] = useState<Roster | null>(null);
  const [isDeletingRoster, setIsDeletingRoster] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // File selection handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);
      setLoadingStep('Reading file...');

      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
        setLoadingStep('Parsing spreadsheet rows...');
        const buffer = await file.arrayBuffer();
        const { parseSpreadsheet } = await import('../services/rosterParser');
        const parsed = await parseSpreadsheet(buffer, file.name);
        onReviewParsedData(parsed);
      } else if (fileName.endsWith('.pdf')) {
        setLoadingStep('Reading PDF document pages...');
        const buffer = await file.arrayBuffer();
        const { parsePdfRoster } = await import('../services/pdfParser');
        const parsed = await parsePdfRoster(buffer, file.name);
        onReviewParsedData(parsed);
      } else if (
        fileName.endsWith('.png') ||
        fileName.endsWith('.jpg') ||
        fileName.endsWith('.jpeg') ||
        fileName.endsWith('.webp') ||
        file.type.startsWith('image/')
      ) {
        setLoadingStep('AI analyzing schedule photo...');
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        const { parseRosterWithAI } = await import('../services/aiParserClient');
        const parsed = await parseRosterWithAI('', file.name, 'image', undefined, base64, file.type || 'image/jpeg');
        onReviewParsedData(parsed);
      } else {
        setLoadingStep('Processing text content with AI...');
        const text = await file.text();
        const { parseRosterWithAI } = await import('../services/aiParserClient');
        const parsed = await parseRosterWithAI(text, file.name, 'csv');
        onReviewParsedData(parsed);
      }
    } catch (err: any) {
      console.error('Error parsing file:', err);
      setErrorMessage(err.message || 'Could not parse this file. Please verify the format.');
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Google Sheet Link Import
  const handleGoogleSheetImport = async () => {
    if (!googleSheetUrl.trim()) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);
      setLoadingStep('Fetching Google Sheet...');
      const { importGoogleSheetFromUrl } = await import('../services/sheetsParser');
      const parsed = await importGoogleSheetFromUrl(googleSheetUrl);
      onReviewParsedData(parsed);
    } catch (err: any) {
      console.error('Google Sheet import failed:', err);
      setErrorMessage(err.message || 'Failed to import Google Sheet. Ensure it is shared publicly.');
    } finally {
      setIsLoading(false);
    }
  };

  // Pasted Text Import
  const handlePastedDataImport = async () => {
    if (!pastedData.trim()) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);
      setLoadingStep('Parsing pasted text...');
      const { parsePastedSheetData } = await import('../services/sheetsParser');
      const parsed = await parsePastedSheetData(pastedData);
      onReviewParsedData(parsed);
    } catch (err: any) {
      console.error('Pasted data parse failed:', err);
      setErrorMessage(err.message || 'Failed to parse pasted text.');
    } finally {
      setIsLoading(false);
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
          <h1 className="text-2xl font-black tracking-tight text-white">
            Manage & Import
          </h1>
        </div>

        {hasSampleRoster ? (
          <button
            type="button"
            onClick={onDeleteSampleRoster}
            className="text-xs text-rose-500 hover:text-rose-600 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl font-mono font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Demo</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onLoadSampleRoster}
            className="text-xs text-amber-600 hover:text-amber-700 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl font-mono font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Load Demo</span>
          </button>
        )}
      </div>

      {/* Import Card */}
      <div className="p-5 rounded-3xl border shadow-xl bg-white/[0.03] border-white/[0.08] text-white backdrop-blur-xl space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-400">
            <Upload className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Import Duty Schedule</h2>
            <p className="text-xs text-slate-400">
              Upload Excel, CSV, PDF, or a photo/picture of the roster
            </p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl border bg-black/40 border-white/[0.08]">
          <button
            type="button"
            onClick={() => { setActiveImportTab('file'); setErrorMessage(null); }}
            className={`py-2 px-2 text-xs font-mono font-semibold rounded-xl transition-all cursor-pointer ${
              activeImportTab === 'file'
                ? 'bg-emerald-500 text-black shadow-md'
                : 'text-slate-400 hover:text-white'
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
                : 'text-slate-400 hover:text-white'
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
                : 'text-slate-400 hover:text-white'
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

        {/* Loading Spinner */}
        {isLoading && (
          <div className="p-5 rounded-2xl border text-center space-y-2 bg-black/50 border-emerald-500/30 text-white">
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin mx-auto" />
            <div className="text-xs font-bold">{loadingStep}</div>
            <p className="text-[11px] text-slate-400">
              Analyzing table structure & identifying teachers...
            </p>
          </div>
        )}

        {/* Tab 1: File Upload */}
        {activeImportTab === 'file' && !isLoading && (
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
              className="w-full border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer group active:scale-[0.99] border-slate-700 hover:border-emerald-500/60 bg-black/30 hover:bg-black/50"
            >
              <div className="flex items-center justify-center gap-3 mb-2">
                <FileSpreadsheet className="w-8 h-8 transition-colors text-slate-500 group-hover:text-emerald-400" />
                <Camera className="w-8 h-8 transition-colors text-slate-500 group-hover:text-teal-400" />
              </div>
              <div className="text-sm font-bold mb-1 text-white">
                Tap to choose file or photo
              </div>
              <p className="text-xs text-slate-400">
                Supports Excel (.xlsx, .xls), CSV, PDF, or Camera/Roster Photos
              </p>
            </button>
          </div>
        )}

        {/* Tab 2: Google Sheet */}
        {activeImportTab === 'sheets' && !isLoading && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-mono font-bold uppercase tracking-wider block mb-1 text-slate-400">
                Google Sheet Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={googleSheetUrl}
                  onChange={e => setGoogleSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 px-3 py-2.5 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 border bg-black/40 border-white/[0.08] text-white"
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
            <p className="text-[11px] leading-relaxed text-slate-400">
              Make sure the sheet&rsquo;s sharing setting is set to <strong>&ldquo;Anyone with the link can view&rdquo;</strong>.
            </p>
          </div>
        )}

        {/* Tab 3: Paste Text */}
        {activeImportTab === 'paste' && !isLoading && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-mono font-bold uppercase tracking-wider block mb-1 text-slate-400">
                Paste Spreadsheet Rows or CSV
              </label>
              <textarea
                value={pastedData}
                onChange={e => setPastedData(e.target.value)}
                rows={5}
                placeholder="Copy cells from Excel or Google Sheets and paste here..."
                className="w-full p-3 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none border bg-black/40 border-white/[0.08] text-white"
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
        <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
          <span>Loaded Rosters ({rosters.length})</span>
        </div>

        {rosters.length === 0 ? (
          <div className="p-6 rounded-2xl border text-center text-xs bg-slate-900/50 border-slate-800 text-slate-400">
            No rosters loaded yet. Upload one above or tap &ldquo;Load Demo&rdquo;.
          </div>
        ) : (
          rosters.map(roster => (
            <div
              key={roster.id}
              className={`p-4 rounded-2xl border transition-all ${
                roster.isActive
                  ? 'bg-white/[0.04] border-emerald-500/50 shadow-lg text-white'
                  : 'bg-white/[0.02] border-white/[0.06] text-slate-300 hover:border-white/[0.12]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                    roster.isActive
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-white/[0.04] text-slate-400'
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
                      <span className="text-xs font-bold truncate text-white">
                        {roster.name}
                      </span>
                      {roster.sourceType === 'sample' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-amber-500/20 text-amber-300">
                          Demo
                        </span>
                      )}
                      {roster.isActive && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-emerald-500/20 text-emerald-400">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono mt-0.5 text-slate-400">
                      {roster.totalWeeks} weekly assignments
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {!roster.isActive && (
                    <button
                      type="button"
                      onClick={() => handleSetActive(roster.id)}
                      className="text-[11px] font-mono font-semibold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300"
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRosterPendingDelete(roster)}
                    aria-label={`Delete ${roster.name}`}
                    title="Delete roster"
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-500/10 transition-all cursor-pointer"
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
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
            All Duty Schedule Periods ({assignments.length})
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {assignments.map((assign, idx) => (
              <div
                key={assign.id}
                className="p-3 rounded-xl border text-xs flex items-center justify-between bg-white/[0.03] border-white/[0.08] text-slate-200"
              >
                <div>
                  <div className="font-bold text-slate-100">
                    {assign.weekLabel || `Week ${idx + 1}`}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    {formatDutyDate(assign.startDate)} - {formatDutyDate(assign.endDate)}
                  </div>
                  <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                    {assign.teachers.map(t => t.name).join(', ')}
                  </div>
                </div>
                <div className="text-[10px] font-mono px-2 py-0.5 rounded border bg-black/40 text-slate-300 border-white/[0.08]">
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
          <div className="border rounded-3xl max-w-sm w-full p-5 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4 bg-[#0b0b0d] border-white/[0.08] text-white">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-black text-white">Delete Duty Roster?</h3>
              <p className="text-xs leading-relaxed text-slate-400">
                Are you sure you want to delete <strong>&ldquo;{rosterPendingDelete.name}&rdquo;</strong>? This will permanently remove its <strong>{rosterPendingDelete.totalWeeks} weekly assignments</strong> from your schedule.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setRosterPendingDelete(null)}
                disabled={isDeletingRoster}
                className="flex-1 py-2.5 px-3 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border-white/[0.08]"
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
    </div>
  );
};
