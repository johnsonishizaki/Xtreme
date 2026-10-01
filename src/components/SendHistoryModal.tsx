import React from 'react';
import { History, CheckCircle2, Copy, Clock } from 'lucide-react';
import { SendHistory } from '../types';
import { copyToClipboard } from '../services/messageGenerator';

interface SendHistoryModalProps {
  history: SendHistory[];
  onClearHistory?: () => void;
}

export const SendHistoryModal: React.FC<SendHistoryModalProps> = ({
  history
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleReCopy = async (item: SendHistory) => {
    const success = await copyToClipboard(item.message);
    if (success) {
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-5 pb-28 text-left">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-500">
            Activity Log
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Send History
          </h1>
        </div>
        <div className="text-xs font-mono font-semibold px-3 py-1.5 rounded-xl border bg-slate-900 border-slate-800 text-slate-400">
          {history.length} Announcements
        </div>
      </div>

      {history.length === 0 ? (
        <div className="p-8 rounded-3xl border text-center space-y-3 my-6 bg-slate-900/50 border-slate-800 text-white">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto border bg-slate-800 border-slate-700 text-slate-400">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">No Send History Yet</h3>
            <p className="text-xs mt-1 max-w-xs mx-auto leading-relaxed text-slate-400">
              Whenever you tap &ldquo;One-Tap Send&rdquo; or &ldquo;Copy Message&rdquo; on your weekly announcement, a record is kept here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map(item => {
            const dateObj = new Date(item.timestamp);
            const dateDisplay = isNaN(dateObj.getTime())
              ? item.timestamp
              : dateObj.toLocaleDateString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                });

            return (
              <div
                key={item.id}
                className="p-4 rounded-2xl border space-y-2.5 transition-colors bg-slate-900 border-slate-800 text-white shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-white">
                      {item.weekLabel}
                    </span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-emerald-500/20 text-emerald-400"
                    >
                      {item.status === 'sent_confirmed' ? 'Sent' : 'Copied'}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono flex items-center space-x-1 text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{dateDisplay}</span>
                  </span>
                </div>

                <div className="text-xs p-3 rounded-xl border font-mono whitespace-pre-line leading-relaxed bg-slate-950 border-slate-800/80 text-slate-300">
                  {item.message}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-mono text-slate-400">
                    {item.dutyPeriod}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleReCopy(item)}
                    className={`py-1.5 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer border ${
                      copiedId === item.id
                        ? 'bg-emerald-500 text-black border-emerald-500'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                    }`}
                  >
                    {copiedId === item.id ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Again</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
