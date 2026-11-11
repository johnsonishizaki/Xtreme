import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Send,
  Copy,
  CheckCircle2,
  Calendar,
  Users,
  Smartphone,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Link2,
  ChevronDown
} from 'lucide-react';
import { HouseConfig, HouseDailyReport, AcademicTerm, DailyCollation, AppSettings } from '../types';
import {
  openWhatsApp,
  copyToClipboard,
  generateHouseRequestWhatsAppMessage,
  generateHouseStatusWhatsAppMessage,
  generateFullCollationWhatsAppMessage,
  formatDutyDate
} from '../services/messageGenerator';
import { collateDailyReports } from '../services/firebase';

interface WhatsAppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  houses: HouseConfig[];
  reports: HouseDailyReport[];
  activeTerm: AcademicTerm;
  settings: AppSettings;
  initialHouseId?: string; // specific house or 'all'
  initialDate?: string;
}

export const WhatsAppShareModal: React.FC<WhatsAppShareModalProps> = ({
  isOpen,
  onClose,
  houses,
  reports,
  activeTerm,
  settings,
  initialHouseId = 'all',
  initialDate
}) => {
  const [selectedHouseId, setSelectedHouseId] = useState<string>(initialHouseId);
  const [selectedDate, setSelectedDate] = useState<string>(
    initialDate || new Date().toISOString().split('T')[0]
  );
  const [messageType, setMessageType] = useState<'request' | 'status'>('request');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Sync props when opening
  useEffect(() => {
    if (initialHouseId) {
      setSelectedHouseId(initialHouseId);
    }
  }, [initialHouseId]);

  useEffect(() => {
    if (initialDate) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  // Collate for selected date and term
  const collation: DailyCollation = useMemo(() => {
    return collateDailyReports(reports, houses, selectedDate, activeTerm.id);
  }, [reports, houses, selectedDate, activeTerm.id]);

  // Map of reports for selected date
  const dateReportsMap = useMemo(() => {
    const map = new Map<string, HouseDailyReport>();
    for (const r of reports) {
      if (r.reportingDate === selectedDate && r.termId === activeTerm.id) {
        map.set(r.houseId, r);
      }
    }
    return map;
  }, [reports, selectedDate, activeTerm.id]);

  const selectedHouse = useMemo(() => {
    if (selectedHouseId === 'all') return null;
    return houses.find(h => h.id === selectedHouseId) || null;
  }, [selectedHouseId, houses]);

  const selectedReport = useMemo(() => {
    if (!selectedHouse) return undefined;
    return dateReportsMap.get(selectedHouse.id);
  }, [selectedHouse, dateReportsMap]);

  // Generate official Tally form URL
  const formUrl = useMemo(() => {
    const base = 'https://tally.so/r/2jBVWA';
    if (selectedHouse) {
      return `${base}?House=${encodeURIComponent(selectedHouse.name)}&Date=${selectedDate}`;
    }
    return base;
  }, [selectedHouse, selectedDate]);

  // Generate WhatsApp Message text
  const generatedMessage = useMemo(() => {
    if (selectedHouseId === 'all' || !selectedHouse) {
      return generateFullCollationWhatsAppMessage(
        collation,
        houses,
        dateReportsMap,
        selectedDate
      );
    }

    if (messageType === 'request') {
      return generateHouseRequestWhatsAppMessage(selectedHouse, selectedDate, formUrl);
    } else {
      return generateHouseStatusWhatsAppMessage(selectedHouse, selectedReport, selectedDate);
    }
  }, [selectedHouseId, selectedHouse, messageType, formUrl, selectedReport, selectedDate, collation, houses, dateReportsMap]);

  if (!isOpen) return null;

  const handleSendWhatsApp = () => {
    openWhatsApp(generatedMessage, settings.whatsAppBehavior || 'app', phoneNumber);
  };

  const handleCopyMessage = async () => {
    await copyToClipboard(generatedMessage);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2500);
  };

  const handleCopyLink = async () => {
    await copyToClipboard(formUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="border border-[var(--card-border)] rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl bg-[var(--modal-bg)] text-[var(--text-page)] space-y-4 my-6 text-left">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--card-border-subtle)] pb-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-page)]">
              Send via WhatsApp
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {formatDutyDate(selectedDate)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-page)] hover:bg-[var(--card-bg-elevated)] cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. SELECTION CONTROLS (HOUSE + DATE) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* House Selector */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--text-page)] flex items-center gap-1">
              <span>Target</span>
            </label>
            <div className="relative">
              <select
                value={selectedHouseId}
                onChange={e => setSelectedHouseId(e.target.value)}
                className="w-full pl-3 pr-8 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-xs text-[var(--text-page)] focus:border-emerald-500 outline-none appearance-none cursor-pointer font-medium"
              >
                <option value="all">All 8 Houses (Full Summary)</option>
                <optgroup label="Boys Houses">
                  {houses.filter(h => h.category === 'Boys').map(h => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.assignedHouseparent})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Girls Houses">
                  {houses.filter(h => h.category === 'Girls').map(h => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.assignedHouseparent})
                    </option>
                  ))}
                </optgroup>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Date Selector */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-[var(--text-page)]">Date</label>
              <button
                type="button"
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className="text-[11px] text-emerald-500 hover:underline cursor-pointer"
              >
                Today
              </button>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-xs text-[var(--text-page)] focus:border-emerald-500 outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* 2. IF SINGLE HOUSE: MESSAGE TYPE */}
        {selectedHouse && (
          <div className="space-y-1">
            <label className="text-xs text-[var(--text-muted)]">
              Message Type:
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMessageType('request')}
                className={`py-2 px-3 rounded-xl border font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  messageType === 'request'
                    ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500'
                    : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-page)]'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Form Link Request</span>
              </button>

              <button
                type="button"
                onClick={() => setMessageType('status')}
                className={`py-2 px-3 rounded-xl border font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  messageType === 'status'
                    ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500'
                    : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-page)]'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>House Status Report</span>
              </button>
            </div>
          </div>
        )}

        {/* 3. OPTIONAL PHONE NUMBER */}
        <div className="space-y-1">
          <label className="text-xs text-[var(--text-muted)] flex items-center justify-between">
            <span>Direct WhatsApp Phone (Optional)</span>
            <span className="text-[10px] text-[var(--text-subtle)]">
              Leave blank to choose contact/group
            </span>
          </label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={e => setPhoneNumber(e.target.value)}
            placeholder="e.g. +233... or 024..."
            className="w-full px-3 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-xs text-[var(--text-page)] focus:border-emerald-500 outline-none"
          />
        </div>

        {/* 4. LIVE WHATSAPP MESSAGE PREVIEW */}
        <div className="space-y-1">
          <div className="text-xs text-[var(--text-muted)]">
            Message Preview
          </div>
          <div className="p-3.5 rounded-xl bg-black/20 border border-[var(--card-border-subtle)] text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed text-[var(--text-page)] scrollbar-thin">
            {generatedMessage}
          </div>
        </div>

        {/* 5. ACTION BUTTONS */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleSendWhatsApp}
            className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98 transition-all"
          >
            <Send className="w-4 h-4" />
            <span>Open in WhatsApp</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopyMessage}
              className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                copiedMessage
                  ? 'bg-emerald-500 text-black border-emerald-500'
                  : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500 text-[var(--text-page)]'
              }`}
            >
              {copiedMessage ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-emerald-500" />}
              <span>{copiedMessage ? 'Copied!' : 'Copy Text'}</span>
            </button>

            {selectedHouse ? (
              <button
                type="button"
                onClick={handleCopyLink}
                className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  copiedLink
                    ? 'bg-emerald-500 text-black border-emerald-500'
                    : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500 text-[var(--text-page)]'
                }`}
              >
                {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5 text-emerald-500" />}
                <span>{copiedLink ? 'Link Copied!' : 'Copy Form Link'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-elevated)] text-xs font-medium text-[var(--text-page)] cursor-pointer"
              >
                Close
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
