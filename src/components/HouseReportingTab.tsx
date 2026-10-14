import React, { useState, useMemo } from 'react';
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
  Loader2
} from 'lucide-react';
import {
  HouseConfig,
  HouseDailyReport,
  AcademicTerm,
  DailyCollation
} from '../types';
import { collateDailyReports, setTermStatus } from '../services/firebase';
import { copyToClipboard } from '../services/messageGenerator';
import { HouseDetailModal } from './HouseDetailModal';

interface HouseReportingTabProps {
  houses: HouseConfig[];
  reports: HouseDailyReport[];
  terms: AcademicTerm[];
  onRefreshData: () => Promise<void>;
  onOpenSettings: (subSection?: string) => void;
}

export const HouseReportingTab: React.FC<HouseReportingTabProps> = ({
  houses,
  reports,
  terms,
  onRefreshData,
  onOpenSettings
}) => {
  const activeTerm = useMemo(() => {
    return terms.find(t => t.status === 'open') || terms[0];
  }, [terms]);

  // Selected reporting date (defaults to today's date or the active term opening date)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // If today is later than openingDate, use today in YYYY-MM-DD
    const todayStr = new Date().toISOString().split('T')[0];
    return todayStr;
  });

  const [selectedHouseForDetail, setSelectedHouseForDetail] = useState<HouseConfig | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [followUpFilterHouse, setFollowUpFilterHouse] = useState<string>('all');
  const [isTogglingPeriod, setIsTogglingPeriod] = useState(false);

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
      if (r.reportingDate === selectedDate && r.termId === activeTerm.id) {
        map.set(r.houseId, r);
      }
    }
    return map;
  }, [reports, selectedDate, activeTerm.id]);

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
    } finally {
      setIsTogglingPeriod(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-28 text-left">
      {/* Top Title & Academic Term Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-500">
            Senior Houseparent Operational Suite
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-page)]">
            House Reporting
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            8-House student reporting collation & opening attendance tracking
          </p>
        </div>

        {/* Date Selector & Term Status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-xs font-mono">
            <Calendar className="w-3.5 h-3.5 text-emerald-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-[var(--text-page)] focus:outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={handleToggleTermPeriod}
            disabled={isTogglingPeriod}
            title={activeTerm.status === 'open' ? 'Click to Close Reporting Period' : 'Click to Reopen Reporting Period'}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1 cursor-pointer transition-all border disabled:opacity-60 ${
              activeTerm.status === 'open'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
            }`}
          >
            {isTogglingPeriod ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Updating...</span>
              </>
            ) : activeTerm.status === 'open' ? (
              <>
                <Unlock className="w-3 h-3" />
                <span>Period Open</span>
              </>
            ) : (
              <>
                <Lock className="w-3 h-3" />
                <span>Period Closed</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* DAILY SCHOOL REPORT COLLATION CARD */}
      <div className="p-6 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--shadow-card)] space-y-5">
        <div className="flex items-center justify-between border-b border-[var(--card-border-subtle)] pb-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
              {activeTerm.termName} ({activeTerm.academicYear}) &bull; Collation
            </div>
            <h2 className="text-lg font-black text-[var(--text-page)]">
              Term Opening Report
            </h2>
          </div>

          <button
            type="button"
            onClick={handleCopySummary}
            className={`px-3.5 py-2 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
              copiedSummary
                ? 'bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/20'
                : 'border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:border-emerald-500 text-[var(--text-page)]'
            }`}
          >
            {copiedSummary ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Summary Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-emerald-500" />
                <span>Copy Daily Summary</span>
              </>
            )}
          </button>
        </div>

        {/* 4 Big Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-center">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Total Expected</div>
            <div className="text-2xl font-black text-[var(--text-page)] mt-1">
              {collation.totalExpected}
            </div>
            <div className="text-[10px] font-mono text-[var(--text-subtle)] mt-0.5">Students</div>
          </div>

          <div className="p-3.5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-center">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Total Reported</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">
              {collation.totalReported}
            </div>
            <div className="text-[10px] font-mono text-emerald-500/80 mt-0.5">
              {collation.reportingPercentage}% rate
            </div>
          </div>

          <div className="p-3.5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-center">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Not Yet Reported</div>
            <div className={`text-2xl font-black mt-1 ${
              collation.totalNotReported > 0 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {collation.totalNotReported}
            </div>
            <div className="text-[10px] font-mono text-[var(--text-subtle)] mt-0.5">Remaining</div>
          </div>

          <div className="p-3.5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-center">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">House Reports</div>
            <div className={`text-2xl font-black mt-1 ${
              collation.reportsReceivedCount === collation.totalHousesCount
                ? 'text-emerald-400'
                : 'text-amber-400'
            }`}>
              {collation.reportsReceivedCount} / {collation.totalHousesCount}
            </div>
            <div className="text-[10px] font-mono text-[var(--text-subtle)] mt-0.5">Submitted</div>
          </div>
        </div>

        {/* Category Breakdown (Boys vs Girls) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3.5 rounded-2xl border border-blue-500/20 bg-blue-500/5 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-blue-400">BOYS HOUSES (4)</span>
              <span className="font-extrabold text-[var(--text-page)]">
                {collation.boysReported} / {collation.boysExpected} ({collation.boysPercentage}%)
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-blue-950/40 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, collation.boysPercentage)}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-[var(--text-muted)] flex justify-between">
              <span>Not reported: {collation.boysNotReported}</span>
              <span>4 houses</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl border border-pink-500/20 bg-pink-500/5 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-pink-400">GIRLS HOUSES (4)</span>
              <span className="font-extrabold text-[var(--text-page)]">
                {collation.girlsReported} / {collation.girlsExpected} ({collation.girlsPercentage}%)
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-pink-950/40 overflow-hidden">
              <div
                className="h-full bg-pink-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, collation.girlsPercentage)}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-[var(--text-muted)] flex justify-between">
              <span>Not reported: {collation.girlsNotReported}</span>
              <span>4 houses</span>
            </div>
          </div>
        </div>
      </div>

      {/* MISSING HOUSE REPORTS ALERT (Distinguishes Report Missing vs Students Missing) */}
      {collation.missingHouseIds.length > 0 && (
        <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>House Reports Missing for {selectedDate} ({collation.missingHouseIds.length})</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            The following houseparent(s) have not yet submitted their daily report. Tap a house to manually log their count or remind them:
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {collation.missingHouseIds.map(hId => {
              const house = houses.find(h => h.id === hId);
              if (!house) return null;
              return (
                <button
                  key={hId}
                  type="button"
                  onClick={() => setSelectedHouseForDetail(house)}
                  className="px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <span>{house.name}</span>
                  <span className="text-[10px] opacity-75">({house.assignedHouseparent})</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 8 HOUSES GRID: BOYS (4) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider text-blue-400">
          <span>Boys Houses (4)</span>
          <span className="text-[var(--text-subtle)] font-normal">Tap any house for details / correction</span>
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
                className={`p-4 rounded-2xl border transition-all cursor-pointer group hover:scale-[1.01] ${
                  hasReport
                    ? 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500/50'
                    : 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] font-mono text-[var(--text-subtle)] uppercase">
                      {house.category} &bull; {house.assignedHouseparent}
                    </div>
                    <h3 className="text-base font-bold text-[var(--text-page)] group-hover:text-emerald-400 transition-colors">
                      {house.name}
                    </h3>
                  </div>

                  {hasReport ? (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Received</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Missing</span>
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-baseline justify-between">
                  <div className="text-xl font-black text-[var(--text-page)]">
                    {reported} <span className="text-xs font-mono font-normal text-[var(--text-muted)]">/ {expected}</span>
                  </div>
                  <div className="text-xs font-mono">
                    {notReported > 0 ? (
                      <span className="text-amber-400 font-bold">{notReported} not reported</span>
                    ) : (
                      <span className="text-emerald-400 font-bold">100% full</span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      hasReport ? 'bg-blue-500' : 'bg-amber-500/50'
                    }`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                  />
                </div>

                {report?.notReportedDetails && (
                  <div className="mt-2 text-[11px] text-amber-300/90 font-mono truncate bg-amber-500/10 px-2 py-1 rounded-lg">
                    ⚠️ {report.notReportedDetails}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 8 HOUSES GRID: GIRLS (4) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider text-pink-400">
          <span>Girls Houses (4)</span>
          <span className="text-[var(--text-subtle)] font-normal">Tap any house for details / correction</span>
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
                className={`p-4 rounded-2xl border transition-all cursor-pointer group hover:scale-[1.01] ${
                  hasReport
                    ? 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500/50'
                    : 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] font-mono text-[var(--text-subtle)] uppercase">
                      {house.category} &bull; {house.assignedHouseparent}
                    </div>
                    <h3 className="text-base font-bold text-[var(--text-page)] group-hover:text-emerald-400 transition-colors">
                      {house.name}
                    </h3>
                  </div>

                  {hasReport ? (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Received</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Missing</span>
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-baseline justify-between">
                  <div className="text-xl font-black text-[var(--text-page)]">
                    {reported} <span className="text-xs font-mono font-normal text-[var(--text-muted)]">/ {expected}</span>
                  </div>
                  <div className="text-xs font-mono">
                    {notReported > 0 ? (
                      <span className="text-amber-400 font-bold">{notReported} not reported</span>
                    ) : (
                      <span className="text-emerald-400 font-bold">100% full</span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      hasReport ? 'bg-pink-500' : 'bg-amber-500/50'
                    }`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                  />
                </div>

                {report?.notReportedDetails && (
                  <div className="mt-2 text-[11px] text-amber-300/90 font-mono truncate bg-amber-500/10 px-2 py-1 rounded-lg">
                    ⚠️ {report.notReportedDetails}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* FOLLOW-UP REQUIRED AGGREGATION LIST */}
      <div className="p-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[var(--card-border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-page)]">
                Students Requiring Follow-Up ({followUpItems.length})
              </h3>
              <p className="text-[10px] font-mono text-[var(--text-muted)]">
                Aggregated issues submitted by houseparents for {selectedDate}
              </p>
            </div>
          </div>

          {/* Filter dropdown */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <select
              value={followUpFilterHouse}
              onChange={e => setFollowUpFilterHouse(e.target.value)}
              className="text-xs font-mono rounded-xl px-2.5 py-1.5 border border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-[var(--text-page)] focus:outline-none"
            >
              <option value="all">All Houses</option>
              {houses.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
        </div>

        {followUpItems.length === 0 ? (
          <div className="p-6 rounded-2xl border border-[var(--card-border-subtle)] text-center text-xs font-mono text-[var(--text-muted)]">
            ✅ No follow-up issues recorded for {selectedDate}. All reported students accounted for.
          </div>
        ) : (
          <div className="space-y-2.5">
            {followUpItems.map(({ house, report }) => (
              <div
                key={house.id}
                onClick={() => setSelectedHouseForDetail(house)}
                className="p-3.5 rounded-2xl border border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40 cursor-pointer transition-all space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--text-page)] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    {house.name}
                  </span>
                  <span className="text-[11px] font-mono font-semibold text-amber-400">
                    {report.notReportedCount} students not reported
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap pl-3.5">
                  {report.notReportedDetails || 'No detailed reason supplied yet.'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

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
    </div>
  );
};
