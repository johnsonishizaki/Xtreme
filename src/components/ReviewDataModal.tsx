import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  User,
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
      const teachers = next[assignIndex].teachers.filter((_, i) => i !== teacherIndex);
      next[assignIndex] = { ...next[assignIndex], teachers };
      return next;
    });
  };

  // Delete a week
  const handleDeleteRow = (index: number) => {
    setAssignments(prev => prev.filter((_, i) => i !== index));
  };

  // Add new blank week
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

  // Final confirmation to database
  const handleConfirm = async () => {
    if (assignments.length === 0) {
      alert('Please have at least one duty assignment before saving.');
      return;
    }

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

      await onConfirmSave(newRoster, finalAssignments);
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
      <div className="bg-[#0b0b0d] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col mx-auto overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200 text-white">
        
        {/* Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-black/50">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">Review Duty Roster</h2>
              <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-400">
                <span>{assignments.length} duty weeks found</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close review"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] transition-opacity cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Roster Name Field */}
          <div>
            <label className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Roster Name
            </label>
            <input
              type="text"
              value={rosterName}
              onChange={e => setRosterName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 border bg-black/40 border-white/[0.08] text-white"
              placeholder="e.g. Term 3 Duty Schedule 2026"
            />
          </div>

          <div className="text-xs flex items-center justify-between">
            <span className="font-mono uppercase tracking-wider text-[11px] text-slate-400">Weekly Assignments</span>
            <button
              type="button"
              onClick={handleAddWeek}
              className="text-emerald-500 hover:text-emerald-600 font-mono text-xs font-semibold flex items-center gap-1 cursor-pointer"
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
                className="p-3.5 rounded-2xl border space-y-3 bg-black/40 border-white/[0.08] text-white"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-lg font-mono font-bold text-xs flex items-center justify-center bg-white/[0.08] text-slate-300">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={item.weekLabel}
                      onChange={e => handleFieldChange(idx, 'weekLabel', e.target.value)}
                      className="bg-transparent text-xs font-bold border-b border-transparent focus:border-emerald-500 focus:outline-none text-white"
                      placeholder="Week label..."
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    {item.confidence === 'review_needed' ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 font-semibold flex items-center space-x-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>Needs review</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-500 font-semibold">
                        Ready
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteRow(idx)}
                      aria-label="Delete week"
                      className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Dates Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-mono block mb-0.5 text-slate-400">Start Date</label>
                    <input
                      type="date"
                      value={item.startDate}
                      onChange={e => handleFieldChange(idx, 'startDate', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 border bg-black/60 border-white/[0.08] text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono block mb-0.5 text-slate-400">End Date</label>
                    <input
                      type="date"
                      value={item.endDate}
                      onChange={e => handleFieldChange(idx, 'endDate', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 border bg-black/60 border-white/[0.08] text-white"
                    />
                  </div>
                </div>

                {/* Duty Role */}
                <div>
                  <label className="text-[10px] font-mono block mb-0.5 text-slate-400">Duty Area</label>
                  <input
                    type="text"
                    value={item.dutyTitle || ''}
                    onChange={e => handleFieldChange(idx, 'dutyTitle', e.target.value)}
                    placeholder="e.g. Weekly Campus Duty"
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 border bg-black/60 border-white/[0.08] text-white"
                  />
                </div>

                {/* Teachers in this week */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>Teacher(s) on Duty</span>
                    <button
                      type="button"
                      onClick={() => handleAddTeacher(idx)}
                      className="text-emerald-500 hover:text-emerald-600 text-[10px] font-semibold flex items-center space-x-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Teacher</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {item.teachers && item.teachers.map((teacher, tIdx) => (
                      <div key={tIdx} className="flex items-center space-x-2">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          value={teacher.name}
                          onChange={e => handleTeacherNameChange(idx, tIdx, e.target.value)}
                          placeholder="Teacher Name"
                          className="flex-1 px-2.5 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 border bg-black/60 border-white/[0.08] text-white"
                        />
                        {item.teachers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTeacher(idx, tIdx)}
                            className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {item.reviewReason && (
                  <div className="text-[11px] font-mono italic p-2 rounded-lg border bg-amber-500/10 border-amber-500/20 text-amber-400">
                    Note: {item.reviewReason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t flex items-center space-x-3 bg-black/60 border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-3 px-4 rounded-2xl text-xs font-mono font-bold transition-all cursor-pointer border bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSaving}
            className="flex-1 py-3 px-4 rounded-2xl text-xs font-mono font-bold tracking-wide shadow-lg transition-all flex items-center justify-center space-x-2 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black cursor-pointer shadow-emerald-500/20"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-black" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" />
                <span>Save Roster</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
