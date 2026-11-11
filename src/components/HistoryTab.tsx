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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24 text-left">
      {/* Header */}
      <div className="pb-1">
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-page)]">
          History
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Past attendance reports and sent announcements
        </p>
      </div>

      {/* Sub-Tab Navigation */}
      <div className="flex rounded-xl p-1 bg-[var(--nav-bg)] border border-[var(--card-border)]">
        <button
          type="button"
          onClick={() => setActiveSubTab('house')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeSubTab === 'house'
              ? 'bg-emerald-500 text-black font-semibold'
              : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>House Attendance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('duty')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeSubTab === 'duty'
              ? 'bg-emerald-500 text-black font-semibold'
              : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Duty Announcements ({dutyHistory.length})</span>
        </button>
      </div>

      {/* 1. HOUSE REPORTING HISTORY SUB-TAB */}
      {activeSubTab === 'house' && (
        <div className="space-y-4">
          {/* Reporting Trend Progress Chart */}
          {trendData.length > 0 && (
            <div className="p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-page)]">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span>Attendance Progression</span>
              </div>

              <div className="space-y-2.5">
                {trendData.map((day, idx) => (
                  <div key={day.date} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--text-page)]">
                        Day {idx + 1} · {day.date}
                      </span>
                      <span className="text-emerald-500 font-semibold">
                        {day.reported} / {day.expected} ({day.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden">
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

          {/* Date Selector */}
          {availableDates.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-[var(--text-muted)]">
                Dates ({availableDates.length})
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {availableDates.map(dateStr => (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setSelectedHistoricalDate(dateStr)}
                    className={`px-3 py-1.5 rounded-lg text-xs shrink-0 transition-all cursor-pointer border ${
                      selectedHistoricalDate === dateStr
                        ? 'bg-emerald-500 text-black font-semibold border-emerald-500'
                        : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-page)]'
                    }`}
                  >
                    {dateStr}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Historical Date Summary Box */}
          <div className="p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-3">
            <div className="border-b border-[var(--card-border-subtle)] pb-2.5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-page)]">{selectedHistoricalDate}</h3>
              </div>
              <div className="text-xs font-medium text-emerald-500">
                {historicalCollation.reportingPercentage}% Reported
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)]">
                <div className="text-[11px] text-[var(--text-muted)]">Expected</div>
                <div className="text-base font-bold text-[var(--text-page)] mt-0.5">{historicalCollation.totalExpected}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)]">
                <div className="text-[11px] text-[var(--text-muted)]">Reported</div>
                <div className="text-base font-bold text-emerald-500 mt-0.5">{historicalCollation.totalReported}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)]">
                <div className="text-[11px] text-[var(--text-muted)]">Missing</div>
                <div className="text-base font-bold text-amber-500 mt-0.5">{historicalCollation.totalNotReported}</div>
              </div>
            </div>

            {/* 8 Houses Breakdown for this Date */}
            <div className="space-y-1.5 pt-1">
              <div className="space-y-1.5">
                {houses.map(h => {
                  const rep = historicalDateReports.find(r => r.houseId === h.id);
                  const expected = rep ? rep.expectedCount : h.expectedStudentCount;
                  const reported = rep ? rep.reportedCount : 0;
                  const notReported = rep ? rep.notReportedCount : expected;

                  return (
                    <div
                      key={h.id}
                      className="p-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[var(--text-page)] flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${h.category === 'Boys' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                          <span>{h.name}</span>
                          <span className="text-[11px] text-[var(--text-muted)]">({h.assignedHouseparent})</span>
                        </div>
                        {rep?.notReportedDetails && (
                          <div className="text-[11px] text-amber-400/90 mt-0.5 truncate max-w-sm">
                            {rep.notReportedDetails}
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        {rep ? (
                          <span className="font-semibold text-emerald-500">
                            {reported} / {expected}
                          </span>
                        ) : (
                          <span className="text-amber-500 font-medium">Missing</span>
                        )}
                        {notReported > 0 && (
                          <div className="text-[10px] text-amber-500">{notReported} not reported</div>
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
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-[var(--text-muted)]" />
            <input
              type="text"
              value={dutySearchQuery}
              onChange={e => setDutySearchQuery(e.target.value)}
              placeholder="Search announcements..."
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] focus:border-emerald-500 outline-none"
            />
            {dutySearchQuery && (
              <button
                type="button"
                onClick={() => setDutySearchQuery('')}
                className="absolute right-2.5 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-page)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {filteredDutyHistory.length === 0 ? (
            <div className="p-6 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] text-center space-y-1.5">
              <Clock className="w-7 h-7 text-[var(--text-muted)] mx-auto" />
              <div className="text-sm font-semibold text-[var(--text-page)]">No History</div>
              <p className="text-xs text-[var(--text-muted)] max-w-xs mx-auto">
                Sent and copied duty announcements will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredDutyHistory.map(item => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-[var(--text-page)]">{item.weekLabel}</span>
                      <div className="text-[11px] text-[var(--text-muted)]">{item.dutyPeriod}</div>
                    </div>
                    <span className="text-xs font-medium text-emerald-500">
                      {item.status === 'sent_confirmed' ? 'Sent' : 'Copied'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[var(--code-bg)] border border-[var(--card-border-subtle)] text-xs font-mono whitespace-pre-wrap leading-relaxed text-[var(--text-page)] max-h-36 overflow-y-auto scrollbar-thin">
                    {item.message}
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => handleReCopyDuty(item)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 cursor-pointer border ${
                        copiedDutyId === item.id
                          ? 'bg-emerald-500 text-black border-emerald-500 font-semibold'
                          : 'border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:bg-[var(--card-bg)] text-[var(--text-page)]'
                      }`}
                    >
                      {copiedDutyId === item.id ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Copy</span>
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
