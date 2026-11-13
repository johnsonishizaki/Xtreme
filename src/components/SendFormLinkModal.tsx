import React, { useState, useMemo } from 'react';
import {
  X,
  Share2,
  Copy,
  CheckCircle2,
  ExternalLink,
  Send,
  Users,
  Smartphone,
  Radio,
  Sparkles,
  Link2,
  MessageSquare
} from 'lucide-react';
import { HouseConfig, AcademicTerm, AppSettings } from '../types';
import {
  openWhatsApp,
  copyToClipboard,
  generateHouseRequestWhatsAppMessage,
  generateFormBroadcastWhatsAppMessage
} from '../services/messageGenerator';

interface SendFormLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  houses: HouseConfig[];
  activeTerm: AcademicTerm;
  selectedDate: string;
  settings?: AppSettings;
  tallyFormId?: string;
}

export const SendFormLinkModal: React.FC<SendFormLinkModalProps> = ({
  isOpen,
  onClose,
  houses,
  activeTerm,
  selectedDate,
  settings,
  tallyFormId = '2jBVWA'
}) => {
  const [selectedHouseId, setSelectedHouseId] = useState<string>('all');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [customPhone, setCustomPhone] = useState('');

  const selectedHouse = useMemo(() => {
    if (selectedHouseId === 'all') return null;
    return houses.find(h => h.id === selectedHouseId) || null;
  }, [selectedHouseId, houses]);

  // Construct official Tally URL (with optional house prefill)
  const tallyUrl = useMemo(() => {
    const base = `https://tally.so/r/${tallyFormId || '2jBVWA'}`;
    if (selectedHouse) {
      // Tally prefill syntax: ?House=House+Name or ?house=...
      return `${base}?House=${encodeURIComponent(selectedHouse.name)}&Date=${encodeURIComponent(selectedDate)}`;
    }
    return base;
  }, [tallyFormId, selectedHouse, selectedDate]);

  // Prepared broadcast or house-specific WhatsApp message
  const preparedMessage = useMemo(() => {
    if (selectedHouse) {
      return generateHouseRequestWhatsAppMessage(selectedHouse, selectedDate, tallyUrl);
    }
    return generateFormBroadcastWhatsAppMessage(selectedDate, tallyUrl);
  }, [selectedHouse, selectedDate, tallyUrl]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(tallyUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleCopyMessage = async () => {
    const ok = await copyToClipboard(preparedMessage);
    if (ok) {
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2500);
    }
  };

  const handleSendWhatsApp = (phone?: string) => {
    const targetPhone = phone || customPhone || selectedHouse?.houseparentPhone;
    openWhatsApp(preparedMessage, settings?.whatsAppBehavior || 'app', targetPhone);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-left">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-page)]">
                Send Tally Form Link
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Official form for teacher &amp; houseparent daily arrival reporting
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-page)] hover:bg-[var(--card-bg-elevated)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Form Link Card */}
          <div className="p-3.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--text-page)]">
                <Radio className="w-3.5 h-3.5 text-emerald-500" />
                <span>Tally Form: Xtreme | Daily House Report</span>
              </div>
              <span className="font-mono text-[10px] text-[var(--text-muted)] bg-[var(--card-bg)] border border-[var(--card-border)] px-2 py-0.5 rounded-md">
                ID: {tallyFormId}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={tallyUrl}
                className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-emerald-500 font-mono select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="py-2 px-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-xs font-semibold text-[var(--text-page)] flex items-center gap-1.5 shrink-0 cursor-pointer transition-all"
              >
                {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>

              <a
                href={tallyUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2 px-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-page)] flex items-center gap-1.5 shrink-0 transition-all"
                title="Open Tally form in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Target Recipient Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-page)] block">
              Recipient Target
            </label>
            <select
              value={selectedHouseId}
              onChange={e => setSelectedHouseId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-page)] focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">📢 All Teachers &amp; Houseparents (General Broadcast)</option>
              <optgroup label="Boys Houses">
                {houses.filter(h => h.category === 'Boys').map(h => (
                  <option key={h.id} value={h.id}>
                    {h.name} — {h.assignedHouseparent || 'Houseparent'}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Girls Houses">
                {houses.filter(h => h.category === 'Girls').map(h => (
                  <option key={h.id} value={h.id}>
                    {h.name} — {h.assignedHouseparent || 'Houseparent'}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Optional Direct Phone Number */}
          {selectedHouse && (
            <div className="p-3 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border-subtle)] flex items-center justify-between text-xs">
              <div>
                <span className="text-[var(--text-muted)] block">Assigned Houseparent:</span>
                <span className="font-semibold text-[var(--text-page)]">{selectedHouse.assignedHouseparent}</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)] block">Phone:</span>
                <span className="font-mono text-emerald-400 font-medium">
                  {selectedHouse.houseparentPhone || 'Not set in house settings'}
                </span>
              </div>
            </div>
          )}

          {/* Message Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--text-page)]">
                WhatsApp Dispatch Message Preview
              </label>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
              >
                {copiedMessage ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedMessage ? 'Copied to clipboard' : 'Copy message'}</span>
              </button>
            </div>
            <textarea
              readOnly
              rows={7}
              value={preparedMessage}
              className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--card-border-subtle)] bg-[var(--card-bg-elevated)] text-[var(--text-page)] font-mono resize-none focus:outline-none"
            />
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--card-border)] bg-[var(--card-bg-elevated)] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 rounded-xl border border-[var(--card-border)] text-xs font-semibold text-[var(--text-page)] hover:bg-[var(--card-bg)] transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => handleSendWhatsApp()}
            className="py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send via WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  );
};
