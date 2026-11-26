import React, { useRef } from 'react';
import { Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocalTodayIso } from '../services/messageGenerator';

interface DateFieldProps {
  value: string;
  onChange: (nextDate: string) => void;
  ariaLabel?: string;
  className?: string;
  showSteppers?: boolean;
  onStepDay?: (deltaDays: number) => void;
  compact?: boolean;
}

export function shiftIsoDate(dateStr: string, deltaDays: number): string {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : getLocalTodayIso();
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalTodayIso(dt);
}

export const DateField: React.FC<DateFieldProps> = ({
  value,
  onChange,
  ariaLabel = 'Select date',
  className = '',
  showSteppers = false,
  onStepDay,
  compact = false
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const safeValue = /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : getLocalTodayIso();

  const handleOpenPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (typeof (el as any).showPicker === 'function') {
      try {
        (el as any).showPicker();
      } catch {
        // iOS Safari opens native drum on focus/click automatically
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (next && /^\d{4}-\d{2}-\d{2}$/.test(next)) {
      onChange(next);
    } else {
      // Prevent clearing out date completely when browser "Clear" button is clicked
      onChange(safeValue);
    }
  };

  const handleStep = (delta: number) => {
    if (onStepDay) {
      onStepDay(delta);
    } else {
      onChange(shiftIsoDate(safeValue, delta));
    }
  };

  return (
    <div
      className={`inline-flex items-center rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] overflow-hidden transition-colors focus-within:border-emerald-500 ${
        compact ? 'min-h-[36px]' : 'min-h-[40px]'
      } ${className}`}
    >
      {showSteppers && (
        <button
          type="button"
          onClick={() => handleStep(-1)}
          aria-label="Previous day"
          title="Previous day"
          className="min-w-[34px] h-full flex items-center justify-center text-[var(--text-muted)] hover:text-emerald-500 hover:bg-[var(--card-bg-elevated)] border-r border-[var(--card-border-subtle)] cursor-pointer transition-colors shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      <div
        onClick={handleOpenPicker}
        className="relative flex-1 flex items-center justify-between gap-2 px-3 py-1.5 cursor-pointer min-w-0"
      >
        <input
          ref={inputRef}
          type="date"
          aria-label={ariaLabel}
          value={safeValue}
          onChange={handleChange}
          className="date-input-clean w-full bg-transparent text-xs font-mono tabular-nums text-[var(--text-page)] outline-none cursor-pointer pr-6"
        />
        <Calendar
          aria-hidden="true"
          className="w-4 h-4 text-emerald-500 pointer-events-none shrink-0"
        />
      </div>

      {showSteppers && (
        <button
          type="button"
          onClick={() => handleStep(1)}
          aria-label="Next day"
          title="Next day"
          className="min-w-[34px] h-full flex items-center justify-center text-[var(--text-muted)] hover:text-emerald-500 hover:bg-[var(--card-bg-elevated)] border-l border-[var(--card-border-subtle)] cursor-pointer transition-colors shrink-0"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

interface TimeFieldProps {
  value: string;
  onChange: (nextTime: string) => void;
  ariaLabel?: string;
  className?: string;
}

export const TimeField: React.FC<TimeFieldProps> = ({
  value,
  onChange,
  ariaLabel = 'Select time',
  className = ''
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const safeValue = /^\d{2}:\d{2}$/.test(value || '') ? value : '08:00';

  const handleOpenPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (typeof (el as any).showPicker === 'function') {
      try {
        (el as any).showPicker();
      } catch {}
    }
  };

  return (
    <div
      onClick={handleOpenPicker}
      className={`relative min-h-[40px] inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] focus-within:border-emerald-500 cursor-pointer transition-colors ${className}`}
    >
      <input
        ref={inputRef}
        type="time"
        aria-label={ariaLabel}
        value={safeValue}
        onChange={e => onChange(e.target.value || safeValue)}
        className="time-input-clean w-full bg-transparent text-xs font-mono tabular-nums text-[var(--text-page)] outline-none cursor-pointer pr-6"
      />
      <Clock
        aria-hidden="true"
        className="w-4 h-4 text-emerald-500 pointer-events-none shrink-0"
      />
    </div>
  );
};
