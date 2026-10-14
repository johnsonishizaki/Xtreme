import React, { useState, useMemo } from 'react';
import {
  Copy,
  Send,
  CheckCircle2,
  Calendar,
  Users,
  AlertTriangle,
  Clock,
  ArrowRight,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import {
  DutyAssignment,
  Roster,
  AppSettings,
  SendHistory,
  HouseConfig,
  HouseDailyReport,
  AcademicTerm,
  DailyCollation
} from '../types';
import {
  generateAnnouncementMessage,
  copyToClipboard,
  openWhatsApp,
  formatDutyDate
} from '../services/messageGenerator';
import {
  recordSendHistory,
  collateDailyReports
} from '../services/firebase';
import { getDutyBadgeConfig } from '../services/dutyBadgeHelper';

interface HomeScreenProps {
  rosters: Roster[];
  assignments: DutyAssignment[];
  settings: AppSettings;
  sendHistory: SendHistory[];
  houses: HouseConfig[];
  reports: HouseDailyReport[];
  terms: AcademicTerm[];
  onNavigateTab: (tab: 'home' | 'duty' | 'houseReports' | 'history' | 'settings') => void;
  onRefreshData: () => Promise<void>;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  rosters,
  assignments,
  settings,
  sendHistory,
  houses,
  reports,
  terms,
  onNavigateTab,
  onRefreshData
}) => {
  const [copiedNotification, setCopiedNotification] = useState(false);

  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  const todayDisplay = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }, []);

  const activeTerm = terms[0] || { id: 'term-1', termName: 'Term 1', academicYear: '2026/2027' };

  // ===================================
  // 1. QUESTION 1: WHO IS ON DUTY?
  // ===================================
  const activeRoster = useMemo(() => rosters.find(r => r.isActive) || rosters[0] || null, [rosters]);

  const activeAssignments = useMemo(() => {
    if (!activeRoster) return assignments;
    const rosterSpecific = assignments.filter(a => a.rosterId === activeRoster.id);
    return rosterSpecific.length > 0 ? rosterSpecific : assignments;
  }, [assignments, activeRoster]);

  const sortedAssignments = useMemo(() => {
    return [...activeAssignments].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [activeAssignments]);

  const currentWeekIdx = useMemo(() => {
    if (sortedAssignments.length === 0) return -1;
    const idx = sortedAssignments.findIndex(a => todayStr >= a.startDate && todayStr <= a.endDate);
    if (idx !== -1) return idx;
    const upcoming = sortedAssignments.findIndex(a => a.startDate > todayStr);
    if (upcoming !== -1) return upcoming;
    return 0;
  }, [sortedAssignments, todayStr]);

  const comingWeekIdx = useMemo(() => {
    if (currentWeekIdx === -1) return -1;
    if (currentWeekIdx + 1 < sortedAssignments.length) return currentWeekIdx + 1;
    return currentWeekIdx;
  }, [currentWeekIdx, sortedAssignments.length]);

  // Determine which assignment to feature on Home:
  // If today is Friday, Saturday, or Sunday, show the upcoming week's announcement; otherwise current week
  const featuredAssignment = useMemo(() => {
    if (sortedAssignments.length === 0) return null;
    const day = new Date().getDay();
    const isWeekend = day === 0 || day === 5 || day === 6;
    if (isWeekend && comingWeekIdx !== -1) {
      return sortedAssignments[comingWeekIdx];
    }
    return currentWeekIdx !== -1 ? sortedAssignments[currentWeekIdx] : sortedAssignments[0];
  }, [sortedAssignments, currentWeekIdx, comingWeekIdx]);

  const generatedMessage = useMemo(() => {
    if (!featuredAssignment) return '';
    return generateAnnouncementMessage(settings.messageTemplate, featuredAssignment);
  }, [featuredAssignment, settings.messageTemplate]);

  const isAlreadySent = useMemo(() => {
    if (!featuredAssignment) return false;
    return sendHistory.some(h => h.assignmentId === featuredAssignment.id && h.status === 'sent_confirmed');
  }, [featuredAssignment, sendHistory]);

  const handleCopyMessage = async () => {
    if (!generatedMessage || !featuredAssignment) return;
    const ok = await copyToClipboard(generatedMessage);
    if (ok) {
      setCopiedNotification(true);
      const item: SendHistory = {
        id: `copy-${Date.now()}`,
        assignmentId: featuredAssignment.id,
        weekLabel: featuredAssignment.weekLabel,
        dutyPeriod: `${formatDutyDate(featuredAssignment.startDate)} - ${formatDutyDate(featuredAssignment.endDate)}`,
        message: generatedMessage,
        timestamp: new Date().toISOString(),
        status: 'copied'
      };
      await recordSendHistory(item);
      await onRefreshData();
      setTimeout(() => setCopiedNotification(false), 3000);
    }
  };

  const handleOpenWhatsApp = () => {
    if (!generatedMessage) return;
    openWhatsApp(generatedMessage, settings.whatsAppBehavior || 'app');
  };

  // =======================================================
  // 2. QUESTION 2: HOW MANY STUDENTS HAVE REPORTED TODAY?
  // =======================================================
  const collation: DailyCollation = useMemo(() => {
    return collateDailyReports(reports, houses, todayStr, activeTerm.id);
  }, [reports, houses, todayStr, activeTerm.id]);

  // ===================================
  // 3. ATTENTION / ACTIONABLE ALERTS
  // ===================================
  const attentionItems = useMemo(() => {
    const list: Array<{ id: string; type: 'warning' | 'danger'; title: string; subtitle: string; actionTab: any }> = [];

    // Alert: Missing house reports
    if (collation.missingHouseIds.length > 0) {
      const missingNames = collation.missingHouseIds
        .map(id => houses.find(h => h.id === id)?.name || id)
        .slice(0, 3)
        .join(', ');
      list.push({
        id: 'missing-reports',
        type: 'warning',
        title: `${collation.missingHouseIds.length} house reports missing today`,
        subtitle: `Awaiting: ${missingNames}${collation.missingHouseIds.length > 3 ? '...' : ''}`,
        actionTab: 'houseReports'
      });
    }

    // Alert: Students not yet reported
    if (collation.totalNotReported > 0) {
      list.push({
        id: 'outstanding-students',
        type: 'warning',
        title: `${collation.totalNotReported} students not yet reported`,
        subtitle: `${collation.followUpHousesCount} house(s) have recorded follow-up details`,
        actionTab: 'houseReports'
      });
    }

    // Alert: Sunday duty announcement pending
    const day = new Date().getDay();
    if (day === 0 && !isAlreadySent && featuredAssignment) {
      list.push({
        id: 'sunday-duty-pending',
        type: 'danger',
        title: 'Sunday weekly duty reminder pending',
        subtitle: `Announcement ready for ${featuredAssignment.weekLabel}`,
        actionTab: 'duty'
      });
    }

    return list;
  }, [collation, houses, isAlreadySent, featuredAssignment]);

  const badgeConfig = featuredAssignment ? getDutyBadgeConfig(featuredAssignment.dutyTitle) : null;
  const DutyIcon = badgeConfig?.icon || ShieldCheck;

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6 pb-28 text-left">
      {/* Operator Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-500">
            Senior Houseparent Command Center
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-page)]">
            Xtreme
          </h1>
          <p className="text-xs font-mono text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-500" />
            <span>Today: {todayDisplay}</span>
          </p>
        </div>

        <div className="text-right">
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-bold uppercase">
            {activeTerm.termName} Active
          </span>
        </div>
      </div>

      {/* ========================================================
          CARD 1: WEEKLY TEACHER DUTY (Answers: Who is on duty?)
          ======================================================== */}
      <div className="p-6 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--shadow-card)] space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--card-border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold block">
                Question 1
              </span>
              <h2 className="text-sm font-black text-[var(--text-page)] uppercase tracking-wider">
                Weekly Teacher Duty
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('duty')}
            className="text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Duty Module</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {featuredAssignment ? (
          <div className="space-y-3.5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">
                  {featuredAssignment.weekLabel}
                </div>
                <h3 className="text-lg font-black text-[var(--text-page)]">
                  {featuredAssignment.teachers.map(t => t.name).join(' & ') || 'Teacher on Duty'}
                </h3>
                <p className="text-xs font-mono text-emerald-400 flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  <span>{formatDutyDate(featuredAssignment.startDate)} &ndash; {formatDutyDate(featuredAssignment.endDate)}</span>
                </p>
              </div>

              {isAlreadySent ? (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ✅ Sent
                </span>
              ) : (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Ready to send
                </span>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleCopyMessage}
                className={`py-3 px-3 rounded-2xl font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md ${
                  copiedNotification
                    ? 'bg-emerald-500 text-black'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-black'
                }`}
              >
                {copiedNotification ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Message</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="py-3 px-3 rounded-2xl font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:bg-[var(--card-bg)] text-[var(--text-page)]"
              >
                <Send className="w-4 h-4 text-emerald-500" />
                <span>Open WhatsApp</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-[var(--card-bg-elevated)] text-center text-xs font-mono text-[var(--text-muted)] space-y-2">
            <p>No duty roster currently active.</p>
            <button
              type="button"
              onClick={() => onNavigateTab('duty')}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 text-black font-bold text-xs uppercase cursor-pointer"
            >
              Open Duty Tab
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          CARD 2: HOUSE REPORTING (Answers: How many students have reported today?)
          ========================================================================= */}
      <div className="p-6 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--shadow-card)] space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--card-border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 font-bold block">
                Question 2
              </span>
              <h2 className="text-sm font-black text-[var(--text-page)] uppercase tracking-wider">
                Term Opening House Reporting
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('houseReports')}
            className="text-xs font-mono text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>View 8 Houses</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-3xl font-black text-[var(--text-page)]">
                {collation.totalReported}{' '}
                <span className="text-sm font-mono text-[var(--text-muted)] font-normal">
                  / {collation.totalExpected} reported
                </span>
              </div>
              <div className="text-xs font-mono text-emerald-400 font-bold mt-0.5">
                {collation.reportingPercentage}% overall attendance rate
              </div>
            </div>

            <div className="text-right">
              <div className="text-xl font-black text-amber-400">
                {collation.totalNotReported}
              </div>
              <div className="text-[10px] font-mono text-[var(--text-muted)]">
                Not yet reported
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, collation.reportingPercentage)}%` }}
            />
          </div>

          {/* House Reports Submissions Count */}
          <div className="p-3 rounded-2xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-center justify-between text-xs font-mono">
            <span className="text-[var(--text-muted)]">House Reports Received Today:</span>
            <span className={`font-extrabold ${
              collation.reportsReceivedCount === collation.totalHousesCount
                ? 'text-emerald-400'
                : 'text-amber-400'
            }`}>
              {collation.reportsReceivedCount} of {collation.totalHousesCount} houses
            </span>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('houseReports')}
            className="w-full py-3 rounded-2xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <span>View 8 Houses Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================
          CARD 3: ATTENTION SYSTEM (Actionable Operational Alerts)
          ======================================================== */}
      {attentionItems.length > 0 && (
        <div className="p-5 rounded-3xl border border-amber-500/30 bg-amber-500/5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Attention System ({attentionItems.length} alerts)</span>
          </div>

          <div className="space-y-2">
            {attentionItems.map(item => (
              <div
                key={item.id}
                onClick={() => onNavigateTab(item.actionTab)}
                className="p-3 rounded-2xl border border-amber-500/20 bg-[var(--card-bg)] hover:border-amber-500/50 flex items-center justify-between cursor-pointer transition-all"
              >
                <div>
                  <div className="text-xs font-bold text-[var(--text-page)]">{item.title}</div>
                  <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">{item.subtitle}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-400" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
