import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Users,
  Calendar,
  Send,
  Plus,
  Minus,
  Copy,
  ChevronDown,
  Loader2,
  Radio,
  ExternalLink
} from 'lucide-react';
import { HouseConfig, AcademicTerm, HouseDailyReport } from '../types';
import { saveHouseReport } from '../services/firebase';
import { copyToClipboard } from '../services/messageGenerator';

interface UniversalHouseparentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  houses: HouseConfig[];
  activeTerm: AcademicTerm;
  initialHouseId?: string;
  initialDate?: string;
  onReportSubmitted: () => Promise<void>;
  onOpenWhatsAppShare?: (houseId: string, date: string) => void;
}

export const UniversalHouseparentFormModal: React.FC<UniversalHouseparentFormModalProps> = ({
  isOpen,
  onClose,
  houses,
  activeTerm,
  initialHouseId,
  initialDate,
  onReportSubmitted,
  onOpenWhatsAppShare
}) => {
  const [selectedHouseId, setSelectedHouseId] = useState<string>(
    initialHouseId || houses[0]?.id || 'house-1'
  );
  const [reportingDate, setReportingDate] = useState<string>(
    initialDate || new Date().toISOString().split('T')[0]
  );
  const [reportedCount, setReportedCount] = useState<number>(0);
  const [notReportedDetails, setNotReportedDetails] = useState<string>('');
  const [submittedReport, setSubmittedReport] = useState<HouseDailyReport | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentHouse = houses.find(h => h.id === selectedHouseId) || houses[0];
  const expectedCount = currentHouse?.expectedStudentCount || 100;
  const notReportedCalc = Math.max(0, expectedCount - reportedCount);
  const percentage = expectedCount > 0 ? ((reportedCount / expectedCount) * 100).toFixed(1) : '0';

  // Synchronize state when initial props change
  useEffect(() => {
    if (initialHouseId) {
      setSelectedHouseId(initialHouseId);
    }
  }, [initialHouseId]);

  useEffect(() => {
    if (initialDate) {
      setReportingDate(initialDate);
    }
  }, [initialDate]);

  // When changing house, initialize reported count to expected or 0
  useEffect(() => {
    if (currentHouse && !submittedReport) {
      setReportedCount(currentHouse.expectedStudentCount);
    }
  }, [selectedHouseId]);

  if (!isOpen) return null;

  const handleStepCount = (delta: number) => {
    setReportedCount(prev => Math.max(0, Math.min(expectedCount * 1.5, prev + delta)));
  };

  const handleSetFullAttendance = () => {
    setReportedCount(expectedCount);
    setNotReportedDetails('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHouse) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const safeExpected = Math.max(0, Number(expectedCount) || 0);
      const safeReported = Math.max(0, Number(reportedCount) || 0);
      const safeNotReported = Math.max(0, safeExpected - safeReported);

      const reportPayload: HouseDailyReport = {
        id: `${reportingDate}_${currentHouse.id}`,
        termId: activeTerm.id,
        reportingDate,
        houseId: currentHouse.id,
        houseName: currentHouse.name,
        houseCategory: currentHouse.category,
        expectedCount: safeExpected,
        reportedCount: safeReported,
        notReportedCount: safeNotReported,
        notReportedDetails: notReportedDetails.trim(),
        houseparent: currentHouse.assignedHouseparent,
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'received',
        source: 'universal_form'
      };

      await saveHouseReport(reportPayload);
      await onReportSubmitted();
      setSubmittedReport(reportPayload);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyDirectFormLink = async () => {
    const link = `https://tally.so/r/2jBVWA?House=${encodeURIComponent(currentHouse.name)}&Date=${reportingDate}`;
    await copyToClipboard(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleResetForAnother = () => {
    setSubmittedReport(null);
    setNotReportedDetails('');
    const nextIdx = (houses.findIndex(h => h.id === selectedHouseId) + 1) % houses.length;
    setSelectedHouseId(houses[nextIdx]?.id || houses[0].id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="border border-[var(--card-border)] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl bg-[var(--modal-bg)] text-[var(--text-page)] space-y-4 my-6 text-left">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--card-border-subtle)] pb-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-page)]">
              House Report Form
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {activeTerm.termName} &bull; Universal for all 8 Houses
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-page)] hover:bg-[var(--card-bg-elevated)] cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {errorMsg}
          </div>
        )}

        {/* SUBMISSION RECEIPT */}
        {submittedReport ? (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-1.5">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <h3 className="text-base font-bold text-emerald-400">
                Report Submitted!
              </h3>
              <p className="text-xs text-[var(--text-page)]">
                Recorded for <strong>{submittedReport.houseName}</strong> ({submittedReport.reportingDate}).
              </p>
            </div>

            <div className="p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] space-y-2 text-xs">
              <div className="flex justify-between border-b border-[var(--card-border-subtle)] pb-1.5">
                <span className="text-[var(--text-muted)]">Students Reported:</span>
                <span className="font-bold text-emerald-400">
                  {submittedReport.reportedCount} / {submittedReport.expectedCount}
                </span>
              </div>
              <div className="flex justify-between border-b border-[var(--card-border-subtle)] pb-1.5">
                <span className="text-[var(--text-muted)]">Not Reported:</span>
                <span className={`font-medium ${submittedReport.notReportedCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {submittedReport.notReportedCount} students
                </span>
              </div>
              {submittedReport.notReportedDetails && (
                <div className="pt-1">
                  <span className="text-[10px] text-[var(--text-muted)] block mb-0.5">Notes:</span>
                  <div className="text-[11px] text-[var(--text-page)] whitespace-pre-wrap">
                    {submittedReport.notReportedDetails}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1">
              {onOpenWhatsAppShare && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenWhatsAppShare(submittedReport.houseId, submittedReport.reportingDate);
                    onClose();
                  }}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send WhatsApp Update</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleResetForAnother}
                  className="py-2 px-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-xs font-medium text-[var(--text-page)] cursor-pointer"
                >
                  Log Another
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2 px-3 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] text-xs font-medium text-[var(--text-page)] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ACTIVE FORM */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tally Quick Link Banner */}
            <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-400">
                <Radio className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium">Direct Tally link</span>
              </div>
              <a
                href={`https://tally.so/r/2jBVWA?House=${encodeURIComponent(currentHouse?.name || '')}&Date=${reportingDate}`}
                target="_blank"
                rel="noreferrer"
                className="py-1 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-semibold text-[11px] flex items-center gap-1 transition-colors"
              >
                <span>Open in Tally</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* House Target */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-[var(--text-page)]">House</label>
                <span className="text-[11px] text-[var(--text-muted)]">Quota: {expectedCount}</span>
              </div>
              <div className="relative">
                <select
                  value={selectedHouseId}
                  onChange={e => setSelectedHouseId(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-xs font-medium text-[var(--text-page)] focus:border-emerald-500 outline-none appearance-none cursor-pointer"
                >
                  <optgroup label="Boys Houses">
                    {houses.filter(h => h.category === 'Boys').map(h => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.assignedHouseparent})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Girls Houses">
                    {houses.filter(h => h.category === 'Girls').map(h => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.assignedHouseparent})
                      </option>
                    ))}
                  </optgroup>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Date */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--text-page)]">Date</label>
              <input
                type="date"
                value={reportingDate}
                onChange={e => setReportingDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-xs text-[var(--text-page)] focus:border-emerald-500 outline-none cursor-pointer"
              />
            </div>

            {/* Students Reporting */}
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[var(--text-page)]">
                  Students Reporting
                </label>
                <button
                  type="button"
                  onClick={handleSetFullAttendance}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer"
                >
                  Full House ({expectedCount})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStepCount(-1)}
                  className="w-10 h-10 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-sm font-bold text-[var(--text-page)] flex items-center justify-center cursor-pointer active:scale-95"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <input
                  type="number"
                  min="0"
                  value={reportedCount}
                  onChange={e => setReportedCount(Number(e.target.value))}
                  required
                  className="flex-1 text-center py-2 rounded-xl text-2xl font-bold border border-emerald-500/40 focus:border-emerald-500 bg-[var(--input-bg)] text-emerald-400 outline-none"
                  placeholder="0"
                />

                <button
                  type="button"
                  onClick={() => handleStepCount(1)}
                  className="w-10 h-10 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-sm font-bold text-[var(--text-page)] flex items-center justify-center cursor-pointer active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="flex justify-between text-xs text-[var(--text-muted)] pt-0.5">
                <span>Rate: <strong className="text-emerald-400">{percentage}%</strong></span>
                <span>Not reported: <strong className={notReportedCalc > 0 ? 'text-amber-400' : 'text-emerald-400'}>{notReportedCalc}</strong></span>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs text-[var(--text-muted)]">
                Absence details / notes (optional)
              </label>
              <textarea
                rows={2}
                value={notReportedDetails}
                onChange={e => setNotReportedDetails(e.target.value)}
                placeholder="e.g. 2 arriving tomorrow on bus; 1 on medical leave..."
                className="w-full p-2.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-xs text-[var(--text-page)] focus:border-emerald-500 outline-none"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50 transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Report</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
