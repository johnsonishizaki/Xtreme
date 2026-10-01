import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Calendar,
  User,
  Sparkles,
  Save,
  Loader2
} from 'lucide-react';
import { DutyAssignment, ParsedRosterPayload, Roster } from '../types';

interface ReviewDataModalProps {
  parsedData: ParsedRosterPayload;
  onConfirmSave: (roster: Roster, assignments: DutyAssignment[]) => Promise<void>;
  onClose: () => void;
}

export const ReviewDataModal: React.FC<ReviewDataModalProps> = ({
  parsedData,
  onConfirmSave,
  onClose
}) => {
  const [rosterName, setRosterName] = useState<string>(parsedData.rosterName);
  const [assignments, setAssignments] = useState<ParsedRosterPayload['assignments']>(
    parsedData.assignments
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Update specific field in an assignment
  const handleFieldChange = (index: number, field: string, value: any) => {
    setAssignments(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Add teacher to assignment
  const handleAddTeacher = (index: number) => {
    setAssignments(prev => {
      const next = [...prev];
      const teachers = [...(next[index].teachers || []), { name: 'New Teacher' }];
      next[index] = { ...next[index], teachers };
      return next;
    });
  };

  // Update teacher in assignment
  const handleTeacherNameChange = (assignIndex: number, teacherIndex: number, newName: string) => {
    setAssignments(prev => {
      const next = [...prev];
      const teachers = [...next[assignIndex].teachers];
      teachers[teacherIndex] = { ...teachers[teacherIndex], name: newName };
      next[assignIndex] = { ...next[assignIndex], teachers };
      return next;
    });
  };

  // Remove teacher from assignment
  const handleRemoveTeacher = (assignIndex: number, teacherIndex: number) => {
    setAssignments(prev => {
      const next = [...prev];
      const teachers = next[assignIndex].teachers.filter((_, idx) => idx !== teacherIndex);
      next[assignIndex] = { ...next[assignIndex], teachers };
      return next;
    });
  };

  // Delete entire assignment row
  const handleDeleteRow = (index: number) => {
    setAssignments(prev => prev.filter((_, idx) => idx !== index));
  };

  // Add new week row
  const handleAddWeek = () => {
    const today = new Date();
    const start = today.toISOString().split('T')[0];
    const endObj = new Date(today);
    endObj.setDate(today.getDate() + 6);
    const end = endObj.toISOString().split('T')[0];

    setAssignments(prev => [
      ...prev,
      {
        weekLabel: `Duty Week ${prev.length + 1}`,
        startDate: start,
        endDate: end,
        teachers: [{ name: 'Teacher Name' }],
        dutyTitle: 'Weekly Duty',
        confidence: 'high'
      }
    ]);
  };

  // Final confirmation to Firestore
  const handleConfirm = async () => {
    if (assignments.length === 0) {
      alert('Please have at least one duty assignment before saving.');
      return;
    }

    console.log('[RosterSave:Modal] 1. User clicked Confirm & Save Roster.');
    console.log('[RosterSave:Modal] 2. Validating assignments count:', assignments.length);
    setIsSaving(true);

    try {
      const rosterId = `roster-${Date.now()}`;
      const nowIso = new Date().toISOString();

      const newRoster: Roster = {
        id: rosterId,
        name: rosterName.trim() || 'Imported Duty Roster',
        sourceType: parsedData.sourceType,
        totalWeeks: assignments.length,
        uploadedAt: nowIso,
        isActive: true
      };

      const finalAssignments: DutyAssignment[] = assignments.map((item, idx) => ({
        id: `assign-${rosterId}-${idx + 1}`,
        rosterId,
        weekLabel: item.weekLabel || `Week ${idx + 1}`,
        startDate: item.startDate,
        endDate: item.endDate,
        dutyTitle: item.dutyTitle || 'Weekly Duty',
        teachers: item.teachers.map((t, tIdx) => ({
          id: `teacher-${idx + 1}-${tIdx + 1}`,
          name: t.name.trim(),
          role: t.role || ''
        })),
        status: item.confidence === 'review_needed' ? 'needs_review' : 'confirmed',
        confidence: item.confidence,
        notes: item.reviewReason || '',
        createdAt: nowIso,
        updatedAt: nowIso
      }));

      console.log('[RosterSave:Modal] 3. Prepared payload:', {
        rosterId: newRoster.id,
        name: newRoster.name,
        sourceType: newRoster.sourceType,
        totalWeeks: finalAssignments.length
      });
      console.log('[RosterSave:Modal] 4. Awaiting parent onConfirmSave promise resolution...');

      // CRITICAL: Explicitly await the promise resolution chain from App.tsx
      await onConfirmSave(newRoster, finalAssignments);

      console.log('[RosterSave:Modal] 5. onConfirmSave promise resolved successfully. Dismissing ReviewDataModal.');
      onClose();
    } catch (err: any) {
      console.error('[RosterSave:Modal] Error encountered during save:', err);
      alert(`Error saving roster: ${err.message || 'Please check your connection and try again.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col mx-auto overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">Review Duty Roster</h2>
              <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                <span>{assignments.length} duty weeks found</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close review"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Roster Name Field */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Roster Name
            </label>
            <input
              type="text"
              value={rosterName}
              onChange={e => setRosterName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-semibold focus:outline-none focus:border-emerald-500"
              placeholder="e.g. Term 3 Duty Schedule 2026"
            />
          </div>

          <div className="text-xs text-slate-400 flex items-center justify-between">
            <span>Weekly Assignments</span>
            <button
              type="button"
              onClick={handleAddWeek}
              className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Week</span>
            </button>
          </div>

          {/* Assignment Cards */}
          <div className="space-y-3">
            {assignments.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={item.weekLabel}
                      onChange={e => handleFieldChange(idx, 'weekLabel', e.target.value)}
                      className="bg-transparent text-xs font-bold text-white border-b border-transparent focus:border-emerald-500 focus:outline-none"
                      placeholder="Week label..."
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    {item.confidence === 'review_needed' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold flex items-center space-x-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>Needs review</span>
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
                        Ready
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteRow(idx)}
                      aria-label="Delete week"
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Dates Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Start Date</label>
                    <input
                      type="date"
                      value={item.startDate}
                      onChange={e => handleFieldChange(idx, 'startDate', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">End Date</label>
                    <input
                      type="date"
                      value={item.endDate}
                      onChange={e => handleFieldChange(idx, 'endDate', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Duty Role */}
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Duty / Assignment Area</label>
                  <input
                    type="text"
                    value={item.dutyTitle || ''}
                    onChange={e => handleFieldChange(idx, 'dutyTitle', e.target.value)}
                    placeholder="e.g. Weekly Campus Duty"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Teachers in this week */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Teacher(s) on Duty</span>
                    <button
                      type="button"
                      onClick={() => handleAddTeacher(idx)}
                      className="text-emerald-400 hover:text-emerald-300 text-[10px] font-semibold flex items-center space-x-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Teacher</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {item.teachers && item.teachers.map((teacher, tIdx) => (
                      <div key={tIdx} className="flex items-center space-x-2">
                        <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <input
                          type="text"
                          value={teacher.name}
                          onChange={e => handleTeacherNameChange(idx, tIdx, e.target.value)}
                          placeholder="Teacher Name"
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                        {item.teachers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTeacher(idx, tIdx)}
                            className="text-slate-500 hover:text-rose-400 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {item.reviewReason && (
                  <div className="text-[11px] text-amber-400/90 italic bg-amber-500/10 p-2 rounded-lg">
                    Note: {item.reviewReason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 text-xs font-bold transition-all"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSaving}
            className={`flex-1 py-3 px-4 rounded-2xl text-xs font-black tracking-wide shadow-lg transition-all flex items-center justify-center space-x-2 ${
              isSaving
                ? 'bg-emerald-500/80 text-slate-900 cursor-not-allowed shadow-emerald-500/10'
                : 'bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 shadow-emerald-500/20'
            }`}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-slate-950" />
                <span>Saving to Firestore...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" />
                <span>Confirm & Save Roster</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
