import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  FileText,
  FileSpreadsheet,
  FileType2,
  ChevronDown,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import type { ExportFormat } from '../services/exportService';

interface ExportMenuButtonProps {
  label?: string;
  onExport: (format: ExportFormat) => Promise<string | void>;
  size?: 'sm' | 'md';
}

export const ExportMenuButton: React.FC<ExportMenuButtonProps> = ({
  label = 'Export',
  onExport,
  size = 'sm'
}) => {
  const [open, setOpen] = useState(false);
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);
  const [doneText, setDoneText] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleSelect = async (format: ExportFormat) => {
    try {
      setBusyFormat(format);
      await onExport(format);
      setOpen(false);
      setDoneText(format === 'excel' ? 'Excel saved' : format === 'word' ? 'Word saved' : 'PDF saved');
      setTimeout(() => setDoneText(null), 2600);
    } finally {
      setBusyFormat(null);
    }
  };

  const heightCls = size === 'md' ? 'min-h-[38px] px-3.5 py-1.5 rounded-xl' : 'min-h-[32px] px-2.5 py-1 rounded-lg';

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={busyFormat !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${heightCls} border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:border-emerald-500/50 text-xs font-semibold text-[var(--text-page)] flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0`}
      >
        {busyFormat ? (
          <Loader2 className="w-3.5 h-3.5 text-emerald-500 animate-spin shrink-0" />
        ) : doneText ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        ) : (
          <Download className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        )}
        <span>{doneText || label}</span>
        <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 w-52 rounded-xl border border-[var(--card-border)] bg-[var(--modal-bg)] shadow-2xl p-1.5 z-40 text-left space-y-0.5"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => handleSelect('pdf')}
            className="w-full min-h-[38px] px-2.5 py-2 rounded-lg hover:bg-emerald-500/10 text-xs font-semibold text-[var(--text-page)] flex items-center gap-2.5 cursor-pointer transition-colors"
          >
            <FileText className="w-4 h-4 text-rose-500 shrink-0" />
            <div className="min-w-0">
              <div className="leading-tight">PDF (.pdf)</div>
              <div className="text-[10px] font-normal text-[var(--text-muted)]">Graphs + full tables</div>
            </div>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleSelect('excel')}
            className="w-full min-h-[38px] px-2.5 py-2 rounded-lg hover:bg-emerald-500/10 text-xs font-semibold text-[var(--text-page)] flex items-center gap-2.5 cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <div className="leading-tight">Excel (.xlsx)</div>
              <div className="text-[10px] font-normal text-[var(--text-muted)]">Multi-sheet workbook</div>
            </div>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleSelect('word')}
            className="w-full min-h-[38px] px-2.5 py-2 rounded-lg hover:bg-emerald-500/10 text-xs font-semibold text-[var(--text-page)] flex items-center gap-2.5 cursor-pointer transition-colors"
          >
            <FileType2 className="w-4 h-4 text-blue-500 shrink-0" />
            <div className="min-w-0">
              <div className="leading-tight">Word (.docx)</div>
              <div className="text-[10px] font-normal text-[var(--text-muted)]">Graphs + formatted doc</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
