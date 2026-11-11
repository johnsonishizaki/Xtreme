import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Copy,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Users,
  ShieldCheck,
  ChevronRight,
  Filter,
  PlusCircle,
  Clock,
  ExternalLink,
  Lock,
  Unlock,
  Loader2,
  RefreshCw,
  Sparkles,
  Link,
  Send,
  Smartphone,
  Share2,
  Radio
} from 'lucide-react';
import { getTallyStatus, syncTallyNow } from '../services/tallyClient';
import {
  HouseConfig,
  HouseDailyReport,
  AcademicTerm,
  DailyCollation,
  AppSettings
} from '../types';
import { collateDailyReports, setTermStatus, DEFAULT_SETTINGS } from '../services/firebase';
import { DEFAULT_TERM } from '../services/sampleData';
import { copyToClipboard, formatDutyDate } from '../services/messageGenerator';
import { HouseDetailModal } from './HouseDetailModal';
import { SendFormLinkModal } from './SendFormLinkModal';
import { UniversalHouseparentFormModal } from './UniversalHouseparentFormModal';
import { WhatsAppShareModal } from './WhatsAppShareModal';

interface HouseReportingTabProps {
  houses: HouseConfig[];
  reports: HouseDailyReport[];
  terms: AcademicTerm[];
  settings?: AppSettings;
  onRefreshData: () => Promise<void>;
  onOpenSettings: (subSection?: string) => void;
}

export const HouseReportingTab: React.FC<HouseReportingTabProps> = ({
  houses,
  reports,
  terms,
  settings = DEFAULT_SETTINGS,
  onRefreshData,
  onOpenSettings
}) => {
  const activeTerm = useMemo(() => {
    return terms.find(t => t.status === 'open') || terms[0] || DEFAULT_TERM;
  }, [terms]);

  // Selected reporting date (defaults to today's date or the active term opening date)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // If today is later than openingDate, use today in YYYY-MM-DD
    const todayStr = new Date().toISOString().split('T')[0];
    return todayStr;
  });

  const [selectedHouseForDetail, setSelectedHouseForDetail] = useState<HouseConfig | null>(null);
  const [isSendFormLinkOpen, setIsSendFormLinkOpen] = useState(false);
  const [isUniversalFormOpen, setIsUniversalFormOpen] = useState(false);
  const [universalFormHouseId, setUniversalFormHouseId] = useState<string | undefined>(undefined);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppModalHouseId, setWhatsAppModalHouseId] = useState<string>('all');
  // Available reporting dates from received reports (Today always first)
  const availableDates = useMemo(() => {
    const datesSet = new Set<string>();
    const todayStr = new Date().toISOString().split('T')[0];
    datesSet.add(todayStr);
    for (const r of reports) {
      if (r.reportingDate) datesSet.add(r.reportingDate);
    }
    const allSorted = Array.from(datesSet).sort().reverse();
    return [todayStr, ...allSorted.filter(d => d !== todayStr)];
  }, [reports]);

  // Auto-switch selectedDate to today if today has reports, or latest report date <= today
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayReports = reports.filter(r => r.reportingDate === todayStr);
    if (todayReports.length > 0) {
      if (selectedDate !== todayStr) {
        setSelectedDate(todayStr);
      }
    } else if (reports.length > 0) {
      const reportsForSelected = reports.filter(r => r.reportingDate === selectedDate);
      if (reportsForSelected.length === 0) {
        // Only select valid report dates <= todayStr, never future dates
        const validPastOrToday = reports
          .map(r => r.reportingDate)
          .filter(d => d && d <= todayStr)
          .sort()
          .reverse();
        const latestReportDate = validPastOrToday[0];
        if (latestReportDate) {
          setSelectedDate(latestReportDate);
        }
      }
    }
  }, [reports]);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [followUpFilterHouse, setFollowUpFilterHouse] = useState<string>('all');
  const [isTogglingPeriod, setIsTogglingPeriod] = useState(false);

  // Automated synchronization every 1 second (zero buttons to press)
  useEffect(() => {
    let isMounted = true;
    let timer: NodeJS.Timeout | null = null;

    const performSyncCycle = async () => {
      try {
        if (!isMounted) return;
        // 1. Refresh reports from database every second
        await onRefreshData();

        // 2. Also check backend Tally API synchronization if configured
        const status = await getTallyStatus();
        if (!isMounted) return;
        if (status.hasApiKey && !status.isSyncInProgress && document.visibilityState === 'visible') {
          const res = await syncTallyNow();
          if (isMounted && res.success && res.newReportsImported > 0) {
            await onRefreshData();
          }
        }
      } catch (err) {
        console.warn('[HouseReportingTab] Auto-sync notice:', err);
      }
    };

    // Initial sync
    performSyncCycle();

    // 1-second recurring timer for active session
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        performSyncCycle();
      }
    }, 1000);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [onRefreshData]);

  const handleOpenUniversalForm = (houseId?: string) => {
    setUniversalFormHouseId(houseId || houses[0]?.id);
    setIsUniversalFormOpen(true);
  };

  const handleOpenWhatsAppModal = (houseId: string = 'all', date?: string) => {
    setWhatsAppModalHouseId(houseId);
    if (date) setSelectedDate(date);
    setIsWhatsAppModalOpen(true);
  };

  // Collate data for selected date and active term
  const collation: DailyCollation = useMemo(() => {
    return collateDailyReports(reports, houses, selectedDate, activeTerm.id);
  }, [reports, houses, selectedDate, activeTerm.id]);

  // Group houses into Boys & Girls (4 houses each)
  const boysHouses = useMemo(() => houses.filter(h => h.active && h.category === 'Boys'), [houses]);
  const girlsHouses = useMemo(() => houses.filter(h => h.active && h.category === 'Girls'), [houses]);

  // Map of reports for selected date: houseId -> report
  const dateReportsMap = useMemo(() => {
    const map = new Map<string, HouseDailyReport>();
    for (const r of reports) {
      if (r.reportingDate === selectedDate) {
        map.set(r.houseId, r);
      }
    }
    return map;
  }, [reports, selectedDate]);

  // List of reports with follow-up details
  const followUpItems = useMemo(() => {
    const items: Array<{ house: HouseConfig; report: HouseDailyReport }> = [];
    for (const house of houses) {
      const rep = dateReportsMap.get(house.id);
      if (rep && (rep.notReportedCount > 0 || (rep.notReportedDetails && rep.notReportedDetails.trim()))) {
        if (followUpFilterHouse === 'all' || followUpFilterHouse === house.id) {
          items.push({ house, report: rep });
        }
      }
    }
    return items;
  }, [houses, dateReportsMap, followUpFilterHouse]);

  // Generate Daily Collation Summary Text
  const summaryText = useMemo(() => {
    const housesWithFollowUp = houses
      .filter(h => {
        const rep = dateReportsMap.get(h.id);
        return rep && rep.notReportedCount > 0;
      })
      .map(h => `${h.name} (${dateReportsMap.get(h.id)?.notReportedCount} not reported)`);

    const missingHouses = collation.missingHouseIds
      .map(id => houses.find(h => h.id === id)?.name || id);

    let text = `TERM OPENING REPORT\n`;
    text += `${selectedDate}\n\n`;
    text += `Total expected: ${collation.totalExpected}\n`;
    text += `Total reported: ${collation.totalReported}\n`;
    text += `Not yet reported: ${collation.totalNotReported}\n`;
    text += `Reporting rate: ${collation.reportingPercentage}%\n\n`;
    text += `Boys: ${collation.boysReported}/${collation.boysExpected}\n`;
    text += `Girls: ${collation.girlsReported}/${collation.girlsExpected}\n\n`;
    text += `House reports received: ${collation.reportsReceivedCount}/${collation.totalHousesCount}\n`;

    if (missingHouses.length > 0) {
      text += `\n⚠️ Missing house reports:\n${missingHouses.join(', ')}\n`;
    }

    if (housesWithFollowUp.length > 0) {
      text += `\nHouses requiring follow-up:\n${housesWithFollowUp.join(', ')}\n`;
    }

    return text;
  }, [collation, houses, dateReportsMap, selectedDate]);

  const handleCopySummary = async () => {
    await copyToClipboard(summaryText);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 3000);
  };

  const handleToggleTermPeriod = async () => {
    try {
      setIsTogglingPeriod(true);
      const nextStatus = activeTerm.status === 'open' ? 'closed' : 'open';
      await setTermStatus(activeTerm.id, nextStatus);
      await onRefreshData();
    } catch (err: any) {
      console.error('Failed to update term status:', err);
    } finally {
      setIsTogglingPeriod(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24 text-left">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-page)]">
            House Reporting
          </h1>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            8 Houses · {activeTerm.termName} ({activeTerm.academicYear})
          </div>
        </div>

        {/* Date Selector & Period State */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {availableDates.length > 1 && (
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-xs text-[var(--text-page)] font-medium focus:outline-none cursor-pointer"
            >
              {availableDates.map(d => (
                <option key={d} value={d}>
                  {d === new Date().toISOString().split('T')[0] ? `Today (${d})` : d}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-xs">
            <Calendar className="w-3.5 h-3.5 text-emerald-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-[var(--text-page)] focus:outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* ACTION TOOLBAR */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setIsSendFormLinkOpen(true)}
          className="py-2 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Send Form Link</span>
        </button>

        <button
          type="button"
          onClick={() => handleOpenWhatsAppModal('all', selectedDate)}
          className="py-2 px-3.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:bg-[var(--card-bg)] text-[var(--text-page)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
        >
          <Send className="w-3.5 h-3.5 text-emerald-500" />
          <span>Send Summary on WhatsApp</span>
        </button>
      </div>

      {/* DAILY SCHOOL REPORT COLLATION CARD */}
      <div className="p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-page)]">
              Daily Summary
            </h2>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              {formatDutyDate(selectedDate)}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopySummary}
            className="py-1.5 px-3 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:bg-[var(--card-bg)] text-xs font-medium text-[var(--text-page)] flex items-center gap-1 cursor-pointer transition-all"
          >
            {copiedSummary ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            <span>{copiedSummary ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {/* Clean Numerical Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1 border-t border-[var(--card-border-subtle)]">
          <div>
            <div className="text-xs text-[var(--text-muted)]">Reported</div>
            <div className="text-2xl font-bold text-emerald-500 mt-0.5">
              {collation.totalReported}
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">{collation.reportingPercentage}%</div>
          </div>

          <div>
            <div className="text-xs text-[var(--text-muted)]">Quota</div>
            <div className="text-2xl font-bold text-[var(--text-page)] mt-0.5">
              {collation.totalExpected}
            </div>
          </div>

          <div>
            <div className="text-xs text-[var(--text-muted)]">Missing</div>
            <div className={`text-2xl font-bold mt-0.5 ${collation.totalNotReported > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
              {collation.totalNotReported}
            </div>
          </div>

          <div>
            <div className="text-xs text-[var(--text-muted)]">Received</div>
            <div className="text-2xl font-bold text-[var(--text-page)] mt-0.5">
              {collation.reportsReceivedCount}/{collation.totalHousesCount}
            </div>
          </div>
        </div>

        {/* Hairline Progress bar */}
        <div className="w-full h-1.5 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, collation.reportingPercentage)}%` }}
          />
        </div>

        {/* Clean inline breakdown */}
        <div className="text-xs text-[var(--text-muted)] flex flex-wrap justify-between gap-2 pt-1 border-t border-[var(--card-border-subtle)]">
          <span>Boys: <strong className="text-[var(--text-page)] font-semibold">{collation.boysReported}/{collation.boysExpected}</strong> ({collation.boysPercentage}%)</span>
          <span>Girls: <strong className="text-[var(--text-page)] font-semibold">{collation.girlsReported}/{collation.girlsExpected}</strong> ({collation.girlsPercentage}%)</span>
        </div>
      </div>

      {/* COMPACT PENDING HOUSES CHIP (Debloated) */}
      {collation.missingHouseIds.length > 0 && (
        <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-500 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{collation.missingHouseIds.length} houses pending report for {formatDutyDate(selectedDate)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {collation.missingHouseIds.map(hId => {
              const house = houses.find(h => h.id === hId);
              if (!house) return null;
              return (
                <button
                  key={hId}
                  type="button"
                  onClick={() => handleOpenUniversalForm(house.id)}
                  className="px-2 py-0.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>{house.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 8 HOUSES GRID: BOYS (4) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-muted)]">
          <span>Boys Houses (4)</span>
          <span className="text-[11px] font-normal">Tap card to review / edit</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {boysHouses.map(house => {
            const report = dateReportsMap.get(house.id);
            const expected = report ? report.expectedCount : house.expectedStudentCount;
            const reported = report ? report.reportedCount : 0;
            const notReported = report ? report.notReportedCount : expected;
            const percentage = expected > 0 ? Number(((reported / expected) * 100).toFixed(1)) : 0;
            const hasReport = !!report;

            return (
              <div
                key={house.id}
                onClick={() => setSelectedHouseForDetail(house)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer group hover:border-emerald-500/40 ${
                  hasReport
                    ? 'border-[var(--card-border)] bg-[var(--card-bg)]'
                    : 'border-amber-500/20 bg-amber-500/5'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {house.assignedHouseparent}
                    </div>
                    <h3 className="text-sm font-bold text-[var(--text-page)] group-hover:text-emerald-500 transition-colors mt-0.5">
                      {house.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {hasReport ? (
                      <span className="text-xs font-medium text-emerald-500">
                        Received
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-amber-500">
                        Missing
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenWhatsAppModal(house.id, selectedDate);
                      }}
                      title="Send WhatsApp for this house"
                      className="p-1 rounded-md text-[var(--text-muted)] hover:text-emerald-500 hover:bg-emerald-500/10 cursor-pointer transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-baseline justify-between">
                  <div className="text-lg font-bold text-[var(--text-page)]">
                    {reported} <span className="text-xs font-normal text-[var(--text-muted)]">/ {expected}</span>
                  </div>
                  <div className="text-xs">
                    {notReported > 0 ? (
                      <span className="text-amber-500 font-medium">{notReported} not reported</span>
                    ) : (
                      <span className="text-emerald-500 font-medium">100% full</span>
                    )}
                  </div>
                </div>

                {/* Slim Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      hasReport ? 'bg-blue-500' : 'bg-amber-500/50'
                    }`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                  />
                </div>

                {report?.notReportedDetails && (
                  <div className="mt-2 text-[11px] text-amber-400/90 truncate bg-amber-500/10 px-2 py-1 rounded-lg">
                    {report.notReportedDetails}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 8 HOUSES GRID: GIRLS (4) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-muted)]">
          <span>Girls Houses (4)</span>
          <span className="text-[11px] font-normal">Tap card to review / edit</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {girlsHouses.map(house => {
            const report = dateReportsMap.get(house.id);
            const expected = report ? report.expectedCount : house.expectedStudentCount;
            const reported = report ? report.reportedCount : 0;
            const notReported = report ? report.notReportedCount : expected;
            const percentage = expected > 0 ? Number(((reported / expected) * 100).toFixed(1)) : 0;
            const hasReport = !!report;

            return (
              <div
                key={house.id}
                onClick={() => setSelectedHouseForDetail(house)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer group hover:border-emerald-500/40 ${
                  hasReport
                    ? 'border-[var(--card-border)] bg-[var(--card-bg)]'
                    : 'border-amber-500/20 bg-amber-500/5'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {house.assignedHouseparent}
                    </div>
                    <h3 className="text-sm font-bold text-[var(--text-page)] group-hover:text-emerald-500 transition-colors mt-0.5">
                      {house.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {hasReport ? (
                      <span className="text-xs font-medium text-emerald-500">
                        Received
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-amber-500">
                        Missing
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenWhatsAppModal(house.id, selectedDate);
                      }}
                      title="Send WhatsApp for this house"
                      className="p-1 rounded-md text-[var(--text-muted)] hover:text-emerald-500 hover:bg-emerald-500/10 cursor-pointer transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-baseline justify-between">
                  <div className="text-lg font-bold text-[var(--text-page)]">
                    {reported} <span className="text-xs font-normal text-[var(--text-muted)]">/ {expected}</span>
                  </div>
                  <div className="text-xs">
                    {notReported > 0 ? (
                      <span className="text-amber-500 font-medium">{notReported} not reported</span>
                    ) : (
                      <span className="text-emerald-500 font-medium">100% full</span>
                    )}
                  </div>
                </div>

                {/* Slim Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      hasReport ? 'bg-pink-500' : 'bg-amber-500/50'
                    }`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                  />
                </div>

                {report?.notReportedDetails && (
                  <div className="mt-2 text-[11px] text-amber-400/90 truncate bg-amber-500/10 px-2 py-1 rounded-lg">
                    {report.notReportedDetails}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* FOLLOW-UP REQUIRED AGGREGATION LIST */}
      {followUpItems.length > 0 && (
        <div className="p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[var(--card-border-subtle)] pb-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-[var(--text-page)]">
                Students Requiring Follow-Up ({followUpItems.length})
              </h3>
            </div>

            {/* Filter dropdown */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <select
                value={followUpFilterHouse}
                onChange={e => setFollowUpFilterHouse(e.target.value)}
                className="text-xs rounded-lg px-2.5 py-1 border border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-[var(--text-page)] focus:outline-none"
              >
                <option value="all">All Houses</option>
                {houses.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {followUpItems.map(({ house, report }) => (
              <div
                key={house.id}
                onClick={() => setSelectedHouseForDetail(house)}
                className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40 cursor-pointer transition-all space-y-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--text-page)]">
                    {house.name}
                  </span>
                  <span className="text-[11px] font-medium text-amber-500">
                    {report.notReportedCount} not reported
                  </span>
                </div>
                {report.notReportedDetails && (
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {report.notReportedDetails}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* House Detail Modal when any house is tapped */}
      {selectedHouseForDetail && (
        <HouseDetailModal
          house={selectedHouseForDetail}
          report={dateReportsMap.get(selectedHouseForDetail.id) || null}
          selectedDate={selectedDate}
          activeTerm={activeTerm}
          allReportsForHouse={reports.filter(r => r.houseId === selectedHouseForDetail.id)}
          onClose={() => setSelectedHouseForDetail(null)}
          onRefreshData={onRefreshData}
        />
      )}

      {/* Universal Real Form Modal for 8 Houses */}
      <UniversalHouseparentFormModal
        isOpen={isUniversalFormOpen}
        onClose={() => setIsUniversalFormOpen(false)}
        houses={houses}
        activeTerm={activeTerm}
        initialHouseId={universalFormHouseId}
        initialDate={selectedDate}
        onReportSubmitted={onRefreshData}
        onOpenWhatsAppShare={(houseId, date) => handleOpenWhatsAppModal(houseId, date)}
      />

      {/* WhatsApp Share & Send Modal (House + Date Selection) */}
      <WhatsAppShareModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        houses={houses}
        reports={reports}
        activeTerm={activeTerm}
        settings={settings}
        initialHouseId={whatsAppModalHouseId}
        initialDate={selectedDate}
      />

      {/* Official Tally House Arrival Form Link Modal */}
      <SendFormLinkModal
        isOpen={isSendFormLinkOpen}
        onClose={() => setIsSendFormLinkOpen(false)}
        houses={houses}
        activeTerm={activeTerm}
        selectedDate={selectedDate}
        settings={settings}
      />
    </div>
  );
};
