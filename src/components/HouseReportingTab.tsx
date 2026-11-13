import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Share2,
  Send
} from 'lucide-react';
import { getTallyStatus, syncTallyNow } from '../services/tallyClient';
import {
  HouseConfig,
  HouseDailyReport,
  AcademicTerm,
  DailyCollation,
  AppSettings
} from '../types';
import { collateDailyReports, DEFAULT_SETTINGS } from '../services/firebase';
import { DEFAULT_TERM } from '../services/sampleData';
import {
  copyToClipboard,
  formatDutyDate,
  generateFullCollationWhatsAppMessage
} from '../services/messageGenerator';
import { HouseDetailModal } from './HouseDetailModal';
import { SendFormLinkModal } from './SendFormLinkModal';
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
  onRefreshData
}) => {
  const activeTerm = useMemo(() => {
    return terms.find(t => t.status === 'open') || terms[0] || DEFAULT_TERM;
  }, [terms]);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [selectedHouseForDetail, setSelectedHouseForDetail] = useState<HouseConfig | null>(null);
  const [isSendFormLinkOpen, setIsSendFormLinkOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppModalHouseId, setWhatsAppModalHouseId] = useState<string>('all');
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Auto-switch selectedDate to today if today has reports, or latest valid report date
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

  // Silent 1-second automatic synchronization
  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const performSyncCycle = async () => {
      try {
        if (!isMounted) return;
        await onRefreshData();

        const status = await getTallyStatus();
        if (!isMounted) return;
        if (status.hasApiKey && !status.isSyncInProgress && document.visibilityState === 'visible') {
          const res = await syncTallyNow();
          if (isMounted && res.success && res.newReportsImported > 0) {
            await onRefreshData();
          }
        }
      } catch {
        // Silent background cycle
      }
    };

    performSyncCycle();

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

  const handleOpenWhatsAppModal = (houseId: string = 'all', date?: string) => {
    setWhatsAppModalHouseId(houseId);
    if (date) setSelectedDate(date);
    setIsWhatsAppModalOpen(true);
  };

  const collation: DailyCollation = useMemo(() => {
    return collateDailyReports(reports, houses, selectedDate, activeTerm.id);
  }, [reports, houses, selectedDate, activeTerm.id]);

  const boysHouses = useMemo(() => houses.filter(h => h.active && h.category === 'Boys'), [houses]);
  const girlsHouses = useMemo(() => houses.filter(h => h.active && h.category === 'Girls'), [houses]);

  const dateReportsMap = useMemo(() => {
    const map = new Map<string, HouseDailyReport>();
    for (const r of reports) {
      if (r.reportingDate === selectedDate) {
        map.set(r.houseId, r);
      }
    }
    return map;
  }, [reports, selectedDate]);

  const followUpItems = useMemo(() => {
    const items: Array<{ house: HouseConfig; report: HouseDailyReport }> = [];
    for (const house of houses) {
      const rep = dateReportsMap.get(house.id);
      if (rep && rep.notReportedDetails && rep.notReportedDetails.trim()) {
        items.push({ house, report: rep });
      }
    }
    return items;
  }, [houses, dateReportsMap]);

  const summaryText = useMemo(() => {
    const activeOrderedHouses = [...houses]
      .filter(h => h.active)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    return generateFullCollationWhatsAppMessage(
      collation,
      activeOrderedHouses,
      dateReportsMap,
      selectedDate
    );
  }, [collation, houses, dateReportsMap, selectedDate]);

  const handleCopySummary = async () => {
    await copyToClipboard(summaryText);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  const renderHouseCard = (house: HouseConfig, accentBarClass: string) => {
    const report = dateReportsMap.get(house.id);
    const expected = report ? report.expectedCount : house.expectedStudentCount;
    const reported = report ? report.reportedCount : 0;
    const notReported = report ? report.notReportedCount : expected;
    const percentage = expected > 0 ? Math.min(100, Number(((reported / expected) * 100).toFixed(1))) : 0;
    const hasReport = !!report;

    return (
      <div
        key={house.id}
        onClick={() => setSelectedHouseForDetail(house)}
        className={`p-3.5 rounded-xl border transition-colors cursor-pointer group hover:border-emerald-500/45 ${
          hasReport
            ? 'border-[var(--card-border)] bg-[var(--card-bg)]'
            : 'border-amber-500/30 bg-amber-500/5'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--text-page)] group-hover:text-emerald-500 transition-colors truncate">
              {house.name}
            </h3>
            <div className="text-[11px] text-[var(--text-muted)] truncate">
              {house.assignedHouseparent || 'Houseparent'}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 tabular-nums">
            <div className="text-right">
              <div className="text-base font-extrabold text-[var(--text-page)] leading-none">
                {reported}<span className="text-xs font-normal text-[var(--text-muted)]">/{expected}</span>
              </div>
              <div className={`text-[11px] font-semibold mt-0.5 ${hasReport ? (notReported > 0 ? 'text-amber-500' : 'text-emerald-500') : 'text-amber-500'}`}>
                {!hasReport ? 'Missing' : notReported > 0 ? `${notReported} pending` : 'Full'}
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenWhatsAppModal(house.id, selectedDate);
              }}
              title="Send WhatsApp update"
              className="min-w-[32px] min-h-[32px] rounded-lg text-[var(--text-muted)] hover:text-emerald-500 hover:bg-emerald-500/10 flex items-center justify-center cursor-pointer transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="w-full h-1 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden mt-2.5">
          <div
            className={`h-full rounded-full transition-all duration-300 ${hasReport ? accentBarClass : 'bg-amber-500/40'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 space-y-5 pb-16 text-left">
      {/* Header + Single Date Picker + Two Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-[var(--text-page)]">
            Attendance
          </h1>
          <div className="text-xs text-[var(--text-muted)] tabular-nums">
            {activeTerm.termName} ({activeTerm.academicYear})
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="min-h-[38px] flex items-center gap-1.5 px-3 py-1 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-xs">
            <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-[var(--text-page)] font-mono tabular-nums focus:outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsSendFormLinkOpen(true)}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Form Link</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenWhatsAppModal('all', selectedDate)}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500/50 text-[var(--text-page)] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Send className="w-3.5 h-3.5 text-emerald-500" />
            <span>WhatsApp Summary</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="p-4 sm:p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-[var(--text-muted)]">
            {formatDutyDate(selectedDate)}
          </div>
          <button
            type="button"
            onClick={handleCopySummary}
            className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:border-emerald-500/40 text-xs font-semibold text-[var(--text-page)] flex items-center gap-1 cursor-pointer transition-colors"
          >
            {copiedSummary ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSummary ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 tabular-nums">
          <div>
            <div className="text-xs text-[var(--text-muted)]">Reported</div>
            <div className="text-2xl font-extrabold text-emerald-500 mt-0.5">
              {collation.totalReported}
              <span className="text-xs font-semibold text-[var(--text-muted)] ml-1.5">
                ({collation.reportingPercentage}%)
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs text-[var(--text-muted)]">Quota</div>
            <div className="text-2xl font-extrabold text-[var(--text-page)] mt-0.5">
              {collation.totalExpected}
            </div>
          </div>

          <div>
            <div className="text-xs text-[var(--text-muted)]">Not Reported</div>
            <div className={`text-2xl font-extrabold mt-0.5 ${collation.totalNotReported > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
              {collation.totalNotReported}
            </div>
          </div>

          <div>
            <div className="text-xs text-[var(--text-muted)]">Houses In</div>
            <div className="text-2xl font-extrabold text-[var(--text-page)] mt-0.5">
              {collation.reportsReceivedCount}/{collation.totalHousesCount}
            </div>
          </div>
        </div>

        <div className="w-full h-1.5 rounded-full bg-[var(--card-bg-elevated)] overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, collation.reportingPercentage)}%` }}
          />
        </div>

        <div className="text-xs text-[var(--text-muted)] flex flex-wrap justify-between gap-2 pt-1 tabular-nums">
          <span>
            Boys: <strong className="text-[var(--text-page)]">{collation.boysReported}/{collation.boysExpected}</strong> ({collation.boysPercentage}%)
          </span>
          <span>
            Girls: <strong className="text-[var(--text-page)]">{collation.girlsReported}/{collation.girlsExpected}</strong> ({collation.girlsPercentage}%)
          </span>
        </div>
      </div>

      {/* Boys & Girls Houses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section className="space-y-2.5">
          <h2 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Boys Houses (4)
          </h2>
          <div className="space-y-2">
            {boysHouses.map(house => renderHouseCard(house, 'bg-blue-500'))}
          </div>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Girls Houses (4)
          </h2>
          <div className="space-y-2">
            {girlsHouses.map(house => renderHouseCard(house, 'bg-pink-500'))}
          </div>
        </section>
      </div>

      {/* Follow-up Notes (only rendered when notes exist) */}
      {followUpItems.length > 0 && (
        <section className="p-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Follow-Up Notes ({followUpItems.length})</span>
          </div>
          <div className="divide-y divide-[var(--card-border-subtle)]">
            {followUpItems.map(({ house, report }) => (
              <button
                key={house.id}
                type="button"
                onClick={() => setSelectedHouseForDetail(house)}
                className="w-full py-2 text-left flex items-baseline justify-between gap-3 text-xs hover:text-emerald-500 transition-colors cursor-pointer"
              >
                <span className="font-semibold text-[var(--text-page)] shrink-0">{house.name}:</span>
                <span className="text-[var(--text-muted)] flex-1 truncate">{report.notReportedDetails}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Detail & Form Modals */}
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
