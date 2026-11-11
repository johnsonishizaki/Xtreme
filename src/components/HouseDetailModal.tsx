import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  Edit3,
  Save,
  CheckCircle2,
  Calendar,
  User,
  History,
  Loader2
} from 'lucide-react';
import { HouseConfig, HouseDailyReport, AcademicTerm } from '../types';
import { saveHouseReport } from '../services/firebase';

interface HouseDetailModalProps {
  house: HouseConfig;
  report: HouseDailyReport | null;
  selectedDate: string;
  activeTerm: AcademicTerm;
  allReportsForHouse: HouseDailyReport[];
  onClose: () => void;
  onRefreshData: () => Promise<void>;
}

export const HouseDetailModal: React.FC<HouseDetailModalProps> = ({
  house,
  report,
  selectedDate,
  activeTerm,
  allReportsForHouse,
  onClose,
  onRefreshData
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [reportedCount, setReportedCount] = useState<number>(report ? report.reportedCount : 0);
  const [expectedCount, setExpectedCount] = useState<number>(report ? report.expectedCount : house.expectedStudentCount);
  const [followUpDetails, setFollowUpDetails] = useState<string>(report?.notReportedDetails || '');
  const [notes, setNotes] = useState<string>(report?.notes || '');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const notReportedCalc = Math.max(0, expectedCount - reportedCount);
  const percentage = expectedCount > 0 ? Number(((reportedCount / expectedCount) * 100).toFixed(1)) : 0;

  const handleSaveCorrection = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (reportedCount < 0 || expectedCount < 0) {
      setErrorMessage('Counts must be non-negative numbers.');
      return;
    }

    try {
      setSaving(true);
      const safeExpected = Math.max(0, Number(expectedCount) || 0);
      const safeReported = Math.max(0, Number(reportedCount) || 0);
      const safeNotReported = Math.max(0, safeExpected - safeReported);

      const updatedReport: HouseDailyReport = {
        id: `${selectedDate}_${house.id}`,
        termId: activeTerm.id,
        reportingDate: selectedDate,
        houseId: house.id,
        houseName: house.name,
        houseCategory: house.category,
        expectedCount: safeExpected,
        reportedCount: safeReported,
        notReportedCount: safeNotReported,
        notReportedDetails: followUpDetails.trim(),
        notes: notes.trim(),
        houseparent: house.assignedHouseparent,
        submittedAt: report ? report.submittedAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: safeNotReported === 0 ? 'complete' : 'follow_up_needed',
        source: 'manual_correction'
      };

      await saveHouseReport(updatedReport);
      await onRefreshData();

      setIsEditing(false);
      setSuccessMessage('Student count updated.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save correction.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="border border-[var(--card-border)] rounded-2xl max-w-md w-full p-5 shadow-2xl bg-[var(--modal-bg)] text-[var(--text-page)] space-y-4 my-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span className="font-medium text-emerald-500">{house.category} House</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {selectedDate}
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-page)] mt-0.5">
              {house.name}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
              <User className="w-3 h-3 text-emerald-500" />
              <span>Assigned: {house.assignedHouseparent}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-page)] hover:bg-[var(--card-bg-elevated)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Alerts */}
        {errorMessage && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Status & Edit Toggle */}
        <div className="p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            {report ? (
              <span className="font-medium text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Report received</span>
              </span>
            ) : (
              <span className="font-medium text-amber-500 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Not yet reported</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs font-medium px-2.5 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:text-emerald-500 text-[var(--text-page)] flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Edit3 className="w-3 h-3" />
            <span>{isEditing ? 'Cancel' : 'Edit Count'}</span>
          </button>
        </div>

        {/* Numerical Breakdown */}
        {isEditing ? (
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-500">Edit Student Attendance</span>
              <span className="text-[var(--text-muted)]">Quota: {expectedCount}</span>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-page)] block">Reported Today</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={reportedCount}
                  onChange={e => setReportedCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl text-base font-bold border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] outline-none focus:border-emerald-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-[var(--text-muted)]">
                  / {expectedCount}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1 text-xs text-[var(--text-muted)]">
                <span>Not Reported:</span>
                <span className="font-semibold text-amber-500">{notReportedCalc}</span>
              </div>
            </div>

            <div>
              <label className="text-xs text-[var(--text-page)] block mb-1">
                Follow-up Details (Optional)
              </label>
              <textarea
                rows={2}
                value={followUpDetails}
                onChange={e => setFollowUpDetails(e.target.value)}
                placeholder="e.g. 2 arriving tomorrow, 1 medical leave..."
                className="w-full p-2.5 rounded-xl text-xs border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs text-[var(--text-page)] block mb-1">
                Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional house notes..."
                className="w-full p-2.5 rounded-xl text-xs border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="button"
              onClick={handleSaveCorrection}
              disabled={saving}
              className="w-full py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Correction</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-center">
                <div className="text-[11px] text-[var(--text-muted)]">Expected</div>
                <div className="text-lg font-bold text-[var(--text-page)] mt-0.5">
                  {report ? report.expectedCount : house.expectedStudentCount}
                </div>
              </div>

              <div className="p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-center">
                <div className="text-[11px] text-[var(--text-muted)]">Reported</div>
                <div className="text-lg font-bold text-emerald-500 mt-0.5">
                  {report ? report.reportedCount : 0}
                </div>
              </div>

              <div className="p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-center">
                <div className="text-[11px] text-[var(--text-muted)]">Missing</div>
                <div className={`text-lg font-bold mt-0.5 ${
                  report && report.notReportedCount > 0 ? 'text-amber-500' : 'text-[var(--text-muted)]'
                }`}>
                  {report ? report.notReportedCount : house.expectedStudentCount}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, percentage)}%` }}
              />
            </div>

            {/* Follow-up Details */}
            {report?.notReportedDetails && (
              <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-1">
                <div className="text-xs font-semibold text-amber-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Follow-Up Notes</span>
                </div>
                <p className="text-xs text-[var(--text-page)] whitespace-pre-wrap">
                  {report.notReportedDetails}
                </p>
              </div>
            )}

            {/* Notes */}
            {report?.notes && (
              <div className="p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-1">
                <div className="text-xs font-semibold text-[var(--text-muted)]">
                  Notes
                </div>
                <p className="text-xs text-[var(--text-page)]">
                  {report.notes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* History For This House */}
        {allReportsForHouse.length > 1 && (
          <div className="pt-2 border-t border-[var(--card-border)] space-y-1.5">
            <div className="text-xs font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
              <History className="w-3 h-3 text-emerald-500" />
              <span>Prior Reports</span>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
              {allReportsForHouse.map(hReport => (
                <div
                  key={hReport.id}
                  className="p-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-xs flex items-center justify-between"
                >
                  <span className="font-medium text-[var(--text-page)]">{hReport.reportingDate}</span>
                  <span className="text-emerald-500">{hReport.reportedCount} / {hReport.expectedCount}</span>
                  <span className={hReport.notReportedCount > 0 ? 'text-amber-500' : 'text-[var(--text-muted)]'}>
                    {hReport.notReportedCount > 0 ? `${hReport.notReportedCount} missing` : 'Full'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
