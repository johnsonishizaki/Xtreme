import React, { useState, useMemo, useEffect } from 'react';
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
  ChevronRight,
  Share2,
  Bell,
  Check
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
import { checkAndTriggerDutyAlert, requestNotificationPermission, getNotificationPermission } from '../services/notificationService';
import { WhatsAppShareModal } from './WhatsAppShareModal';
import { UniversalHouseparentFormModal } from './UniversalHouseparentFormModal';

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
  const [isUniversalFormOpen, setIsUniversalFormOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

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

  // ALWAYS feature THIS WEEK'S duty (never another week)
  const featuredAssignment = useMemo(() => {
    if (sortedAssignments.length === 0) return null;
    // Strictly match the week where today's date falls within [startDate, endDate]
    const thisWeek = sortedAssignments.find(a => todayStr >= a.startDate && todayStr <= a.endDate);
    if (thisWeek) return thisWeek;
    return currentWeekIdx !== -1 ? sortedAssignments[currentWeekIdx] : sortedAssignments[0];
  }, [sortedAssignments, todayStr, currentWeekIdx]);

  const generatedMessage = useMemo(() => {
    if (!featuredAssignment) return '';
    return generateAnnouncementMessage(settings.messageTemplate, featuredAssignment);
  }, [featuredAssignment, settings.messageTemplate]);

  const isAlreadySent = useMemo(() => {
    if (!featuredAssignment) return false;
    return sendHistory.some(h => h.assignmentId === featuredAssignment.id && h.status === 'sent_confirmed');
  }, [featuredAssignment, sendHistory]);

  // Repeatedly remind and push notifications until marked done for the week
  useEffect(() => {
    if (featuredAssignment) {
      const teachersText = featuredAssignment.teachers.map(t => t.name).join(', ') || 'Teachers';
      checkAndTriggerDutyAlert(
        featuredAssignment.id,
        featuredAssignment.weekLabel,
        teachersText,
        isAlreadySent
      );
    }
  }, [featuredAssignment, isAlreadySent]);

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

  const handleToggleMarkDone = async () => {
    if (!featuredAssignment || !generatedMessage) return;
    const isNowSent = !isAlreadySent;
    const item: SendHistory = {
      id: `sent-${Date.now()}`,
      assignmentId: featuredAssignment.id,
      weekLabel: featuredAssignment.weekLabel,
      dutyPeriod: `${formatDutyDate(featuredAssignment.startDate)} - ${formatDutyDate(featuredAssignment.endDate)}`,
      message: generatedMessage,
      timestamp: new Date().toISOString(),
      status: isNowSent ? 'sent_confirmed' : 'copied'
    };
    await recordSendHistory(item);
    await onRefreshData();
  };

  // =======================================================
  // 2. QUESTION 2: HOW MANY STUDENTS HAVE REPORTED TODAY?
  // =======================================================
  const collation: DailyCollation = useMemo(() => {
    return collateDailyReports(reports, houses, todayStr);
  }, [reports, houses, todayStr]);

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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24 text-left">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-page)]">
            Xtreme
          </h1>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            {todayDisplay} · {activeTerm.termName} ({activeTerm.academicYear})
          </div>
        </div>
      </div>

      {/* PUSH & ACTION REMINDER BANNER */}
      {featuredAssignment && !isAlreadySent && (
        <div className="p-3.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-400">
                Action Required: Send This Week&apos;s Duty Announcement
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {featuredAssignment.weekLabel} is pending. Reminders will notify you until marked done.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="py-1.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Now</span>
            </button>
            <button
              type="button"
              onClick={handleToggleMarkDone}
              className="py-1.5 px-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-[var(--text-page)] text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
            >
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mark Done</span>
            </button>
          </div>
        </div>
      )}

      {/* 1. TEACHER DUTY */}
      <div className="p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-[var(--text-page)]">
              This Week&apos;s Duty
            </h2>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('duty')}
            className="text-xs text-emerald-500 hover:underline flex items-center gap-1 cursor-pointer font-medium"
          >
            <span>Duty Schedule</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {featuredAssignment ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-[var(--text-muted)]">
                  {featuredAssignment.weekLabel}
                </div>
                <h3 className="text-base font-bold text-[var(--text-page)] mt-0.5">
                  {featuredAssignment.teachers.map(t => t.name).join(' & ') || 'Teacher on Duty'}
                </h3>
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3 text-emerald-500" />
                  <span>{formatDutyDate(featuredAssignment.startDate)} – {formatDutyDate(featuredAssignment.endDate)}</span>
                </p>
              </div>

              {isAlreadySent ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Marked Done
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Pending
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyMessage}
                className="py-2 px-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
              >
                {copiedNotification ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="py-2 px-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:bg-[var(--card-bg)] text-[var(--text-page)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <Send className="w-3.5 h-3.5 text-emerald-500" />
                <span>WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleToggleMarkDone}
                className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  isAlreadySent
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:bg-[var(--card-bg)] text-[var(--text-page)]'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isAlreadySent ? 'Done' : 'Mark Done'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[var(--card-bg-elevated)] text-center text-xs text-[var(--text-muted)] space-y-2">
            <p>No duty roster currently active.</p>
            <button
              type="button"
              onClick={() => onNavigateTab('duty')}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-black font-semibold text-xs cursor-pointer"
            >
              Open Duty Tab
            </button>
          </div>
        )}
      </div>

      {/* 2. HOUSE STUDENT REPORTING */}
      <div className="p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-[var(--text-page)]">
              Student Attendance
            </h2>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('houseReports')}
            className="text-xs text-emerald-500 hover:underline flex items-center gap-1 cursor-pointer font-medium"
          >
            <span>All Houses</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-2xl font-bold text-[var(--text-page)]">
                {collation.totalReported}{' '}
                <span className="text-xs text-[var(--text-muted)] font-normal">
                  / {collation.totalExpected} reported
                </span>
              </div>
              <div className="text-xs text-emerald-500 font-medium mt-0.5">
                {collation.reportingPercentage}% reporting rate
              </div>
            </div>

            <div className="text-right">
              <div className="text-lg font-bold text-amber-500">
                {collation.totalNotReported}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Not reported
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, collation.reportingPercentage)}%` }}
            />
          </div>

          {/* Quiet sub-stats */}
          <div className="text-xs text-[var(--text-muted)] flex justify-between pt-0.5">
            <span>Boys: {collation.boysReported}/{collation.boysExpected}</span>
            <span>Girls: {collation.girlsReported}/{collation.girlsExpected}</span>
            <span>{collation.reportsReceivedCount}/{collation.totalHousesCount} Houses in</span>
          </div>

          {/* Quick Action Buttons for House Reporting */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={async () => {
                const formUrl = 'https://tally.so/r/2jBVWA';
                const ok = await copyToClipboard(formUrl);
                if (ok) {
                  openWhatsApp(`📋 *OLAG SHS — DAILY HOUSE ATTENDANCE REPORTING*\n\nDear Houseparents, please submit your house arrival report using the official form:\n👉 ${formUrl}\n\nThank you!\n— Senior Houseparent (Xtreme)`, 'app');
                }
              }}
              className="py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Send Form Link</span>
            </button>
            <button
              type="button"
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="py-2 px-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:bg-[var(--card-bg)] text-[var(--text-page)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              <Send className="w-3.5 h-3.5 text-emerald-500" />
              <span>WhatsApp Summary</span>
            </button>
          </div>
        </div>
      </div>

      {/* Attention Items */}
      {attentionItems.length > 0 && (
        <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-500">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Attention Items ({attentionItems.length})</span>
          </div>
          <div className="space-y-1.5">
            {attentionItems.map(item => (
              <div
                key={item.id}
                onClick={() => onNavigateTab(item.actionTab)}
                className="p-2.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-amber-500/40 flex items-center justify-between cursor-pointer transition-colors"
              >
                <div className="text-xs font-medium text-[var(--text-page)]">{item.title}</div>
                <ChevronRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Universal Houseparent Reporting Form */}
      <UniversalHouseparentFormModal
        isOpen={isUniversalFormOpen}
        onClose={() => setIsUniversalFormOpen(false)}
        houses={houses}
        activeTerm={activeTerm}
        initialDate={todayStr}
        onReportSubmitted={onRefreshData}
        onOpenWhatsAppShare={() => {
          setIsUniversalFormOpen(false);
          setIsWhatsAppModalOpen(true);
        }}
      />

      {/* WhatsApp Send Modal (House & Date Options) */}
      <WhatsAppShareModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        houses={houses}
        reports={reports}
        activeTerm={activeTerm}
        settings={settings}
        initialHouseId="all"
        initialDate={todayStr}
      />
    </div>
  );
};
