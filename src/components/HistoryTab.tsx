import React, { useState, useMemo } from 'react';
import {
  History,
  Calendar,
  CheckCircle2,
  Copy,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  Search,
  X,
  Filter,
  Users,
  AlertTriangle
} from 'lucide-react';
import {
  HouseConfig,
  HouseDailyReport,
  AcademicTerm,
  SendHistory,
  DailyCollation
} from '../types';
import { collateDailyReports } from '../services/firebase';
import { copyToClipboard } from '../services/messageGenerator';

interface HistoryTabProps {
  houses: HouseConfig[];
  reports: HouseDailyReport[];
  terms: AcademicTerm[];
  dutyHistory: SendHistory[];
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  houses,
  reports,
  terms,
  dutyHistory
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'house' | 'duty'>('house');

  // Duty history search
  const [dutySearchQuery, setDutySearchQuery] = useState('');
  const [copiedDutyId, setCopiedDutyId] = useState<string | null>(null);

  // House history selected date
  const availableDates = useMemo(() => {
    const set = new Set<string>();
    for (const r of reports) {
      if (r.reportingDate) set.add(r.reportingDate);
    }
    const arr = Array.from(set);
    arr.sort((a, b) => b.localeCompare(a)); // Descending order
    return arr;
  }, [reports]);

  const [selectedHistoricalDate, setSelectedHistoricalDate] = useState<string>(() => {
    return availableDates[0] || new Date().toISOString().split('T')[0];
  });

  const activeTerm = terms[0] || { id: 'term-1', termName: 'Term 1', academicYear: '2026/2027' };

  // Collation for historical date
  const historicalCollation: DailyCollation = useMemo(() => {
    return collateDailyReports(reports, houses, selectedHistoricalDate, activeTerm.id);
  }, [reports, houses, selectedHistoricalDate, activeTerm.id]);

  // Reports for historical date
  const historicalDateReports = useMemo(() => {
    return reports.filter(r => r.reportingDate === selectedHistoricalDate);
  }, [reports, selectedHistoricalDate]);

  // Trend progression across dates
  const trendData = useMemo(() => {
    const datesAsc = [...availableDates].sort((a, b) => a.localeCompare(b));
    return datesAsc.map(d => {
      const coll = collateDailyReports(reports, houses, d, activeTerm.id);
      return {
        date: d,
        reported: coll.totalReported,
        expected: coll.totalExpected,
        percentage: coll.reportingPercentage,
        receivedCount: coll.reportsReceivedCount
      };
    });
  }, [availableDates, reports, houses, activeTerm.id]);

  // Filtered duty history
  const filteredDutyHistory = useMemo(() => {
    const q = dutySearchQuery.trim().toLowerCase();
    if (!q) return dutyHistory;
    return dutyHistory.filter(h =>
      h.weekLabel.toLowerCase().includes(q) ||
      h.dutyPeriod.toLowerCase().includes(q) ||
      h.message.toLowerCase().includes(q)
    );
  }, [dutyHistory, dutySearchQuery]);

  const handleReCopyDuty = async (item: SendHistory) => {
    const ok = await copyToClipboard(item.message);
    if (ok) {
      setCopiedDutyId(item.id);
      setTimeout(() => setCopiedDutyId(null), 2500);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-28 text-left">
      {/* Header */}
      <div>
        <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-500">
          Operational Archive
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-page)]">
          History & Trends
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          House reporting progression logs & duty announcement activity archive
        </p>
      </div>

      {/* Sub-Tab Navigation */}
      <div className="flex rounded-2xl p-1 bg-[var(--nav-bg)] border border-[var(--card-border)]">
        <button
          type="button"
          onClick={() => setActiveSubTab('house')}
          className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeSubTab === 'house'
              ? 'bg-emerald-500 text-black shadow-md'
              : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>House Reporting History</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('duty')}
          className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeSubTab === 'duty'
              ? 'bg-emerald-500 text-black shadow-md'
              : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Duty Announcements ({dutyHistory.length})</span>
        </button>
      </div>

      {/* 1. HOUSE REPORTING HISTORY SUB-TAB */}
      {activeSubTab === 'house' && (
        <div className="space-y-6">
          {/* Reporting Trend Progress Chart */}
          {trendData.length > 0 && (
            <div className="p-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
              <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
                <TrendingUp className="w-4 h-4" />
                <span>Term Opening Reporting Progression</span>
              </div>

              <div className="space-y-3">
                {trendData.map((day, idx) => (
                  <div key={day.date} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-bold text-[var(--text-page)]">
                        Day {idx + 1} &bull; {day.date}
                      </span>
                      <span className="text-emerald-400 font-extrabold">
                        {day.reported} / {day.expected} ({day.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, day.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Date Selector Pills */}
          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
              Select Reporting Date ({availableDates.length} recorded)
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {availableDates.map(dateStr => (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedHistoricalDate(dateStr)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-mono shrink-0 transition-all cursor-pointer border ${
                    selectedHistoricalDate === dateStr
                      ? 'bg-emerald-500 text-black font-extrabold border-emerald-500 shadow-md'
                      : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-page)]'
                  }`}
                >
                  {dateStr}
                </button>
              ))}
            </div>
          </div>

          {/* Historical Date Summary Box */}
          <div className="p-5 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-4">
            <div className="border-b border-[var(--card-border-subtle)] pb-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono uppercase text-emerald-400 font-bold">Collation Record</div>
                <h3 className="text-lg font-black text-[var(--text-page)]">{selectedHistoricalDate}</h3>
              </div>
              <div className="text-xs font-mono px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                {historicalCollation.reportingPercentage}% Reported
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center text-xs font-mono">
              <div className="p-3 rounded-2xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)]">
                <div className="text-[10px] text-[var(--text-muted)]">Expected</div>
                <div className="text-lg font-black text-[var(--text-page)] mt-0.5">{historicalCollation.totalExpected}</div>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)]">
                <div className="text-[10px] text-[var(--text-muted)]">Reported</div>
                <div className="text-lg font-black text-emerald-400 mt-0.5">{historicalCollation.totalReported}</div>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)]">
                <div className="text-[10px] text-[var(--text-muted)]">Not Reported</div>
                <div className="text-lg font-black text-amber-400 mt-0.5">{historicalCollation.totalNotReported}</div>
              </div>
            </div>

            {/* 8 Houses Breakdown for this Date */}
            <div className="space-y-2 pt-2">
              <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] font-bold">
                8 Houses Breakdown ({selectedHistoricalDate})
              </div>
              <div className="space-y-2">
                {houses.map(h => {
                  const rep = historicalDateReports.find(r => r.houseId === h.id);
                  const expected = rep ? rep.expectedCount : h.expectedStudentCount;
                  const reported = rep ? rep.reportedCount : 0;
                  const notReported = rep ? rep.notReportedCount : expected;

                  return (
                    <div
                      key={h.id}
                      className="p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] flex items-center justify-between text-xs font-mono"
                    >
                      <div>
                        <div className="font-bold text-[var(--text-page)] flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${h.category === 'Boys' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                          <span>{h.name}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">({h.assignedHouseparent})</span>
                        </div>
                        {rep?.notReportedDetails && (
                          <div className="text-[10px] text-amber-400/90 mt-0.5 truncate max-w-sm">
                            ⚠️ {rep.notReportedDetails}
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        {rep ? (
                          <span className="font-extrabold text-emerald-400">
                            {reported} / {expected}
                          </span>
                        ) : (
                          <span className="text-amber-400 font-bold">No Report Received</span>
                        )}
                        {notReported > 0 && (
                          <div className="text-[10px] text-amber-400">{notReported} not reported</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. DUTY ANNOUNCEMENTS HISTORY SUB-TAB */}
      {activeSubTab === 'duty' && (
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--text-subtle)]" />
            <input
              type="text"
              value={dutySearchQuery}
              onChange={e => setDutySearchQuery(e.target.value)}
              placeholder="Search sent announcements..."
              className="w-full pl-10 pr-9 py-3 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] shadow-inner"
            />
            {dutySearchQuery && (
              <button
                type="button"
                onClick={() => setDutySearchQuery('')}
                className="absolute right-3 top-3 text-[var(--text-subtle)] hover:text-[var(--text-page)]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {filteredDutyHistory.length === 0 ? (
            <div className="p-8 rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] text-center space-y-2">
              <Clock className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
              <div className="text-sm font-bold text-[var(--text-page)]">No Announcements Found</div>
              <p className="text-xs text-[var(--text-muted)] max-w-xs mx-auto">
                When you tap Copy Message or Mark as Sent in the Duty tab, records appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDutyHistory.map(item => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-3 shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-[var(--text-page)]">{item.weekLabel}</span>
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">{item.dutyPeriod}</div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold uppercase">
                      {item.status === 'sent_confirmed' ? 'Sent' : 'Copied'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--code-bg)] border border-[var(--card-border-subtle)] text-xs font-mono whitespace-pre-wrap leading-relaxed text-[var(--text-page)]">
                    {item.message}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] font-mono text-[var(--text-subtle)] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(item.timestamp).toLocaleString()}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => handleReCopyDuty(item)}
                      className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                        copiedDutyId === item.id
                          ? 'bg-emerald-500 text-black border-emerald-500'
                          : 'border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:border-emerald-500 text-[var(--text-page)]'
                      }`}
                    >
                      {copiedDutyId === item.id ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Copy Again</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
