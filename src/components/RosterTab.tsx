import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Link,
  Sparkles,
  CheckCircle2,
  Trash2,
  AlertCircle,
  FileText,
  Calendar,
  Layers,
  FileCode,
  Loader2,
  ExternalLink,
  Camera
} from 'lucide-react';
import { Roster, DutyAssignment, ParsedRosterPayload, AppSettings } from '../types';
import { parseSpreadsheet } from '../services/rosterParser';
import { parsePdfRoster } from '../services/pdfParser';
import { importGoogleSheetFromUrl, parsePastedSheetData } from '../services/sheetsParser';
import { parseRosterWithAI } from '../services/aiParserClient';
import { deleteRoster, saveRosterWithAssignments, setActiveRoster } from '../services/firebase';
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
  settings,
  onUpdateSettings,
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

    setIsLoading(true);
    setErrorMessage(null);
    setLoadingStep('Reading file contents...');

    try {
      const fileName = file.name;
      const lower = fileName.toLowerCase();
      const arrayBuffer = await file.arrayBuffer();

      let result: ParsedRosterPayload;

      if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
        setLoadingStep('Parsing spreadsheet table...');
        result = await parseSpreadsheet(arrayBuffer, fileName);
      } else if (lower.endsWith('.pdf')) {
        setLoadingStep('Extracting PDF text lines...');
        result = await parsePdfRoster(arrayBuffer, fileName);
      } else if (
        lower.endsWith('.png') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.webp') ||
        file.type.startsWith('image/')
      ) {
        setLoadingStep('Analyzing roster image with Gemini AI...');
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const b64 = dataUrl.split(',')[1] || '';
            resolve(b64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        result = await parseRosterWithAI('', fileName, 'image', undefined, base64Data, file.type || 'image/jpeg');
      } else if (lower.endsWith('.txt') || lower.endsWith('.tsv')) {
        setLoadingStep('Parsing text data...');
        const text = new TextDecoder().decode(arrayBuffer);
        result = await parsePastedSheetData(text, fileName.replace(/\.[^/.]+$/, ''));
      } else {
        throw new Error('Unsupported file type. Please upload Excel (.xlsx, .xls), CSV, PDF, or a photo/image (.png, .jpg)');
      }

      onReviewParsedData(result);
    } catch (err: any) {
      console.error('File parsing error:', err);
      setErrorMessage(err.message || 'Failed to read file.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Google sheet URL import
  const handleGoogleSheetImport = async () => {
    if (!googleSheetUrl.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);
    setLoadingStep('Fetching Google Sheet data...');

    try {
      const result = await importGoogleSheetFromUrl(googleSheetUrl);
      onReviewParsedData(result);
      
      // Save Google Sheet URL to settings for automated background checks
      await onUpdateSettings({
        ...settings,
        googleSheetUrl: googleSheetUrl,
        lastSyncHash: '' // reset so next background sync populates it properly
      });
      
      setGoogleSheetUrl('');
    } catch (err: any) {
      console.error('Google Sheet import error:', err);
      setErrorMessage(err.message || 'Failed to fetch Google Sheet.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  // Pasted data import
  const handlePastedDataImport = async () => {
    if (!pastedData.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);
    setLoadingStep('Interpreting pasted table...');

    try {
      const result = await parsePastedSheetData(pastedData, 'Pasted Roster');
      onReviewParsedData(result);
      setPastedData('');
    } catch (err: any) {
      console.error('Pasted table parse error:', err);
      setErrorMessage(err.message || 'Failed to parse pasted table.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  // Delete roster confirm handler
  const handleConfirmDelete = async () => {
    if (!rosterPendingDelete) return;
    setIsDeletingRoster(true);
    try {
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

  // Sample roster detection
  const hasSampleRoster = rosters.some(r => r.sourceType === 'sample');

  return (
    <div className="max-w-md mx-auto px-4 py-4 space-y-5 pb-24">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Duty Rosters
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">
            Manage & Import
          </h1>
        </div>

        {hasSampleRoster ? (
          <button
            type="button"
            onClick={onDeleteSampleRoster}
            className="text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-xl font-semibold flex items-center space-x-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Demo Data</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onLoadSampleRoster}
            className="text-xs text-amber-300 hover:text-amber-200 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-xl font-semibold flex items-center space-x-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Load Demo Roster</span>
          </button>
        )}
      </div>

      {/* Import Card */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
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
        <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => { setActiveImportTab('file'); setErrorMessage(null); }}
            className={`py-2 px-2 text-xs font-semibold rounded-xl transition-all ${
              activeImportTab === 'file'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            File / Photo
          </button>
          <button
            type="button"
            onClick={() => { setActiveImportTab('sheets'); setErrorMessage(null); }}
            className={`py-2 px-2 text-xs font-semibold rounded-xl transition-all ${
              activeImportTab === 'sheets'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Google Sheet
          </button>
          <button
            type="button"
            onClick={() => { setActiveImportTab('paste'); setErrorMessage(null); }}
            className={`py-2 px-2 text-xs font-semibold rounded-xl transition-all ${
              activeImportTab === 'paste'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Paste Text
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Loading Spinner */}
        {isLoading && (
          <div className="p-5 rounded-2xl bg-slate-950 border border-emerald-500/30 text-center space-y-2">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin mx-auto" />
            <div className="text-xs font-bold text-white">{loadingStep}</div>
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
              className="w-full border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-2xl p-6 text-center transition-all bg-slate-950/40 hover:bg-slate-950/80 group active:scale-[0.99]"
            >
              <div className="flex items-center justify-center space-x-3 mb-2">
                <FileSpreadsheet className="w-8 h-8 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                <Camera className="w-8 h-8 text-slate-500 group-hover:text-teal-400 transition-colors" />
              </div>
              <div className="text-sm font-bold text-white mb-1">
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
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Google Sheet Link
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="url"
                  value={googleSheetUrl}
                  onChange={e => setGoogleSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleGoogleSheetImport}
                  disabled={!googleSheetUrl.trim()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition-all shrink-0"
                >
                  Import
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Make sure the sheet's sharing setting is set to <strong className="text-slate-300">"Anyone with the link can view"</strong>.
            </p>
          </div>
        )}

        {/* Tab 3: Paste Text */}
        {activeImportTab === 'paste' && !isLoading && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Paste Spreadsheet Rows or CSV
              </label>
              <textarea
                value={pastedData}
                onChange={e => setPastedData(e.target.value)}
                rows={5}
                placeholder="Copy cells from Excel or Google Sheets and paste here..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 resize-none font-mono"
              />
            </div>
            <button
              type="button"
              onClick={handlePastedDataImport}
              disabled={!pastedData.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition-all"
            >
              Parse Pasted Content
            </button>
          </div>
        )}
      </div>

      {/* Loaded Rosters List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
          <span>Loaded Rosters ({rosters.length})</span>
        </div>

        {rosters.length === 0 ? (
          <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400">
            No rosters loaded yet. Upload one above or tap "Load Demo Roster".
          </div>
        ) : (
          rosters.map(roster => (
            <div
              key={roster.id}
              className={`p-3.5 rounded-2xl border transition-all ${
                roster.isActive
                  ? 'bg-slate-900 border-emerald-500/50 shadow-lg shadow-emerald-950/20'
                  : 'bg-slate-900/60 border-slate-800 opacity-70 hover:opacity-100'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                    roster.isActive
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {roster.sourceType === 'pdf' ? (
                      <FileText className="w-4 h-4" />
                    ) : roster.sourceType === 'sample' ? (
                      <Sparkles className="w-4 h-4 text-amber-400" />
                    ) : (
                      <FileSpreadsheet className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-bold text-white truncate">
                        {roster.name}
                      </span>
                      {roster.sourceType === 'sample' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                          Demo
                        </span>
                      )}
                      {roster.isActive && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {roster.totalWeeks} weekly assignments
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                  {!roster.isActive && (
                    <button
                      type="button"
                      onClick={() => handleSetActive(roster.id)}
                      className="text-[11px] font-semibold text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-all border border-slate-700/60"
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRosterPendingDelete(roster)}
                    aria-label={`Delete ${roster.name}`}
                    title="Delete roster"
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-all"
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
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            All Duty Schedule Periods ({assignments.length})
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {assignments.map((assign, idx) => (
              <div
                key={assign.id}
                className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-slate-200">
                    {assign.weekLabel || `Week ${idx + 1}`}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {formatDutyDate(assign.startDate)} - {formatDutyDate(assign.endDate)}
                  </div>
                  <div className="text-[11px] text-emerald-400/90 font-medium mt-0.5">
                    {assign.teachers.map(t => t.name).join(', ')}
                  </div>
                </div>
                <div className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {assign.dutyTitle || 'Campus'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: In-app Confirm Delete Roster */}
      {rosterPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-black text-white">Delete Duty Roster?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Are you sure you want to delete <strong className="text-slate-200">"{rosterPendingDelete.name}"</strong>? This will permanently remove its <strong className="text-slate-200">{rosterPendingDelete.totalWeeks} weekly assignments</strong> from your schedule.
              </p>
            </div>

            <div className="flex items-center space-x-2.5 pt-1">
              <button
                type="button"
                onClick={() => setRosterPendingDelete(null)}
                disabled={isDeletingRoster}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-bold transition-all"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingRoster}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-black shadow-lg shadow-rose-500/20 transition-all flex items-center justify-center space-x-1.5"
              >
                {isDeletingRoster ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Roster</span>
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
