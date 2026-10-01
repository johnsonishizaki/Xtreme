import React, { useState, useEffect, useMemo } from 'react';
import {
  Copy,
  ExternalLink,
  CheckCircle2,
  Calendar,
  Sparkles,
  FileSpreadsheet,
  Edit3,
  RotateCcw,
  Send,
  Check
} from 'lucide-react';
import { DutyAssignment, Roster, AppSettings, SendHistory, DutyTeacher } from '../types';
import {
  generateAnnouncementMessage,
  copyToClipboard,
  openWhatsApp,
  formatDutyDate
} from '../services/messageGenerator';
import { recordSendHistory } from '../services/firebase';
import { getDutyBadgeConfig } from '../services/dutyBadgeHelper';

interface HomeScreenProps {
  rosters: Roster[];
  assignments: DutyAssignment[];
  settings: AppSettings;
  sendHistory: SendHistory[];
  onOpenRosterModal: () => void;
  onRefreshHistory: () => Promise<void>;
  onLoadSampleRoster: () => Promise<void>;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  rosters,
  assignments,
  settings,
  sendHistory,
  onOpenRosterModal,
  onRefreshHistory,
  onLoadSampleRoster
}) => {
  const activeRoster = useMemo(() => rosters.find(r => r.isActive) || rosters[0] || null, [rosters]);

  // Today's date in YYYY-MM-DD
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Filter assignments by active roster
  const activeAssignments = useMemo(() => {
    if (!activeRoster) return assignments;
    const rosterSpecific = assignments.filter(a => a.rosterId === activeRoster.id);
    return rosterSpecific.length > 0 ? rosterSpecific : assignments;
  }, [assignments, activeRoster]);

  // Sorted assignments by start date
  const sortedAssignments = useMemo(() => {
    return [...activeAssignments].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [activeAssignments]);

  // Find index of current active week
  const currentWeekIdx = useMemo(() => {
    if (sortedAssignments.length === 0) return -1;
    const idx = sortedAssignments.findIndex(
      a => todayStr >= a.startDate && todayStr <= a.endDate
    );
    if (idx !== -1) return idx;
    const upcoming = sortedAssignments.findIndex(a => a.startDate > todayStr);
    if (upcoming !== -1) return upcoming;
    return 0;
  }, [sortedAssignments, todayStr]);

  // Find index of coming week (next week)
  const comingWeekIdx = useMemo(() => {
    if (currentWeekIdx === -1) return -1;
    if (currentWeekIdx + 1 < sortedAssignments.length) {
      return currentWeekIdx + 1;
    }
    return currentWeekIdx;
  }, [currentWeekIdx, sortedAssignments.length]);

  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // AUTOMATION: Automatically select the relevant week for a busy user!
  // On Friday, Saturday, or Sunday, automatically show the Coming Week so the announcement is instantly ready.
  useEffect(() => {
    if (sortedAssignments.length === 0) {
      setSelectedIndex(0);
      return;
    }
    const day = new Date().getDay();
    if ((day === 0 || day === 5 || day === 6) && comingWeekIdx !== -1) {
      setSelectedIndex(comingWeekIdx);
    } else if (currentWeekIdx !== -1) {
      setSelectedIndex(currentWeekIdx);
    } else {
      setSelectedIndex(0);
    }
  }, [activeRoster?.id, currentWeekIdx, comingWeekIdx, sortedAssignments.length]);

  const safeIndex = selectedIndex >= sortedAssignments.length ? 0 : selectedIndex;
  const currentAssignment: DutyAssignment | null = sortedAssignments[safeIndex] || null;

  // Track message text & states
  const [editedMessage, setEditedMessage] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);
  const [justDone, setJustDone] = useState<boolean>(false);

  // Auto-generate message when assignment updates
  useEffect(() => {
    if (currentAssignment) {
      const generated = generateAnnouncementMessage(settings.messageTemplate, currentAssignment);
      setEditedMessage(generated);
      setIsEditing(false);
      setCopiedNotification(false);
      setJustDone(false);
    } else {
      setEditedMessage('');
    }
  }, [currentAssignment, settings.messageTemplate]);

  // Check if this week's announcement is already sent/done
  const isAlreadyDone = useMemo(() => {
    if (!currentAssignment) return false;
    return (
      justDone ||
      sendHistory.some(
        h => h.assignmentId === currentAssignment.id && (h.status === 'sent_confirmed' || h.status === 'copied')
      )
    );
  }, [currentAssignment, sendHistory, justDone]);

  // ONE-TAP SEND flow: Copies message, marks as done, and immediately opens WhatsApp
  const handleOneTapSend = async () => {
    if (!editedMessage || !currentAssignment) return;

    // 1. Copy to clipboard
    await copyToClipboard(editedMessage);
    setCopiedNotification(true);
    setJustDone(true);

    // 2. Automatically record in send history
    const historyItem: SendHistory = {
      id: `auto-${Date.now()}`,
      assignmentId: currentAssignment.id,
      weekLabel: currentAssignment.weekLabel,
      dutyPeriod: `${formatDutyDate(currentAssignment.startDate)} - ${formatDutyDate(currentAssignment.endDate)}`,
      message: editedMessage,
      timestamp: new Date().toISOString(),
      status: 'sent_confirmed'
    };
    recordSendHistory(historyItem).then(() => onRefreshHistory());

    // 3. Immediately launch WhatsApp
    setTimeout(() => {
      openWhatsApp(editedMessage, 'app');
    }, 200);

    setTimeout(() => setCopiedNotification(false), 3500);
  };

  // Copy Only
  const handleCopyOnly = async () => {
    if (!editedMessage || !currentAssignment) return;
    const success = await copyToClipboard(editedMessage);
    if (success) {
      setCopiedNotification(true);
      setJustDone(true);
      const historyItem: SendHistory = {
        id: `copy-${Date.now()}`,
        assignmentId: currentAssignment.id,
        weekLabel: currentAssignment.weekLabel,
        dutyPeriod: `${formatDutyDate(currentAssignment.startDate)} - ${formatDutyDate(currentAssignment.endDate)}`,
        message: editedMessage,
        timestamp: new Date().toISOString(),
        status: 'copied'
      };
      await recordSendHistory(historyItem);
      await onRefreshHistory();
      setTimeout(() => setCopiedNotification(false), 3000);
    }
  };

  const isNextWeek = selectedIndex === comingWeekIdx && selectedIndex !== currentWeekIdx;

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-6 pb-24 text-center">
      {/* Empty State */}
      {(!activeRoster || sortedAssignments.length === 0) && (
        <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-5 my-6 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 mx-auto flex items-center justify-center text-emerald-400">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black text-white">No Duty Schedule</h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Please upload or sync your teacher duty roster to activate your assistant.
            </p>
          </div>

          <div className="flex flex-col space-y-2.5 pt-2">
            <button
              type="button"
              onClick={onOpenRosterModal}
              className="w-full py-4 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm tracking-wide transition-all shadow-lg shadow-emerald-500/25 active:scale-[0.98] flex items-center justify-center space-x-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Upload Duty Roster</span>
            </button>

            <button
              type="button"
              onClick={onLoadSampleRoster}
              className="w-full py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center space-x-1.5"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Use Test Schedule (Demo)</span>
            </button>
          </div>
        </div>
      )}

      {/* SINGLE COLUMN ULTRA MINIMAL HOMESCREEN */}
      {activeRoster && currentAssignment && (
        <div className="space-y-6 max-w-sm mx-auto">
          {/* Active Period / Date Header */}
          <div className="space-y-1.5 text-center">
            <div className="text-[11px] font-black uppercase tracking-widest text-emerald-400">
              {isNextWeek ? 'NEXT WEEK\'S DUTY' : 'THIS WEEK\'S DUTY'}
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              {formatDutyDate(currentAssignment.startDate)} — {formatDutyDate(currentAssignment.endDate)}
            </h1>
          </div>

          {/* Simple Who is on Duty Section */}
          <div className="space-y-3">
            {currentAssignment.teachers && currentAssignment.teachers.length > 0 ? (
              currentAssignment.teachers.map((teacher: DutyTeacher, idx: number) => {
                const initials = teacher.name
                  .split(' ')
                  .map(n => n[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || `${idx + 1}`;

                return (
                  <div
                    key={teacher.id || idx}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800/80 shadow-md text-left flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700/60 text-slate-200 font-black text-xs flex items-center justify-center shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="text-base font-bold text-white tracking-tight truncate">
                          {teacher.name}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 text-xs text-center">
                No teachers assigned for this week.
              </div>
            )}
          </div>

          {/* TWO PRIMARY ACTIONS (Combining Clipboard Copy and WhatsApp Deep Link) */}
          <div className="space-y-3 pt-3">
            {/* Action 1: High-Priority One-Tap Send Button */}
            <button
              type="button"
              onClick={handleOneTapSend}
              className={`w-full py-4.5 px-6 rounded-2xl font-black text-sm tracking-wide transition-all shadow-xl active:scale-[0.98] flex items-center justify-center space-x-2.5 ${
                copiedNotification
                  ? 'bg-teal-500 text-white shadow-teal-500/30'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30'
              }`}
            >
              {copiedNotification ? (
                <>
                  <Check className="w-5 h-5 animate-bounce text-white" />
                  <span>COPIED & OPENING WHATSAPP...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>⚡ ONE-TAP SEND (COPY & CHAT)</span>
                </>
              )}
            </button>

            {/* Action 2: Plain Clipboard Copy Button (Secondary action) */}
            <button
              type="button"
              onClick={handleCopyOnly}
              className="w-full py-3.5 px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-bold transition-all flex items-center justify-center space-x-2 active:scale-[0.98]"
            >
              <Copy className="w-4 h-4 text-emerald-400" />
              <span>Copy Message Only</span>
            </button>
          </div>

          {/* Quick Edit/Preview Accordion if user wants to review */}
          <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-900 space-y-2 text-left">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Message Preview
              </span>
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="text-[10px] text-emerald-500 hover:text-emerald-400 font-bold uppercase tracking-wider"
              >
                {isEditing ? 'Done' : 'Edit'}
              </button>
            </div>

            {isEditing ? (
              <textarea
                value={editedMessage}
                onChange={e => setEditedMessage(e.target.value)}
                rows={5}
                className="w-full p-3 rounded-xl bg-slate-950 border border-emerald-500/40 text-slate-100 text-xs focus:outline-none resize-none leading-relaxed font-sans"
              />
            ) : (
              <div className="text-xs text-slate-400 leading-relaxed whitespace-pre-line bg-slate-950/20 p-2.5 rounded-lg border border-slate-900/60 font-medium">
                {editedMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
