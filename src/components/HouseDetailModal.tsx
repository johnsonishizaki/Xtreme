import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  Clock,
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

    if (reportedCount > expectedCount) {
      setErrorMessage(`Reported students (${reportedCount}) cannot exceed expected students (${expectedCount}).`);
      return;
    }

    if (reportedCount < 0 || expectedCount < 0) {
      setErrorMessage('Counts cannot be negative numbers.');
      return;
    }

    try {
      setSaving(true);
      const updatedReport: HouseDailyReport = {
        id: `${selectedDate}_${house.id}`,
        termId: activeTerm.id,
        reportingDate: selectedDate,
        houseId: house.id,
        houseName: house.name,
        houseCategory: house.category,
        expectedCount,
        reportedCount,
        notReportedCount: notReportedCalc,
        notReportedDetails: followUpDetails.trim(),
        notes: notes.trim(),
        houseparent: house.assignedHouseparent,
        submittedAt: report ? report.submittedAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: report ? 'corrected' : 'received',
        source: 'manual_correction'
      };

      await saveHouseReport(updatedReport);
      await onRefreshData();
      setIsEditing(false);
      setSuccessMessage('Manual correction saved successfully.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save correction.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="border border-[var(--card-border)] rounded-3xl max-w-lg w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150 bg-[var(--modal-bg)] text-[var(--text-page)] space-y-5 my-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                house.category === 'Boys'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
              }`}>
                {house.category} House &bull; {house.houseCode || house.id}
              </span>
              <span className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-1">
                <Calendar className="w-3 h-3 text-emerald-500" />
                {selectedDate}
              </span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-[var(--text-page)]">
              {house.name}
            </h2>
            <p className="text-xs font-mono text-[var(--text-muted)] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-500" />
              <span>Assigned: {house.assignedHouseparent}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text-subtle)] hover:text-[var(--text-page)] border border-[var(--card-border)] hover:bg-[var(--card-bg-elevated)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Alerts */}
        {errorMessage && (
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Status Badge & Report Receipt Status */}
        <div className="p-3.5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {report ? (
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold">
                <ShieldCheck className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold">
                <AlertTriangle className="w-4 h-4" />
              </div>
            )}
            <div>
              <div className="text-xs font-bold text-[var(--text-page)]">
                {report ? 'Report Received' : 'Report Not Yet Submitted'}
              </div>
              <div className="text-[10px] font-mono text-[var(--text-muted)]">
                {report ? `Source: ${report.source.replace('_', ' ').toUpperCase()}` : 'Awaiting houseparent submission'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs font-mono font-semibold px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:border-emerald-500 text-[var(--text-page)] flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Edit3 className="w-3.5 h-3.5 text-emerald-500" />
            <span>{isEditing ? 'Cancel Edit' : 'Manual Correction'}</span>
          </button>
        </div>

        {/* Numerical Breakdown */}
        {isEditing ? (
          <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400">
              Manual Data Correction Mode
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-1">
                  Expected Students
                </label>
                <input
                  type="number"
                  min="0"
                  value={expectedCount}
                  onChange={e => setExpectedCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)]"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-1">
                  Reported Students
                </label>
                <input
                  type="number"
                  min="0"
                  value={reportedCount}
                  onChange={e => setReportedCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)]"
                />
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex justify-between text-xs font-mono">
              <span className="text-[var(--text-muted)]">Calculated Not Reported:</span>
              <span className="font-bold text-amber-400">{notReportedCalc} students</span>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-1">
                Follow-up Details (Students not yet reported)
              </label>
              <textarea
                rows={2}
                value={followUpDetails}
                onChange={e => setFollowUpDetails(e.target.value)}
                placeholder="e.g. 2 arriving tomorrow, 1 medical leave..."
                className="w-full p-2.5 rounded-xl text-xs font-mono border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)]"
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-[var(--text-muted)] block mb-1">
                General House Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Additional operational notes..."
                className="w-full p-2.5 rounded-xl text-xs font-mono border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)]"
              />
            </div>

            <button
              type="button"
              onClick={handleSaveCorrection}
              disabled={saving}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>Saving to Firestore...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Confirm Manual Correction</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] text-center">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Expected</div>
                <div className="text-xl font-black text-[var(--text-page)] mt-0.5">
                  {report ? report.expectedCount : house.expectedStudentCount}
                </div>
              </div>

              <div className="p-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] text-center">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Reported</div>
                <div className="text-xl font-black text-emerald-400 mt-0.5">
                  {report ? report.reportedCount : 0}
                </div>
              </div>

              <div className="p-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] text-center">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Not Reported</div>
                <div className={`text-xl font-black mt-0.5 ${
                  report && report.notReportedCount > 0 ? 'text-amber-400' : 'text-[var(--text-muted)]'
                }`}>
                  {report ? report.notReportedCount : house.expectedStudentCount}
                </div>
              </div>
            </div>

            {/* Reporting Progress Bar */}
            <div className="space-y-1.5 p-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[var(--text-muted)]">Reporting Progress:</span>
                <span className="font-bold text-emerald-400">{percentage}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, percentage)}%` }}
                />
              </div>
            </div>

            {/* Follow-up Details */}
            {report?.notReportedDetails && (
              <div className="p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-1.5">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Follow-Up Required</span>
                </div>
                <p className="text-xs leading-relaxed text-[var(--text-page)] whitespace-pre-wrap">
                  {report.notReportedDetails}
                </p>
              </div>
            )}

            {/* Notes */}
            {report?.notes && (
              <div className="p-3.5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-1">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">
                  Houseparent Operational Notes
                </div>
                <p className="text-xs leading-relaxed text-[var(--text-page)]">
                  {report.notes}
                </p>
              </div>
            )}

            {/* Metadata Timestamps */}
            {report && (
              <div className="text-[10px] font-mono text-[var(--text-subtle)] space-y-0.5 px-1 pt-1">
                <div>Submitted: {new Date(report.submittedAt).toLocaleString()}</div>
                {report.updatedAt !== report.submittedAt && (
                  <div>Last Updated: {new Date(report.updatedAt).toLocaleString()}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* History For This House */}
        {allReportsForHouse.length > 1 && (
          <div className="pt-2 border-t border-[var(--card-border)] space-y-2">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <History className="w-3 h-3 text-emerald-500" />
              <span>Historical Reporting for {house.name}</span>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {allReportsForHouse.map(hReport => (
                <div
                  key={hReport.id}
                  className="p-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-xs font-mono flex items-center justify-between"
                >
                  <span className="font-bold text-[var(--text-page)]">{hReport.reportingDate}</span>
                  <span className="text-emerald-400">{hReport.reportedCount} / {hReport.expectedCount} reported</span>
                  <span className={hReport.notReportedCount > 0 ? 'text-amber-400' : 'text-[var(--text-muted)]'}>
                    {hReport.notReportedCount} outstanding
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
