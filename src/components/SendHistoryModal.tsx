import React from 'react';
import { History, CheckCircle2, Copy, Trash2, Calendar, Clock } from 'lucide-react';
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
    <div className="max-w-md mx-auto px-4 py-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Activity Log
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">
            Send History
          </h1>
        </div>
        <div className="text-xs text-slate-400 font-semibold px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800">
          {history.length} Announcements
        </div>
      </div>

      {history.length === 0 ? (
        <div className="p-8 rounded-3xl bg-slate-900/50 border border-slate-800 text-center space-y-3 my-6">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">No Send History Yet</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Whenever you tap "Copy Message" or "Mark as Sent" on your weekly announcement, a record is kept here.
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
                className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-white">
                      {item.weekLabel}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                        item.status === 'sent_confirmed'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-teal-500/20 text-teal-300'
                      }`}
                    >
                      {item.status === 'sent_confirmed' ? 'Sent' : 'Copied'}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{dateDisplay}</span>
                  </span>
                </div>

                <div className="text-[11px] text-slate-400">
                  Duty Period: <strong className="text-slate-300">{item.dutyPeriod}</strong>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 font-mono whitespace-pre-line max-h-28 overflow-y-auto leading-relaxed">
                  {item.message}
                </div>

                <div className="flex items-center justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleReCopy(item)}
                    className="text-xs font-semibold py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all flex items-center space-x-1.5"
                  >
                    {copiedId === item.id ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
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
