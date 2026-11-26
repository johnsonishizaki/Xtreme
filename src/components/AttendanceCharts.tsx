import React from 'react';
import type { ChartDatum } from '../services/aiFormatter';
import type { HouseConfig, HouseDailyReport, DailyCollation } from '../types';

interface MiniChartPanelProps {
  title?: string;
  data: ChartDatum[];
  compact?: boolean;
}

export const MiniMetricChart: React.FC<MiniChartPanelProps> = ({
  title = 'Statistical Breakdown',
  data,
  compact = false
}) => {
  if (!data || data.length === 0) return null;

  return (
    <div className={`${compact ? 'mt-2.5 pt-2.5 border-t border-[var(--card-border-subtle)]' : 'p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]'} space-y-2.5`}>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold text-[var(--text-muted)] tracking-tight">{title}</span>
        <span className="font-mono text-[10px] text-[var(--text-subtle)] tabular-nums">
          {data.length} items
        </span>
      </div>

      <div className="space-y-2">
        {data.map((item, idx) => (
          <div key={`${item.label}-${idx}`} className="space-y-1">
            <div className="flex items-center justify-between text-[11px] gap-2">
              <span className="font-semibold text-[var(--text-page)] truncate">{item.label}</span>
              <span className="font-mono text-[var(--text-muted)] tabular-nums shrink-0">
                <strong className="text-[var(--text-page)]">{item.value}</strong>/{item.max} ({item.pct}%)
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${item.value > 0 ? Math.max(4, item.pct) : 0}%`,
                  backgroundColor: item.color
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface AttendanceAnalyticsPanelProps {
  collation: DailyCollation;
  houses: HouseConfig[];
  reports: HouseDailyReport[];
  dateReportsMap: Map<string, HouseDailyReport>;
  selectedDate: string;
}

export const AttendanceAnalyticsPanel: React.FC<AttendanceAnalyticsPanelProps> = ({
  collation,
  houses,
  reports,
  dateReportsMap
}) => {
  const activeHouses = [...houses]
    .filter(h => h.active)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  // SVG Radial Donut math
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const pctClamped = Math.max(0, Math.min(100, collation.reportingPercentage));
  const strokeDashoffset = circumference - (pctClamped / 100) * circumference;

  // Multi-day trend (up to last 7 distinct dates)
  const dailyTrend = React.useMemo(() => {
    const byDate = new Map<string, { reported: number; expected: number }>();
    const defaultExpected = activeHouses.reduce((acc, h) => acc + h.expectedStudentCount, 0) || 949;
    for (const r of reports) {
      if (!r.reportingDate) continue;
      const cur = byDate.get(r.reportingDate) || { reported: 0, expected: defaultExpected };
      cur.reported += r.reportedCount || 0;
      byDate.set(r.reportingDate, cur);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, vals]) => ({
        date: date.slice(5),
        fullDate: date,
        reported: vals.reported,
        pct: vals.expected > 0 ? Math.min(100, Math.round((vals.reported / vals.expected) * 100)) : 0
      }));
  }, [reports, activeHouses]);

  return (
    <div className="p-4 sm:p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Donut Gauge + Boys vs Girls Split */}
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 84 84" aria-label="Overall attendance rate">
              <circle
                cx="42"
                cy="42"
                r={radius}
                fill="none"
                stroke="var(--card-bg-elevated)"
                strokeWidth="8"
              />
              <circle
                cx="42"
                cy="42"
                r={radius}
                fill="none"
                stroke="#10b981"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center tabular-nums">
              <span className="text-sm font-extrabold text-[var(--text-page)]">{pctClamped}%</span>
            </div>
          </div>

          <div className="space-y-2 flex-1 min-w-[180px]">
            <div className="text-xs font-bold text-[var(--text-page)]">
              Cohort Comparison
            </div>
            <div className="space-y-1.5 text-[11px] tabular-nums">
              <div>
                <div className="flex justify-between mb-0.5">
                  <span className="text-[var(--text-muted)]">Boys</span>
                  <span className="font-mono font-semibold text-[var(--text-page)]">
                    {collation.boysReported}/{collation.boysExpected} ({collation.boysPercentage}%)
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--card-bg-elevated)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, collation.boysPercentage)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-0.5">
                  <span className="text-[var(--text-muted)]">Girls</span>
                  <span className="font-mono font-semibold text-[var(--text-page)]">
                    {collation.girlsReported}/{collation.girlsExpected} ({collation.girlsPercentage}%)
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--card-bg-elevated)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-pink-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, collation.girlsPercentage)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Multi-day Bar Trend (when >1 day recorded) */}
        {dailyTrend.length > 1 && (
          <div className="flex-1 sm:max-w-xs border-t sm:border-t-0 sm:border-l border-[var(--card-border-subtle)] pt-3 sm:pt-0 sm:pl-4">
            <div className="text-[11px] font-bold text-[var(--text-muted)] mb-2">
              Recent Reporting Trend
            </div>
            <div className="flex items-end gap-1.5 h-16">
              {dailyTrend.map(d => (
                <div key={d.fullDate} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group" title={`${d.fullDate}: ${d.reported} (${d.pct}%)`}>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t bg-emerald-500/80 group-hover:bg-emerald-400 transition-all"
                      style={{ height: `${Math.max(8, d.pct)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-[var(--text-subtle)] tabular-nums">
                    {d.date}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* House-by-House Comparison Bars */}
      <div className="pt-3 border-t border-[var(--card-border-subtle)]">
        <div className="flex items-center justify-between mb-2.5 text-xs">
          <span className="font-bold text-[var(--text-page)]">House Quota Attainment</span>
          <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
            {collation.reportsReceivedCount} of {collation.totalHousesCount} reported
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
          {activeHouses.map(h => {
            const rep = dateReportsMap.get(h.id);
            const expected = rep ? rep.expectedCount : h.expectedStudentCount;
            const reported = rep ? rep.reportedCount : 0;
            const pct = expected > 0 ? Math.min(100, Math.round((reported / expected) * 100)) : 0;
            const barColor = !rep
              ? 'bg-amber-500/40'
              : pct >= 100
                ? 'bg-emerald-500'
                : h.category === 'Boys'
                  ? 'bg-blue-500'
                  : 'bg-pink-500';

            return (
              <div key={h.id} className="space-y-1 text-[11px] tabular-nums">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[var(--text-page)] truncate">{h.name}</span>
                  <span className="font-mono text-[var(--text-muted)] shrink-0">
                    {reported}/{expected} <span className="text-[10px]">({pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--card-bg-elevated)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${reported > 0 ? Math.max(4, pct) : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
