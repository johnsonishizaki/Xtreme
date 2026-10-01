import React, { useState, useEffect, useMemo } from 'react';
import {
  Copy,
  Calendar,
  Sparkles,
  FileSpreadsheet,
  Send,
  Check,
  Search,
  X,
  Filter,
  ShieldCheck
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

// Helper to highlight matching text in search results
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-emerald-500 text-black font-extrabold px-1 py-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
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
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  // Filter assignments by teacher name or duty title
  const filteredAssignments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sortedAssignments;

    return sortedAssignments.filter(assignment => {
      const matchTeacher = assignment.teachers?.some(t =>
        t.name.toLowerCase().includes(query) || (t.role && t.role.toLowerCase().includes(query))
      );
      const matchDutyTitle = assignment.dutyTitle && assignment.dutyTitle.toLowerCase().includes(query);
      const matchWeekLabel = assignment.weekLabel && assignment.weekLabel.toLowerCase().includes(query);

      return matchTeacher || matchDutyTitle || matchWeekLabel;
    });
  }, [sortedAssignments, searchQuery]);

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  // Auto-select week on load or roster change
  useEffect(() => {
    if (!searchQuery.trim() && sortedAssignments.length > 0) {
      const day = new Date().getDay();
      let targetIdx = 0;
      if ((day === 0 || day === 5 || day === 6) && comingWeekIdx !== -1) {
        targetIdx = comingWeekIdx;
      } else if (currentWeekIdx !== -1) {
        targetIdx = currentWeekIdx;
      }
      if (sortedAssignments[targetIdx]) {
        setSelectedAssignmentId(sortedAssignments[targetIdx].id);
      }
    }
  }, [activeRoster?.id, currentWeekIdx, comingWeekIdx, sortedAssignments, searchQuery]);

  // Keep selection valid when filtered list changes
  useEffect(() => {
    if (filteredAssignments.length === 0) return;
    if (!selectedAssignmentId || !filteredAssignments.some(a => a.id === selectedAssignmentId)) {
      setSelectedAssignmentId(filteredAssignments[0].id);
    }
  }, [filteredAssignments, selectedAssignmentId]);

  const currentAssignment: DutyAssignment | null = useMemo(() => {
    if (filteredAssignments.length === 0) return null;
    return filteredAssignments.find(a => a.id === selectedAssignmentId) || filteredAssignments[0];
  }, [filteredAssignments, selectedAssignmentId]);

  // Track message text & states
  const [editedMessage, setEditedMessage] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);

  // Auto-generate message when assignment updates
  useEffect(() => {
    if (currentAssignment) {
      const generated = generateAnnouncementMessage(settings.messageTemplate, currentAssignment);
      setEditedMessage(generated);
      setIsEditing(false);
      setCopiedNotification(false);
    } else {
      setEditedMessage('');
    }
  }, [currentAssignment, settings.messageTemplate]);

  // ONE-TAP SEND flow
  const handleOneTapSend = async () => {
    if (!editedMessage || !currentAssignment) return;

    await copyToClipboard(editedMessage);
    setCopiedNotification(true);

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

  const isCurrentWeek = currentAssignment && currentWeekIdx !== -1 && sortedAssignments[currentWeekIdx]?.id === currentAssignment.id;
  const isNextWeek = currentAssignment && comingWeekIdx !== -1 && sortedAssignments[comingWeekIdx]?.id === currentAssignment.id && !isCurrentWeek;

  const currentBadge = currentAssignment ? getDutyBadgeConfig(currentAssignment.dutyTitle) : null;
  const DutyIcon = currentBadge?.icon || ShieldCheck;

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-6 pb-28 text-center relative z-10">


      {/* CONTENT WITH ACTIVE ROSTER */}
      {activeRoster && sortedAssignments.length > 0 && (
        <div className="space-y-6 max-w-md mx-auto">
          {/* SEARCH BAR */}
          <div className="relative">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3.5 pointer-events-none text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search teacher name or duty title..."
                className="w-full pl-10 pr-9 py-3 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all border bg-white/[0.03] border-white/[0.08] text-white placeholder-slate-500 shadow-inner backdrop-blur-md"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 p-1 rounded-full transition-colors text-slate-400 hover:text-white hover:bg-white/[0.06]"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Results Summary Badge */}
            {searchQuery.trim() && (
              <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono px-1 text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Filter className="w-3 h-3 text-emerald-500" />
                  <span>
                    Found <strong className="text-white">{filteredAssignments.length}</strong> of {sortedAssignments.length} duty {sortedAssignments.length === 1 ? 'week' : 'weeks'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-emerald-500 hover:underline font-semibold"
                >
                  Reset filter
                </button>
              </div>
            )}
          </div>

          {/* Quick Week / Duty Assignment Selector Pills */}
          {filteredAssignments.length > 1 && (
            <div className="space-y-1.5 text-left">
              <div className="text-[10px] font-mono uppercase tracking-widest px-1 text-slate-400 opacity-60">
                {searchQuery.trim() ? 'Matching Duty Periods' : 'Duty Weeks'}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin no-scrollbar">
                {filteredAssignments.map((assignment, idx) => {
                  const isSelected = assignment.id === currentAssignment?.id;
                  const isCurrent = currentWeekIdx !== -1 && sortedAssignments[currentWeekIdx]?.id === assignment.id;
                  const isNext = comingWeekIdx !== -1 && sortedAssignments[comingWeekIdx]?.id === assignment.id && !isCurrent;

                  let label = assignment.weekLabel || `Week ${idx + 1}`;
                  if (label.includes(':')) {
                    label = label.split(':')[0].trim();
                  }

                  return (
                    <button
                      key={assignment.id}
                      type="button"
                      onClick={() => setSelectedAssignmentId(assignment.id)}
                      className={`shrink-0 px-3 py-1.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-emerald-500 text-black font-bold shadow-md ring-1 ring-emerald-400 border-transparent'
                          : 'bg-white/[0.03] text-slate-400 hover:text-white border-white/[0.08] hover:border-white/[0.15]'
                      }`}
                    >
                      <span>{label}</span>
                      {isCurrent && !searchQuery.trim() && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-black' : 'bg-emerald-400'}`} />
                      )}
                      {isNext && !searchQuery.trim() && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-black' : 'bg-amber-400'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* NO RESULTS STATE */}
          {filteredAssignments.length === 0 && (
            <div className="p-8 rounded-[28px] text-center space-y-4 my-2 shadow-xl border bg-white/[0.03] border-white/[0.08] backdrop-blur-xl">
              <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center border bg-white/[0.02] border-white/[0.08] text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">No matching assignments</h3>
                <p className="text-xs max-w-xs mx-auto leading-relaxed text-slate-400 opacity-70">
                  No duty assignments match &ldquo;{searchQuery}&rdquo;. Try searching for another teacher name or duty title.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 rounded-xl text-emerald-500 hover:text-emerald-600 text-xs font-mono border border-emerald-500/20 hover:bg-emerald-500/10 transition-colors"
              >
                Clear Search Filter
              </button>
            </div>
          )}

          {/* SELECTED DUTY ASSIGNMENT SPOTLIGHT CARD */}
          {currentAssignment && (
            <div className="space-y-6 pt-1">
              {/* Active Period / Date Header */}
              <div className="space-y-2 text-center">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-400">
                    {isCurrentWeek
                      ? "THIS WEEK'S DUTY"
                      : isNextWeek
                      ? "NEXT WEEK'S DUTY"
                      : currentAssignment.weekLabel || 'SELECTED DUTY PERIOD'}
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] text-white">
                  {formatDutyDate(currentAssignment.startDate)} — {formatDutyDate(currentAssignment.endDate)}
                </h1>

                {/* Duty Title Badge */}
                {currentAssignment.dutyTitle && (
                  <div className="pt-0.5 flex items-center justify-center">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full font-mono text-xs font-semibold border bg-white/[0.03] border-white/[0.08] text-slate-300">
                      <DutyIcon className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        <HighlightText text={currentAssignment.dutyTitle} query={searchQuery} />
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Who is on Duty Section */}
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

                    const isMatch = searchQuery.trim() && (
                      teacher.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
                      (teacher.role && teacher.role.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                    );

                    return (
                      <div
                        key={teacher.id || idx}
                        className={`p-4 rounded-2xl border transition-all text-left flex items-center justify-between shadow-sm ${
                          isMatch
                            ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                            : 'bg-white/[0.03] border-white/[0.08] text-white shadow-lg backdrop-blur-md'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-11 h-11 rounded-xl border font-mono font-bold text-xs flex items-center justify-center shrink-0 bg-white/[0.04] border-white/[0.08] text-slate-200">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="text-base font-bold tracking-tight truncate text-white">
                              <HighlightText text={teacher.name} query={searchQuery} />
                            </div>
                            {teacher.role && (
                              <div className="text-xs font-mono truncate mt-0.5 text-slate-400 opacity-70">
                                <HighlightText text={teacher.role} query={searchQuery} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 rounded-2xl border text-xs text-center font-mono bg-white/[0.03] border-white/[0.08] text-slate-400">
                    No teachers assigned for this week.
                  </div>
                )}
              </div>

              {/* PRIMARY & SECONDARY ACTIONS */}
              <div className="space-y-3 pt-2">
                {/* One-Tap Send */}
                <button
                  type="button"
                  onClick={handleOneTapSend}
                  className={`w-full py-4 px-6 rounded-2xl font-black text-sm uppercase tracking-wide transition-all shadow-xl active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer ${
                    copiedNotification
                      ? 'bg-teal-400 text-black shadow-teal-500/30'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/25'
                  }`}
                >
                  {copiedNotification ? (
                    <>
                      <Check className="w-5 h-5 animate-bounce text-black" />
                      <span>COPIED & OPENING WHATSAPP...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 text-black" />
                      <span>⚡ ONE-TAP SEND (COPY & CHAT)</span>
                    </>
                  )}
                </button>

                {/* Plain Clipboard Copy Button */}
                <button
                  type="button"
                  onClick={handleCopyOnly}
                  className="w-full py-3.5 px-5 rounded-2xl text-xs font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer border bg-transparent hover:bg-white/[0.04] border-white/[0.08] text-slate-200"
                >
                  <Copy className="w-4 h-4 text-emerald-400" />
                  <span>Copy Message Only</span>
                </button>
              </div>

              {/* Quick Edit/Preview Accordion */}
              <div className="p-4 rounded-2xl space-y-2 text-left border bg-white/[0.02] border-white/[0.06] backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 opacity-60">
                    Message Preview
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-[10px] font-mono text-emerald-500 hover:text-emerald-600 font-bold uppercase tracking-wider cursor-pointer"
                  >
                    {isEditing ? 'Done' : 'Edit'}
                  </button>
                </div>

                {isEditing ? (
                  <textarea
                    value={editedMessage}
                    onChange={e => setEditedMessage(e.target.value)}
                    rows={5}
                    className="w-full p-3 rounded-xl text-xs font-mono focus:outline-none resize-none leading-relaxed border bg-black/50 border-emerald-500/40 text-slate-100"
                  />
                ) : (
                  <div className="text-xs leading-relaxed whitespace-pre-line p-3 rounded-xl border font-medium font-sans bg-black/30 border-white/[0.04] text-slate-400">
                    {editedMessage}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
