import React from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Zap,
  Clock,
  ShieldCheck,
  X
} from 'lucide-react';

export interface ProgressStage {
  label: string;
  detail?: string;
}

export interface OperationProgressModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  stages: ProgressStage[];
  currentStageIndex: number;
  progressPercent: number; // 0 to 100
  elapsedMs?: number;
  isCompleted?: boolean;
  errorMessage?: string | null;
  onClose?: () => void;
  accentColor?: 'emerald' | 'amber' | 'blue';
}

export const OperationProgressModal: React.FC<OperationProgressModalProps> = ({
  isOpen,
  title,
  description,
  stages,
  currentStageIndex,
  progressPercent,
  elapsedMs = 0,
  isCompleted = false,
  errorMessage = null,
  onClose,
  accentColor = 'emerald'
}) => {
  if (!isOpen) return null;

  // Format elapsed time (e.g. 00:04.2)
  const seconds = (elapsedMs / 1000).toFixed(1);

  const accentBorder = {
    emerald: 'border-emerald-500/40',
    amber: 'border-amber-500/40',
    blue: 'border-blue-500/40'
  }[accentColor];

  const accentBg = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    blue: 'bg-blue-500'
  }[accentColor];

  const accentText = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    blue: 'text-blue-400'
  }[accentColor];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-modal-title"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
    >
      <div
        className={`relative w-full max-w-md rounded-3xl border ${accentBorder} bg-[var(--modal-bg,#121820)] text-[var(--text-page,#f1f5f9)] shadow-2xl p-6 sm:p-7 space-y-5 my-6 animate-in zoom-in-95 duration-150 text-left`}
      >
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${accentText} bg-white/5 border border-white/10`}>
                <Zap className="w-3 h-3 animate-pulse" />
                <span>Active Operation</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono text-[var(--text-muted,#94a3b8)] bg-white/5 border border-white/5">
                <Clock className="w-3 h-3 text-emerald-400" />
                <span>{seconds}s elapsed</span>
              </span>
            </div>
            <h2 id="progress-modal-title" className="text-xl font-black tracking-tight text-[var(--text-page,#f1f5f9)]">
              {title}
            </h2>
            {description && (
              <p className="text-xs text-[var(--text-muted,#94a3b8)] leading-relaxed">
                {description}
              </p>
            )}
          </div>

          {(errorMessage || isCompleted) && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Progress Bar & Numeric readout */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="font-bold text-[var(--text-subtle,#64748b)]">
              {isCompleted ? 'COMPLETED' : errorMessage ? 'FAILED' : 'PROGRESS'}
            </span>
            <span className={`font-black text-sm ${accentText}`}>
              {Math.min(100, Math.max(0, Math.round(progressPercent)))}%
            </span>
          </div>

          <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden p-0.5 border border-white/5 shadow-inner">
            <div
              className={`h-full rounded-full ${accentBg} transition-all duration-300 ease-out relative`}
              style={{ width: `${Math.min(100, Math.max(2, progressPercent))}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
            </div>
          </div>
        </div>

        {/* Error message view */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="space-y-1">
              <div className="font-bold">Operation Encountered an Issue</div>
              <div className="text-[11px] leading-relaxed text-rose-200/90">{errorMessage}</div>
            </div>
          </div>
        )}

        {/* Multi-Stage Step Tracker */}
        <div className="space-y-2 pt-1 border-t border-white/5">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-muted,#94a3b8)]">
            Execution Stages
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {stages.map((stage, idx) => {
              const isPast = idx < currentStageIndex || isCompleted;
              const isCurrent = idx === currentStageIndex && !isCompleted && !errorMessage;
              const isFuture = idx > currentStageIndex && !isCompleted;

              return (
                <div
                  key={idx}
                  className={`p-2.5 rounded-2xl border transition-all text-xs flex items-start gap-3 ${
                    isCurrent
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-white shadow-sm'
                      : isPast
                      ? 'border-emerald-500/20 bg-white/[0.02] text-[var(--text-muted,#94a3b8)]'
                      : 'border-white/5 bg-transparent text-[var(--text-subtle,#64748b)] opacity-60'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isPast ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[9px] font-mono font-bold text-[var(--text-muted)]">
                        {idx + 1}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-0.5 min-w-0">
                    <div className={`font-semibold text-xs leading-snug ${isCurrent ? 'text-white' : ''}`}>
                      {stage.label}
                    </div>
                    {isCurrent && stage.detail && (
                      <div className="text-[11px] text-emerald-300 font-mono animate-pulse">
                        &rarr; {stage.detail}
                      </div>
                    )}
                    {isPast && stage.detail && (
                      <div className="text-[10px] text-[var(--text-subtle)] font-mono">
                        {stage.detail}
                      </div>
                    )}
                  </div>

                  {isPast && (
                    <span className="text-[10px] font-mono font-bold text-emerald-400 shrink-0">
                      Done
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-[10px] font-mono font-bold text-emerald-300 shrink-0 animate-pulse">
                      Active
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Live reassurance footer */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-[var(--text-muted,#94a3b8)]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            <span>Xtreme engine active</span>
          </div>
          <span className="text-[10px] text-[var(--text-subtle,#64748b)]">
            {isCompleted ? 'Finished' : 'Do not close'}
          </span>
        </div>

        {/* Close button if failed or finished */}
        {(errorMessage || isCompleted) && onClose && (
          <button
            type="button"
            onClick={onClose}
            className={`w-full py-2.5 rounded-xl font-bold text-xs font-mono uppercase tracking-wider cursor-pointer transition-all ${
              isCompleted
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
                : 'bg-rose-500 hover:bg-rose-400 text-white'
            }`}
          >
            {isCompleted ? 'Continue' : 'Dismiss'}
          </button>
        )}
      </div>
    </div>
  );
};
