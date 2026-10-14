import React, { useState, useMemo } from 'react';
import { History, CheckCircle2, Copy, Clock, Search, X, Filter } from 'lucide-react';
import { SendHistory } from '../types';
import { copyToClipboard } from '../services/messageGenerator';

interface SendHistoryModalProps {
  history: SendHistory[];
  onClearHistory?: () => void;
}

// Helper to highlight matching text in search results
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-emerald-500 text-black font-extrabold px-1 py-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
}

export const SendHistoryModal: React.FC<SendHistoryModalProps> = ({
  history
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handleReCopy = async (item: SendHistory) => {
    const success = await copyToClipboard(item.message);
    if (success) {
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter(item => 
      item.weekLabel.toLowerCase().includes(q) ||
      item.dutyPeriod.toLowerCase().includes(q) ||
      item.message.toLowerCase().includes(q) ||
      item.status.toLowerCase().includes(q)
    );
  }, [history, searchQuery]);

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-5 pb-28 text-left">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-500">
            Activity Log
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--text-page)]">
            Send History
          </h1>
        </div>
        <div className="text-xs font-mono font-semibold px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)]">
          {history.length} Announcements
        </div>
      </div>

      {history.length > 0 && (
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3.5 pointer-events-none text-[var(--text-subtle)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search history, teachers, or weeks..."
              className="w-full pl-10 pr-9 py-3 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] placeholder-[var(--text-subtle)] shadow-inner backdrop-blur-md"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 p-1 rounded-full transition-colors text-[var(--text-subtle)] hover:text-[var(--text-page)] cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {searchQuery.trim() && (
            <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono px-1 text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5">
                <Filter className="w-3 h-3 text-emerald-500" />
                <span>
                  Found <strong className="text-[var(--text-page)]">{filteredHistory.length}</strong> of {history.length} entries
                </span>
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-emerald-500 hover:underline font-semibold cursor-pointer"
              >
                Reset search
              </button>
            </div>
          )}
        </div>
      )}

      {history.length === 0 ? (
        <div className="p-8 rounded-3xl border border-[var(--card-border)] text-center space-y-3 my-6 bg-[var(--card-bg)] text-[var(--text-page)]">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto border border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-[var(--text-muted)]">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-page)]">No Send History Yet</h3>
            <p className="text-xs mt-1 max-w-xs mx-auto leading-relaxed text-[var(--text-muted)]">
              Whenever you tap &ldquo;One-Tap Send&rdquo; or &ldquo;Copy Message&rdquo; on your weekly announcement, a record is kept here.
            </p>
          </div>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="p-8 rounded-3xl border border-[var(--card-border)] text-center space-y-3 my-6 bg-[var(--card-bg)] text-[var(--text-page)]">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto border border-[var(--card-border)] bg-[var(--card-bg-elevated)] text-[var(--text-subtle)]">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--text-page)]">No matching results</h3>
            <p className="text-xs mt-1 max-w-xs mx-auto leading-relaxed text-[var(--text-muted)]">
              No history entries matched your search query &ldquo;{searchQuery}&rdquo;. Try another term.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHistory.map(item => {
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
                className="p-4 rounded-2xl border border-[var(--card-border)] space-y-2.5 transition-colors bg-[var(--card-bg)] text-[var(--text-page)] shadow-[var(--shadow-card)] animate-in fade-in-50 duration-150"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-[var(--text-page)]">
                      <HighlightText text={item.weekLabel} query={searchQuery} />
                    </span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-emerald-500/20 text-emerald-500"
                    >
                      {item.status === 'sent_confirmed' ? 'Sent' : 'Copied'}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono flex items-center space-x-1 text-[var(--text-subtle)]">
                    <Clock className="w-3 h-3" />
                    <span>{dateDisplay}</span>
                  </span>
                </div>

                <div className="text-xs p-3 rounded-xl border border-[var(--card-border-subtle)] font-mono whitespace-pre-line leading-relaxed bg-[var(--code-bg)] text-[var(--text-page)]">
                  <HighlightText text={item.message} query={searchQuery} />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">
                    <HighlightText text={item.dutyPeriod} query={searchQuery} />
                  </span>

                  <button
                    type="button"
                    onClick={() => handleReCopy(item)}
                    className={`py-1.5 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer border ${
                      copiedId === item.id
                        ? 'bg-emerald-500 text-black border-emerald-500'
                        : 'border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:border-[var(--card-border-hover)] text-[var(--text-page)]'
                    }`}
                  >
                    {copiedId === item.id ? (
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
            );
          })}
        </div>
      )}
    </div>
  );
};
