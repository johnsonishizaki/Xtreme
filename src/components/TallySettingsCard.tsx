import React, { useState, useEffect } from 'react';
import {
  Radio,
  CheckCircle2,
  ExternalLink,
  Copy,
  Send,
  Share2,
  Clock,
  Sparkles
} from 'lucide-react';
import { copyToClipboard, openWhatsApp } from '../services/messageGenerator';
import {
  getTallyStatus,
  syncTallyNow,
  TallyStatusResponse
} from '../services/tallyClient';

interface TallySettingsCardProps {
  onRefreshData: () => Promise<void>;
  showNotification?: (msg: string) => void;
  showErrorNotification?: (msg: string) => void;
}

export const TallySettingsCard: React.FC<TallySettingsCardProps> = ({
  onRefreshData
}) => {
  const [status, setStatus] = useState<TallyStatusResponse | null>(null);
  const [copiedFormUrl, setCopiedFormUrl] = useState<boolean>(false);
  const formId = '2jBVWA';

  const refreshStatus = async () => {
    try {
      const data = await getTallyStatus();
      setStatus(data);
    } catch (err: any) {
      console.warn('Could not fetch form status:', err);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  // Automated 1-second auto-sync loop (no manual buttons required)
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    timer = setInterval(async () => {
      if (document.visibilityState === 'visible') {
        try {
          const res = await syncTallyNow();
          if (res.success && res.newReportsImported > 0) {
            await onRefreshData();
          }
          const updatedStatus = await getTallyStatus();
          setStatus(updatedStatus);
        } catch (e) {
          // Silent background execution
        }
      }
    }, 1000);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-4 text-left">
      {/* Main Integration Card */}
      <div className="p-5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-page)]">Online Attendance Form</h3>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Auto-Syncing Live (1s)
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Automated continuous sync for Daily House Reports
              </p>
            </div>
          </div>
        </div>

        {/* Quick Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border-subtle)]">
          <div>
            <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Submissions</div>
            <div className="text-xl font-bold text-[var(--text-page)] mt-0.5">
              {status?.stats.totalRetrieved ?? 0}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">Received online</div>
          </div>

          <div>
            <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Recorded</div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">
              {status?.stats.totalImported ?? 0}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">Active reports</div>
          </div>

          <div>
            <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold font-mono">Status</div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
              <Sparkles className="w-4 h-4" />
              <span>Live</span>
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">Continuous background sync</div>
          </div>
        </div>

        {/* Live Sync Status Info */}
        <div className="flex flex-wrap items-center justify-between text-xs text-[var(--text-muted)] px-1">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Last Synced: {status?.lastSyncTime ? new Date(status.lastSyncTime).toLocaleTimeString() : 'Just now'}
            </span>
          </div>
          <div>
            Auto-Sync: <strong className="text-emerald-400">Every 1 second</strong>
          </div>
        </div>

        {/* Form Link & Teacher Dispatch Card */}
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5" />
              <span>Houseparent &amp; Teacher Attendance Form Link</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              readOnly
              value={`https://tally.so/r/${formId}`}
              className="flex-1 min-w-[200px] px-3 py-2 text-xs rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-emerald-400 font-mono select-all focus:outline-none"
            />
            <button
              type="button"
              onClick={async () => {
                const ok = await copyToClipboard(`https://tally.so/r/${formId}`);
                if (ok) {
                  setCopiedFormUrl(true);
                  setTimeout(() => setCopiedFormUrl(false), 2500);
                }
              }}
              className="py-2 px-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-xs font-semibold text-[var(--text-page)] flex items-center gap-1.5 shrink-0 cursor-pointer transition-all"
            >
              {copiedFormUrl ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedFormUrl ? 'Copied' : 'Copy Link'}</span>
            </button>

            <a
              href={`https://tally.so/r/${formId}`}
              target="_blank"
              rel="noreferrer"
              className="py-2 px-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 shrink-0 transition-all"
              title="Open Tally form"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={() => {
                const msg = `📋 *OLAG SHS — DAILY HOUSE ATTENDANCE REPORTING*\n\nDear Teachers & Houseparents, please submit your house arrival report using the official form:\n👉 https://tally.so/r/${formId}\n\nThank you!\n— Senior Houseparent (Xtreme)`;
                openWhatsApp(msg, 'app');
              }}
              className="py-2 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-all shadow-xs"
              title="Send to Teachers via WhatsApp"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Share to Staff</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
