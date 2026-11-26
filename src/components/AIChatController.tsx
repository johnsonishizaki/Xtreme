import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sparkles,
  X,
  Send,
  Mic,
  MicOff,
  Bot,
  User,
  CheckCircle2,
  RefreshCw,
  Copy,
  Trash2,
  ArrowRight,
  AlertTriangle,
  History,
  Plus,
  MessageSquare
} from 'lucide-react';
import {
  HouseConfig,
  HouseDailyReport,
  AcademicTerm,
  AppSettings,
  DutyAssignment,
  Roster,
  AiPersonaPreset,
  AiActionItem,
  AiChatMessage,
  AiChatSession
} from '../types';
import type { ActiveNavTab } from './Header';
import {
  openWhatsApp,
  copyToClipboard,
  generateAnnouncementMessage,
  getLocalTodayIso
} from '../services/messageGenerator';
import { formatAiResponse } from '../services/aiFormatter';
import { MiniMetricChart } from './AttendanceCharts';
import {
  saveHouses,
  saveHouseReport,
  deleteHouseReport,
  saveTerm,
  deleteTerm,
  updateDutyAssignment,
  setActiveRoster,
  getCachedHouses,
  getCachedTerms,
  getCachedAiChats,
  getAiChats,
  saveAiChat,
  deleteAiChat,
  collateDailyReports
} from '../services/firebase';
import { DEFAULT_TERM } from '../services/sampleData';
import {
  exportAttendanceReport,
  exportDutySchedule,
  type ExportFormat
} from '../services/exportService';
import { syncTallyNow } from '../services/tallyClient';
import {
  downloadDutyCalendarAlarm,
  testUrgentNotification
} from '../services/notificationService';

interface AIChatControllerProps {
  houses: HouseConfig[];
  reports: HouseDailyReport[];
  terms: AcademicTerm[];
  rosters: Roster[];
  assignments: DutyAssignment[];
  settings: AppSettings;
  activeTab: ActiveNavTab;
  selectedDate: string;
  featuredAssignment: DutyAssignment | null;
  isDutyPending: boolean;
  onRefreshData: () => Promise<void>;
  onNavigateTab: (tab: 'houseReports' | 'duty' | 'settings') => void;
  onOpenSettingsSection?: (section: string) => void;
  onSelectDate: (date: string) => void;
  onOpenHouseModal: (houseId: string) => void;
  onOpenFormLinkModal: () => void;
  onOpenWhatsAppModal: (houseId?: string, date?: string) => void;
  onMarkDutyDone: () => Promise<void>;
  onUnmarkDutyDone: () => Promise<void>;
  onTriggerAlarmTest?: () => void;
  onUpdateSettings: (next: AppSettings) => Promise<void>;
  onToggleTheme?: (theme?: 'dark' | 'light') => void;
}

const ACTIVE_CHAT_STORAGE_KEY = 'xtreme_active_ai_chat_id';
const AUTO_CLOSE_STORAGE_KEY = 'xtreme_ai_autoclose';

const AUTO_CLOSE_ACTIONS = new Set([
  'navigate_tab',
  'select_date',
  'open_house_modal',
  'open_form_link_modal',
  'open_whatsapp_modal',
  'draft_whatsapp',
  'test_duty_alarm'
]);

const INSTANT_ZERO_RISK_ACTIONS = new Set([
  'navigate_tab',
  'select_date',
  'open_house_modal',
  'open_form_link_modal',
  'open_whatsapp_modal',
  'set_persona',
  'toggle_theme',
  'export_report'
]);

const WELCOME_MESSAGE: AiChatMessage = {
  id: 'welcome',
  sender: 'ai',
  text:
    'Hello! I am **Xtreme AI**, your full-control OLAG SHS assistant.\n' +
    '- Summarize daily attendance & multi-day trends with charts\n' +
    '- Edit quotas, log counts, manage terms, or edit duty weeks\n' +
    '- Send 1-tap WhatsApp messages, open modals, or run multi-step commands'
};

function createEmptySession(): AiChatSession {
  const now = new Date().toISOString();
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: 'New Conversation',
    messages: [WELCOME_MESSAGE],
    createdAt: now,
    updatedAt: now
  };
}

function deriveChatTitle(messages: AiChatMessage[]): string {
  const firstUser = messages.find(m => m.sender === 'user' && m.text.trim());
  if (!firstUser) return 'New Conversation';
  const cleaned = firstUser.text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 40 ? `${cleaned.slice(0, 39)}...` : cleaned;
}

function findMatchingHouse(houses: HouseConfig[], houseId?: string, houseName?: string): HouseConfig | undefined {
  if (houseId) {
    const byId = houses.find(h => h.id === houseId);
    if (byId) return byId;
  }
  if (houseName) {
    const target = houseName.trim().toLowerCase();
    return (
      houses.find(h => h.name.toLowerCase() === target) ||
      houses.find(h => h.name.toLowerCase().includes(target) || target.includes(h.name.toLowerCase()))
    );
  }
  return undefined;
}

function formatModelLabel(modelUsed?: string): string {
  if (!modelUsed) return 'Gemini 3.1 Flash Lite';
  if (modelUsed.includes('flash-lite')) return 'Gemini 3.1 Flash Lite';
  if (modelUsed.includes('hydrogen')) return 'Gemini 4 Flash';
  if (modelUsed.includes('deepseek')) return 'DeepSeek Chat';
  if (modelUsed.includes('gemini')) return 'Gemini Flash';
  return 'Local Snapshot';
}

function formatRelativeDate(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export const AIChatController: React.FC<AIChatControllerProps> = ({
  houses,
  reports,
  terms,
  rosters,
  assignments,
  settings,
  activeTab,
  selectedDate,
  featuredAssignment,
  isDutyPending,
  onRefreshData,
  onNavigateTab,
  onOpenSettingsSection,
  onSelectDate,
  onOpenHouseModal,
  onOpenFormLinkModal,
  onOpenWhatsAppModal,
  onMarkDutyDone,
  onUnmarkDutyDone,
  onTriggerAlarmTest,
  onUpdateSettings,
  onToggleTheme
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const [lastModelUsed, setLastModelUsed] = useState<string | undefined>(undefined);

  const [autoCloseEnabled, setAutoCloseEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(AUTO_CLOSE_STORAGE_KEY);
    return saved === null ? true : saved === 'true';
  });

  const [initialChatState] = useState<{ sessions: AiChatSession[]; activeId: string }>(() => {
    const cached = getCachedAiChats();
    if (cached.length > 0) {
      const storedActiveId = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY) : null;
      const activeId = storedActiveId && cached.some(c => c.id === storedActiveId) ? storedActiveId : cached[0].id;
      return { sessions: cached, activeId };
    }
    const fresh = createEmptySession();
    return { sessions: [fresh], activeId: fresh.id };
  });

  const [sessions, setSessions] = useState<AiChatSession[]>(initialChatState.sessions);
  const [activeSessionId, setActiveSessionId] = useState<string>(initialChatState.activeId);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const activeSession = useMemo(() => {
    return sessions.find(s => s.id === activeSessionId) || sessions[0] || createEmptySession();
  }, [sessions, activeSessionId]);

  const messages = activeSession.messages;
  const activePersona: AiPersonaPreset = (settings.aiPersona as AiPersonaPreset) || 'concise';
  const activeTerm = terms.find(t => t.id === settings.activeTermId) || terms.find(t => t.status === 'open') || terms[0];

  // Hydrate persistent chats from server/Firestore on mount
  useEffect(() => {
    let mounted = true;
    getAiChats().then(remote => {
      if (!mounted || remote.length === 0) return;
      setSessions(prev => {
        const mergedMap = new Map<string, AiChatSession>();
        for (const s of remote) mergedMap.set(s.id, s);
        for (const local of prev) {
          const existing = mergedMap.get(local.id);
          const hasUserMsg = local.messages.some(m => m.sender === 'user');
          if (!existing && hasUserMsg) {
            mergedMap.set(local.id, local);
          } else if (existing && local.messages.length > existing.messages.length) {
            mergedMap.set(local.id, local);
          }
        }
        const merged = Array.from(mergedMap.values()).sort((a, b) =>
          (b.updatedAt || '').localeCompare(a.updatedAt || '')
        );
        return merged.length > 0 ? merged : prev;
      });

      setActiveSessionId(curId => {
        const current = sessionsRef.current.find(s => s.id === curId);
        if (current && current.messages.some(m => m.sender === 'user')) {
          return curId;
        }
        const storedId = localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY);
        if (storedId && remote.some(r => r.id === storedId)) return storedId;
        return remote[0].id;
      });
    });

    return () => {
      mounted = false;
    };
  }, []);

  // Persist active chat ID
  useEffect(() => {
    if (activeSession?.id) {
      try {
        localStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, activeSession.id);
      } catch {}
    }
  }, [activeSession?.id]);

  // Escape key closes drawer cleanly
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setShowHistoryDrawer(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  // Auto-scroll
  useEffect(() => {
    if (isOpen && !showHistoryDrawer) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, loading, showHistoryDrawer]);

  const showInlineNotice = (msg: string) => {
    setInlineNotice(msg);
    setTimeout(() => setInlineNotice(null), 4500);
  };

  const toggleAutoClose = () => {
    const next = !autoCloseEnabled;
    setAutoCloseEnabled(next);
    try {
      localStorage.setItem(AUTO_CLOSE_STORAGE_KEY, String(next));
    } catch {}
  };

  const scheduleAutoClose = (reasonText?: string) => {
    if (!autoCloseEnabled) return;
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    if (reasonText) showInlineNotice(`${reasonText} · Closing drawer...`);
    autoCloseTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      setShowHistoryDrawer(false);
    }, 450);
  };

  const commitSessionMessages = (sessionId: string, nextMessages: AiChatMessage[]) => {
    const now = new Date().toISOString();
    const hasConversation = nextMessages.some(m => m.sender === 'user');
    const existing = sessionsRef.current.find(s => s.id === sessionId) || createEmptySession();
    const updatedSession: AiChatSession = {
      ...existing,
      id: sessionId,
      title: deriveChatTitle(nextMessages),
      messages: nextMessages,
      updatedAt: now
    };

    setSessions(prev => {
      const others = prev.filter(s => s.id !== sessionId);
      return [updatedSession, ...others].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    });

    if (hasConversation) {
      saveAiChat(updatedSession).catch(() => {});
    }
  };

  const updateMessageState = (msgId: string, patch: Partial<AiChatMessage>) => {
    const targetSession = sessionsRef.current.find(s => s.id === activeSession.id) || activeSession;
    const nextMessages = targetSession.messages.map(m => (m.id === msgId ? { ...m, ...patch } : m));
    commitSessionMessages(targetSession.id, nextMessages);
  };

  const handleStartNewChat = () => {
    const currentHasConversation = activeSession.messages.some(m => m.sender === 'user');
    if (!currentHasConversation && sessions.some(s => s.id === activeSession.id)) {
      setShowHistoryDrawer(false);
      return;
    }
    const fresh = createEmptySession();
    setSessions(prev => [fresh, ...prev]);
    setActiveSessionId(fresh.id);
    setShowHistoryDrawer(false);
  };

  const handleDeleteSession = async (chatId: string) => {
    await deleteAiChat(chatId);
    const remaining = sessionsRef.current.filter(s => s.id !== chatId);
    if (remaining.length === 0) {
      const fresh = createEmptySession();
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
    } else {
      setSessions(remaining);
      if (activeSession.id === chatId) {
        setActiveSessionId(remaining[0].id);
      }
    }
  };

  const handlePersonaChange = async (nextPersona: AiPersonaPreset) => {
    if (nextPersona === activePersona) return;
    try {
      await onUpdateSettings({ ...settings, aiPersona: nextPersona });
    } catch {
      showInlineNotice('Could not save persona preference.');
    }
  };

  const applyHouseUpdateToList = (
    list: HouseConfig[],
    upd: {
      houseId?: string;
      houseName?: string;
      newName?: string;
      newQuota?: number;
      newHouseparent?: string;
      newPhone?: string;
      active?: boolean;
    }
  ): { nextList: HouseConfig[]; matchedHouse?: HouseConfig } => {
    const match = findMatchingHouse(list, upd.houseId, upd.houseName);
    if (!match) return { nextList: list };

    const updatedHouse: HouseConfig = {
      ...match,
      name: upd.newName ? String(upd.newName).trim() : match.name,
      expectedStudentCount:
        upd.newQuota !== undefined && !isNaN(Number(upd.newQuota))
          ? Math.max(1, Math.round(Number(upd.newQuota)))
          : match.expectedStudentCount,
      assignedHouseparent: upd.newHouseparent ? String(upd.newHouseparent).trim() : match.assignedHouseparent,
      houseparentPhone: upd.newPhone !== undefined ? String(upd.newPhone).trim() : match.houseparentPhone,
      active: upd.active !== undefined ? Boolean(upd.active) : match.active,
      updatedAt: new Date().toISOString()
    };

    return {
      nextList: list.map(h => (h.id === match.id ? updatedHouse : h)),
      matchedHouse: updatedHouse
    };
  };

  const runSingleAction = async (
    actionType: string,
    payload: Record<string, any> = {}
  ): Promise<{ statusText: string; shouldAutoClose: boolean }> => {
    if (actionType === 'draft_whatsapp') {
      const msgText = payload.whatsappMessage || payload.message || '';
      if (!msgText) throw new Error('No WhatsApp message text found in draft.');
      const matchedHouse = findMatchingHouse(houses, payload.houseId, payload.houseName);
      const targetPhone = payload.phone || matchedHouse?.houseparentPhone;
      openWhatsApp(msgText, settings.whatsAppBehavior || 'app', targetPhone);
      return { statusText: 'Opened in WhatsApp', shouldAutoClose: true };
    }

    if (actionType === 'update_house') {
      const currentHouses = getCachedHouses().length > 0 ? getCachedHouses() : houses;
      const { nextList, matchedHouse } = applyHouseUpdateToList(currentHouses, payload);
      if (!matchedHouse) {
        throw new Error(`Could not match house "${payload.houseName || payload.houseId || ''}".`);
      }
      await saveHouses(nextList);
      await fetch('/api/houses/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matchedHouse)
      }).catch(() => {});
      await onRefreshData();
      return { statusText: `Updated ${matchedHouse.name}`, shouldAutoClose: false };
    }

    if (actionType === 'batch_update_houses' && Array.isArray(payload.houseUpdates)) {
      const currentHouses = getCachedHouses().length > 0 ? getCachedHouses() : houses;
      let workingList = [...currentHouses];
      const touched: HouseConfig[] = [];
      for (const item of payload.houseUpdates) {
        const { nextList, matchedHouse } = applyHouseUpdateToList(workingList, item);
        workingList = nextList;
        if (matchedHouse) touched.push(matchedHouse);
      }
      if (touched.length === 0) throw new Error('No matching houses found to update.');
      await saveHouses(workingList);
      await Promise.all(
        touched.map(h =>
          fetch('/api/houses/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(h)
          }).catch(() => {})
        )
      );
      await onRefreshData();
      return {
        statusText: `Updated ${touched.length} house${touched.length === 1 ? '' : 's'}`,
        shouldAutoClose: false
      };
    }

    if (actionType === 'log_house_report') {
      const currentHouses = getCachedHouses().length > 0 ? getCachedHouses() : houses;
      const match = findMatchingHouse(currentHouses, payload.houseId, payload.houseName);
      if (!match) {
        throw new Error(`Could not match house "${payload.houseName || payload.houseId || ''}".`);
      }
      const repDate = payload.reportingDate || selectedDate;
      const reportedCount = Math.max(0, Math.round(Number(payload.reportedCount) || 0));
      const expectedCount = match.expectedStudentCount;
      const notReportedCount = Math.max(0, expectedCount - reportedCount);

      const newReport: HouseDailyReport = {
        id: `${repDate}_${match.id}`,
        termId: activeTerm?.id || settings.activeTermId || 'term-default',
        reportingDate: repDate,
        houseId: match.id,
        houseName: match.name,
        houseCategory: match.category,
        expectedCount,
        reportedCount,
        notReportedCount,
        notReportedDetails: payload.notReportedDetails || '',
        notes: payload.notes || 'Logged via Xtreme AI',
        houseparent: match.assignedHouseparent,
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: notReportedCount === 0 ? 'complete' : 'follow_up_needed',
        source: 'manual_correction'
      };
      await saveHouseReport(newReport);
      await onRefreshData();
      return { statusText: `Saved ${match.name} (${reportedCount}/${expectedCount})`, shouldAutoClose: false };
    }

    if (actionType === 'batch_log_reports' && Array.isArray(payload.reportUpdates)) {
      let savedCount = 0;
      for (const item of payload.reportUpdates) {
        const match = findMatchingHouse(houses, item.houseId, item.houseName);
        if (!match) continue;
        const repDate = item.reportingDate || selectedDate;
        const reportedCount = Math.max(0, Math.round(Number(item.reportedCount) || 0));
        const expectedCount = match.expectedStudentCount;
        const notReportedCount = Math.max(0, expectedCount - reportedCount);
        const rep: HouseDailyReport = {
          id: `${repDate}_${match.id}`,
          termId: activeTerm?.id || settings.activeTermId || 'term-default',
          reportingDate: repDate,
          houseId: match.id,
          houseName: match.name,
          houseCategory: match.category,
          expectedCount,
          reportedCount,
          notReportedCount,
          notReportedDetails: item.notReportedDetails || '',
          notes: item.notes || 'Batch logged via Xtreme AI',
          houseparent: match.assignedHouseparent,
          submittedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: notReportedCount === 0 ? 'complete' : 'follow_up_needed',
          source: 'manual_correction'
        };
        await saveHouseReport(rep);
        savedCount++;
      }
      if (savedCount === 0) throw new Error('No matching houses found for batch report.');
      await onRefreshData();
      return { statusText: `Logged ${savedCount} report${savedCount === 1 ? '' : 's'}`, shouldAutoClose: false };
    }

    if (actionType === 'delete_house_report') {
      const match = findMatchingHouse(houses, payload.houseId, payload.houseName);
      if (!match) {
        throw new Error(`Could not match house "${payload.houseName || payload.houseId || ''}".`);
      }
      const repDate = payload.reportingDate || selectedDate;
      await deleteHouseReport(`${repDate}_${match.id}`);
      await onRefreshData();
      return { statusText: `Deleted ${match.name} report (${repDate})`, shouldAutoClose: false };
    }

    if (actionType === 'select_date' && payload.date) {
      onSelectDate(payload.date);
      onNavigateTab('houseReports');
      return { statusText: `Switched date to ${payload.date}`, shouldAutoClose: true };
    }

    if (actionType === 'open_house_modal') {
      const match = findMatchingHouse(houses, payload.houseId, payload.houseName);
      if (!match) {
        throw new Error(`Could not find house "${payload.houseName || payload.houseId || ''}".`);
      }
      onNavigateTab('houseReports');
      onOpenHouseModal(match.id);
      return { statusText: `Opened ${match.name}`, shouldAutoClose: true };
    }

    if (actionType === 'open_form_link_modal') {
      onNavigateTab('houseReports');
      onOpenFormLinkModal();
      return { statusText: 'Opened Form Link modal', shouldAutoClose: true };
    }

    if (actionType === 'open_whatsapp_modal') {
      const match = findMatchingHouse(houses, payload.houseId, payload.houseName);
      onNavigateTab('houseReports');
      onOpenWhatsAppModal(match?.id || 'all', payload.date);
      return { statusText: 'Opened WhatsApp modal', shouldAutoClose: true };
    }

    if (actionType === 'copy_text') {
      const txt = payload.textToCopy || payload.whatsappMessage || payload.message || '';
      if (!txt) throw new Error('No text available to copy.');
      await copyToClipboard(txt);
      return { statusText: payload.copyLabel || 'Copied to clipboard', shouldAutoClose: false };
    }

    if (actionType === 'send_duty_announcement') {
      const target =
        assignments.find(a => a.id === payload.assignmentId) ||
        assignments.find(
          a => payload.weekLabel && a.weekLabel.toLowerCase().includes(String(payload.weekLabel).toLowerCase())
        ) ||
        featuredAssignment ||
        assignments[0];
      if (!target) throw new Error('No duty assignment found to announce.');
      const formattedMsg = generateAnnouncementMessage(settings.messageTemplate, target);
      await copyToClipboard(formattedMsg).catch(() => false);
      openWhatsApp(formattedMsg, settings.whatsAppBehavior || 'app', payload.phone);
      return { statusText: `Dispatched ${target.weekLabel} announcement`, shouldAutoClose: true };
    }

    if (actionType === 'mark_duty_done') {
      await onMarkDutyDone();
      await onRefreshData();
      return { statusText: 'Duty marked done & alarms silenced', shouldAutoClose: false };
    }

    if (actionType === 'unmark_duty_done') {
      await onUnmarkDutyDone();
      await onRefreshData();
      return { statusText: 'Duty restored to pending', shouldAutoClose: false };
    }

    if (actionType === 'update_duty_assignment') {
      const target =
        assignments.find(a => a.id === payload.assignmentId) ||
        assignments.find(
          a => payload.weekLabel && a.weekLabel.toLowerCase().includes(String(payload.weekLabel).toLowerCase())
        ) ||
        featuredAssignment ||
        assignments[0];

      if (!target) throw new Error('No duty assignment found to update.');

      const nextTeachers = Array.isArray(payload.teachers)
        ? payload.teachers.map((t: any, idx: number) => ({
            id: target.teachers[idx]?.id || `t-ai-${Date.now()}-${idx}`,
            name: String(t.name || '').trim(),
            role: t.role ? String(t.role).trim() : undefined
          }))
        : target.teachers;

      const updated: DutyAssignment = {
        ...target,
        dutyTitle: payload.dutyTitle ? String(payload.dutyTitle).trim() : target.dutyTitle,
        weekLabel: payload.weekLabel ? String(payload.weekLabel).trim() : target.weekLabel,
        startDate: payload.startDate || target.startDate,
        endDate: payload.endDate || target.endDate,
        teachers: nextTeachers,
        updatedAt: new Date().toISOString()
      };

      await updateDutyAssignment(updated);
      await onRefreshData();
      return { statusText: `Updated ${updated.weekLabel}`, shouldAutoClose: false };
    }

    if (actionType === 'set_active_roster') {
      const target =
        rosters.find(r => r.id === payload.rosterId) ||
        rosters.find(r => payload.rosterName && r.name.toLowerCase().includes(String(payload.rosterName).toLowerCase()));
      if (!target) throw new Error('Matching duty roster not found.');
      await setActiveRoster(target.id);
      await onRefreshData();
      return { statusText: `Activated ${target.name}`, shouldAutoClose: false };
    }

    if (actionType === 'test_duty_alarm') {
      await testUrgentNotification();
      onTriggerAlarmTest?.();
      return { statusText: 'Duty alarm triggered', shouldAutoClose: true };
    }

    if (actionType === 'download_duty_ics') {
      const teachersText = featuredAssignment?.teachers?.map(t => t.name).join(', ') || 'Teachers on Duty';
      const todayIso = getLocalTodayIso();
      const upcomingEvents = [...assignments]
        .filter(a => (a.endDate || a.startDate) >= todayIso)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, 8)
        .map(a => ({
          id: a.id,
          weekLabel: a.weekLabel,
          startDate: a.startDate,
          endDate: a.endDate,
          teachersText: a.teachers.map(t => t.name).join(', ') || 'Teachers on Duty'
        }));
      downloadDutyCalendarAlarm(
        settings.reminderDay ?? 0,
        settings.reminderTime || '08:00',
        featuredAssignment?.weekLabel || 'Weekly Teacher Duty',
        teachersText,
        upcomingEvents
      );
      return { statusText: 'Opened calendar reminder (.ics)', shouldAutoClose: false };
    }

    if (actionType === 'create_term') {
      const today = getLocalTodayIso();
      const now = new Date().toISOString();
      const resolvedName = String(payload.termName || 'New Term').trim();
      const resolvedType: 'term' | 'midterm' =
        payload.termType === 'midterm' || resolvedName.toLowerCase().includes('mid')
          ? 'midterm'
          : 'term';
      const newTerm: AcademicTerm = {
        id: `${resolvedType === 'midterm' ? 'midterm' : 'term'}-${Date.now()}`,
        academicYear: payload.academicYear || '2026/2027',
        termName: resolvedName,
        termType: resolvedType,
        openingDate: payload.openingDate || today,
        reportingStartDate: payload.reportingStartDate || payload.openingDate || today,
        reportingEndDate: payload.reportingEndDate || payload.openingDate || today,
        status: 'open',
        createdAt: now,
        updatedAt: now
      };
      await saveTerm(newTerm);
      await onUpdateSettings({ ...settings, activeTermId: newTerm.id, updatedAt: now });
      await onRefreshData();
      return { statusText: `Created & activated ${newTerm.termName}`, shouldAutoClose: false };
    }

    if (actionType === 'activate_term') {
      const currentTerms = getCachedTerms().length > 0 ? getCachedTerms() : terms;
      const target =
        currentTerms.find(t => t.id === payload.termId) ||
        currentTerms.find(
          t =>
            payload.termName &&
            `${t.termName} ${t.academicYear}`.toLowerCase().includes(String(payload.termName).toLowerCase())
        );
      if (!target) throw new Error('Matching academic term not found.');
      await onUpdateSettings({ ...settings, activeTermId: target.id, updatedAt: new Date().toISOString() });
      await onRefreshData();
      return { statusText: `Activated ${target.termName}`, shouldAutoClose: false };
    }

    if (actionType === 'delete_term') {
      const currentTerms = getCachedTerms().length > 0 ? getCachedTerms() : terms;
      const target =
        currentTerms.find(t => t.id === payload.termId) ||
        currentTerms.find(
          t =>
            payload.termName &&
            `${t.termName} ${t.academicYear}`.toLowerCase().includes(String(payload.termName).toLowerCase())
        );
      if (!target) throw new Error('Matching academic term not found.');
      await deleteTerm(target.id);
      if (settings.activeTermId === target.id) {
        const nextActive = currentTerms.find(t => t.id !== target.id);
        await onUpdateSettings({
          ...settings,
          activeTermId: nextActive?.id,
          updatedAt: new Date().toISOString()
        });
      }
      await onRefreshData();
      return { statusText: `Deleted ${target.termName}`, shouldAutoClose: false };
    }

    if (actionType === 'update_settings') {
      const nextSettings: AppSettings = {
        ...settings,
        ...(payload.messageTemplate !== undefined ? { messageTemplate: String(payload.messageTemplate) } : {}),
        ...(payload.reminderEnabled !== undefined ? { reminderEnabled: Boolean(payload.reminderEnabled) } : {}),
        ...(payload.reminderDay !== undefined ? { reminderDay: Number(payload.reminderDay) } : {}),
        ...(payload.reminderTime !== undefined ? { reminderTime: String(payload.reminderTime) } : {}),
        ...(payload.soundAlertEnabled !== undefined
          ? { soundAlertEnabled: Boolean(payload.soundAlertEnabled) }
          : {}),
        ...(payload.voiceAlertEnabled !== undefined
          ? { voiceAlertEnabled: Boolean(payload.voiceAlertEnabled) }
          : {}),
        autoAnnounceEnabled: false,
        autoCopyOnSchedule: false,
        ...(payload.whatsAppBehavior ? { whatsAppBehavior: payload.whatsAppBehavior } : {}),
        ...(payload.aiPersona ? { aiPersona: payload.aiPersona } : {}),
        updatedAt: new Date().toISOString()
      };
      await onUpdateSettings(nextSettings);
      return { statusText: 'Settings saved', shouldAutoClose: false };
    }

    if (actionType === 'trigger_tally_sync') {
      const syncRes = await syncTallyNow();
      await onRefreshData();
      return {
        statusText: syncRes.success ? `Synced (${syncRes.newReportsImported || 0} new)` : 'Tally sync completed',
        shouldAutoClose: false
      };
    }

    if (actionType === 'navigate_tab' && payload.tabName) {
      const tab = payload.tabName as 'houseReports' | 'duty' | 'settings';
      if (tab === 'settings' && payload.settingsSection && onOpenSettingsSection) {
        onOpenSettingsSection(payload.settingsSection);
      }
      onNavigateTab(tab);
      return { statusText: `Opened ${tab}`, shouldAutoClose: true };
    }

    if (actionType === 'set_persona' && payload.aiPersona) {
      const p = payload.aiPersona as AiPersonaPreset;
      if (['concise', 'supportive', 'detailed'].includes(p)) {
        await onUpdateSettings({ ...settings, aiPersona: p });
        return { statusText: `Switched to ${p} persona`, shouldAutoClose: false };
      }
    }

    if (actionType === 'toggle_theme') {
      onToggleTheme?.(payload.theme);
      return { statusText: 'Theme updated', shouldAutoClose: false };
    }

    if (actionType === 'export_report') {
      const rawFmt = String(payload.exportFormat || payload.format || 'pdf').toLowerCase();
      const fmt: ExportFormat =
        rawFmt === 'excel' || rawFmt === 'xlsx'
          ? 'excel'
          : rawFmt === 'word' || rawFmt === 'docx' || rawFmt === 'doc'
            ? 'word'
            : 'pdf';
      const scope =
        payload.exportScope === 'duty' || (payload.exportScope !== 'attendance' && activeTab === 'duty')
          ? 'duty'
          : 'attendance';

      if (scope === 'duty') {
        const activeRoster = rosters.find(r => r.isActive) || rosters[0] || null;
        const filename = await exportDutySchedule(fmt, {
          roster: activeRoster,
          assignments,
          sendHistory: [],
          currentAssignment: featuredAssignment,
          messageTemplate: settings.messageTemplate
        });
        return { statusText: `Exported ${filename}`, shouldAutoClose: false };
      }

      const targetDate = payload.date || selectedDate;
      const targetTerm = activeTerm || terms[0] || DEFAULT_TERM;
      const collation = collateDailyReports(reports, houses, targetDate, targetTerm.id);
      const dateReportsMap = new Map<string, HouseDailyReport>();
      for (const r of reports) {
        if (r.reportingDate === targetDate) {
          dateReportsMap.set(r.houseId, r);
        }
      }
      const filename = await exportAttendanceReport(fmt, {
        collation,
        houses,
        reports,
        dateReportsMap,
        selectedDate: targetDate,
        activeTerm: targetTerm,
        assignments
      });
      return { statusText: `Exported ${filename}`, shouldAutoClose: false };
    }

    throw new Error(`Unsupported action: ${actionType}`);
  };

  const handleSend = async (textToSend?: string) => {
    const prompt = (textToSend ?? input).trim();
    if (!prompt || loading) return;

    const sessionId = activeSession.id;
    const baseMessages = activeSession.messages;

    const userMsg: AiChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: new Date().toISOString()
    };

    const historySnapshot = baseMessages
      .filter(m => m.id !== 'welcome')
      .slice(-12)
      .map(m => ({ sender: m.sender, text: m.text }));

    const messagesWithUser = [...baseMessages, userMsg];
    commitSessionMessages(sessionId, messagesWithUser);
    if (!textToSend) setInput('');
    setShowHistoryDrawer(false);
    setLoading(true);

    try {
      const res = await fetch('/api/ai-controller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          aiPersona: activePersona,
          history: historySnapshot,
          context: {
            activeTab,
            selectedDate,
            activeTerm,
            terms,
            houses,
            reports,
            rosters,
            assignments,
            featuredAssignment,
            isDutyPending,
            settings
          }
        })
      });

      const rawRes = await res.text();
      let data: any = {};
      try {
        data = rawRes ? JSON.parse(rawRes) : {};
      } catch {
        throw new Error(`Invalid response from AI server (${res.status})`);
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'AI service unavailable');
      }

      if (data.modelUsed) {
        setLastModelUsed(data.modelUsed);
      }

      const aiMsgId = `ai-${Date.now()}`;
      const actionType: string = data.actionType || 'none';
      const actionPayload = data.actionPayload || {};
      const actionsList: AiActionItem[] | undefined =
        Array.isArray(data.actions) && data.actions.length > 0 ? data.actions : undefined;

      let autoApplied = false;
      let autoStatusText: string | undefined;

      // Instant, zero-risk UI actions execute right away (and trigger auto-close if enabled)
      const isSingleInstantAction =
        (!actionsList || actionsList.length <= 1) && INSTANT_ZERO_RISK_ACTIONS.has(actionType);

      if (isSingleInstantAction) {
        const effectivePayload = actionsList?.[0]?.actionPayload || actionPayload;
        try {
          const outcome = await runSingleAction(actionType, effectivePayload);
          autoApplied = true;
          autoStatusText = outcome.statusText;
          if (outcome.shouldAutoClose) {
            scheduleAutoClose(outcome.statusText);
          }
        } catch (err: any) {
          showInlineNotice(err?.message || 'Action could not complete automatically.');
        }
      }

      const aiMsg: AiChatMessage = {
        id: aiMsgId,
        sender: 'ai',
        text: data.replyText || 'Done.',
        timestamp: new Date().toISOString(),
        modelUsed: data.modelUsed,
        planTitle: data.planTitle || actionsList?.[0]?.planTitle,
        actionType,
        actionPayload,
        actions: actionsList,
        chartData: Array.isArray(data.chartData) ? data.chartData : undefined,
        actionApplied: autoApplied,
        actionStatusText: autoStatusText
      };

      commitSessionMessages(sessionId, [...messagesWithUser, aiMsg]);
    } catch (err: any) {
      commitSessionMessages(sessionId, [
        ...messagesWithUser,
        {
          id: `ai-err-${Date.now()}`,
          sender: 'ai',
          timestamp: new Date().toISOString(),
          text: `Unable to process request right now: **${err.message || 'Connection error'}**.`
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const executeActionCard = async (message: AiChatMessage) => {
    const { id: msgId, actionType, actionPayload = {}, actions } = message;
    const steps: AiActionItem[] =
      Array.isArray(actions) && actions.length > 0
        ? actions
        : actionType && actionType !== 'none'
          ? [{ actionType, planTitle: message.planTitle, actionPayload }]
          : [];

    if (steps.length === 0) return;

    setApplyingId(msgId);
    try {
      let lastStatus = 'Applied';
      let anyAutoClose = false;
      for (const step of steps) {
        const res = await runSingleAction(step.actionType, step.actionPayload || {});
        lastStatus = res.statusText;
        if (res.shouldAutoClose || AUTO_CLOSE_ACTIONS.has(step.actionType)) {
          anyAutoClose = true;
        }
      }

      const finalStatus =
        steps.length > 1 ? `Completed ${steps.length} actions` : lastStatus;

      updateMessageState(msgId, {
        actionApplied: true,
        actionStatusText: finalStatus
      });

      if (anyAutoClose) {
        scheduleAutoClose(finalStatus);
      }
    } catch (err: any) {
      showInlineNotice(err?.message || 'Action failed.');
    } finally {
      setApplyingId(null);
    }
  };

  const handleVoiceToggle = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showInlineNotice('Voice input is not supported in this browser.');
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsRecording(true);
      recognition.onresult = (event: any) => {
        const speechText = event.results[0][0].transcript;
        setInput(speechText);
        setIsRecording(false);
        handleSend(speechText);
      };
      recognition.onerror = () => {
        setIsRecording(false);
        showInlineNotice('Could not capture voice audio. Check microphone permissions.');
      };
      recognition.onend = () => setIsRecording(false);
      recognition.start();
    } catch {
      setIsRecording(false);
      showInlineNotice('Unable to start microphone input.');
    }
  };

  const handleCopyDraft = async (msgId: string, text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="Open Xtreme AI Assistant"
          className="min-h-[46px] px-4 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center gap-2 shadow-2xl cursor-pointer transition-transform hover:scale-105 active:scale-95 whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>AI Assistant</span>
        </button>
      </div>

      {/* Chat Drawer Modal */}
      {isOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsOpen(false);
              setShowHistoryDrawer(false);
            }
          }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-2 sm:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]"
        >
          <div className="w-full max-w-lg h-[86vh] sm:h-[660px] rounded-2xl border border-[var(--card-border)] bg-[var(--modal-bg)] text-[var(--text-page)] shadow-2xl flex flex-col overflow-hidden text-left">
            {/* Header */}
            <div className="px-4 py-3 border-b border-[var(--card-border)] bg-[var(--card-bg-elevated)] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-extrabold text-[var(--text-page)] truncate">
                      Xtreme AI Assistant
                    </h3>
                    <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                      {formatModelLabel(lastModelUsed)} · {selectedDate}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleStartNewChat}
                    title="Start new chat"
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500/50 text-[11px] font-semibold text-[var(--text-page)] flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-500" />
                    <span>New</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowHistoryDrawer(v => !v)}
                    title="Saved conversations"
                    className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                      showHistoryDrawer
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
                        : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-page)]'
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span className="tabular-nums">{sessions.filter(s => s.messages.some(m => m.sender === 'user')).length}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setShowHistoryDrawer(false);
                    }}
                    aria-label="Close AI Assistant"
                    className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-page)] hover:bg-[var(--card-bg)] cursor-pointer transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Persona Switcher & Auto-close Toggle */}
              <div className="flex items-center justify-between gap-2 text-[11px] flex-wrap">
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)]">
                  {(
                    [
                      { id: 'concise', label: 'Concise' },
                      { id: 'supportive', label: 'Supportive' },
                      { id: 'detailed', label: 'Detailed' }
                    ] as const
                  ).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePersonaChange(p.id)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                        activePersona === p.id
                          ? 'bg-emerald-500 text-black'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-page)]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={toggleAutoClose}
                  title="Auto-close drawer after opening modals, changing dates, or launching WhatsApp"
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                    autoCloseEnabled
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                      : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)]'
                  }`}
                >
                  Auto-close: {autoCloseEnabled ? 'On' : 'Off'}
                </button>
              </div>
            </div>

            {/* Inline Alert Banner */}
            {inlineNotice && (
              <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-500 text-xs font-medium flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">{inlineNotice}</span>
              </div>
            )}

            {/* Saved Chat History Panel OR Live Message Stream */}
            {showHistoryDrawer ? (
              <div className="flex-1 p-4 overflow-y-auto space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-[var(--card-border-subtle)]">
                  <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    Saved Chats
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHistoryDrawer(false)}
                    className="text-xs font-semibold text-emerald-500 hover:underline cursor-pointer"
                  >
                    Back to Chat
                  </button>
                </div>

                {sessions.map(session => {
                  const isCurrent = session.id === activeSession.id;
                  const msgCount = session.messages.filter(m => m.sender === 'user').length;
                  return (
                    <div
                      key={session.id}
                      onClick={() => {
                        setActiveSessionId(session.id);
                        setShowHistoryDrawer(false);
                      }}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        isCurrent
                          ? 'border-emerald-500/50 bg-emerald-500/10'
                          : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MessageSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[var(--text-page)] truncate">
                            {session.title}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                            {msgCount} prompt{msgCount === 1 ? '' : 's'} · {formatRelativeDate(session.updatedAt)}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(session.id);
                        }}
                        title="Delete chat"
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
                {messages.map(m => {
                  const formatted = m.sender === 'ai' ? formatAiResponse(m.text, m.chartData) : null;
                  const whatsappDraft = m.actionPayload?.whatsappMessage || m.actionPayload?.message;
                  const hasMultiSteps = Array.isArray(m.actions) && m.actions.length > 1;
                  const hasAction =
                    (m.actionType && m.actionType !== 'none') ||
                    (Array.isArray(m.actions) && m.actions.length > 0);

                  return (
                    <div
                      key={m.id}
                      className={`flex items-start gap-2.5 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                          m.sender === 'user'
                            ? 'bg-emerald-500 text-black font-bold text-xs'
                            : 'bg-[var(--card-bg-elevated)] text-emerald-500 border border-[var(--card-border)]'
                        }`}
                      >
                        {m.sender === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                      </div>

                      <div
                        className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                          m.sender === 'user'
                            ? 'bg-emerald-500 text-black font-semibold rounded-tr-none'
                            : 'bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-page)] rounded-tl-none'
                        }`}
                      >
                        {m.sender === 'user' ? (
                          <div className="whitespace-pre-wrap">{m.text}</div>
                        ) : (
                          <div className="space-y-2">
                            <div
                              dangerouslySetInnerHTML={{ __html: formatted?.htmlText || '' }}
                              className="space-y-1.5"
                            />

                            {formatted?.hasChart && formatted.chartData && (
                              <MiniMetricChart
                                title="Attendance Breakdown"
                                data={formatted.chartData}
                                compact
                              />
                            )}
                          </div>
                        )}

                        {/* Action Review & Execute Card */}
                        {hasAction && (
                          <div className="mt-3 pt-2.5 border-t border-[var(--card-border-subtle)] space-y-2">
                            {m.planTitle && (
                              <div className="text-[11px] font-bold text-emerald-500 flex items-center justify-between gap-2">
                                <span>{m.planTitle}</span>
                                {m.actionApplied && (
                                  <span className="text-[10px] font-mono text-emerald-500 flex items-center gap-1 shrink-0">
                                    <CheckCircle2 className="w-3 h-3" />
                                    {m.actionStatusText || 'Applied'}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Multi-Step Chained Actions Preview */}
                            {hasMultiSteps && m.actions && (
                              <div className="p-2 rounded-lg bg-[var(--card-bg-elevated)] text-[11px] font-mono space-y-1 text-[var(--text-muted)]">
                                {m.actions.map((step, idx) => (
                                  <div key={idx} className="flex items-center gap-1.5">
                                    <span className="text-emerald-500 font-bold">{idx + 1}.</span>
                                    <span className="text-[var(--text-page)] truncate">
                                      {step.planTitle || step.actionType}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Draft WhatsApp Message Preview */}
                            {m.actionType === 'draft_whatsapp' && whatsappDraft && (
                              <div className="p-2.5 rounded-xl border border-[var(--card-border-subtle)] bg-[var(--code-bg)] text-[11px] font-mono whitespace-pre-wrap max-h-36 overflow-y-auto text-[var(--text-page)]">
                                {whatsappDraft}
                              </div>
                            )}

                            {/* House Update Diff Preview */}
                            {m.actionType === 'update_house' && m.actionPayload && (
                              <div className="p-2 rounded-lg bg-[var(--card-bg-elevated)] text-[11px] font-mono space-y-0.5 text-[var(--text-muted)]">
                                <div className="text-[var(--text-page)] font-bold">
                                  {m.actionPayload.houseName || m.actionPayload.houseId}
                                </div>
                                {m.actionPayload.newName && <div>Name → {m.actionPayload.newName}</div>}
                                {m.actionPayload.newQuota !== undefined && <div>Quota → {m.actionPayload.newQuota}</div>}
                                {m.actionPayload.newHouseparent && <div>Houseparent → {m.actionPayload.newHouseparent}</div>}
                                {m.actionPayload.newPhone && <div>Phone → {m.actionPayload.newPhone}</div>}
                              </div>
                            )}

                            {/* Batch House Update Preview */}
                            {m.actionType === 'batch_update_houses' && Array.isArray(m.actionPayload?.houseUpdates) && (
                              <div className="p-2 rounded-lg bg-[var(--card-bg-elevated)] text-[11px] font-mono space-y-1 text-[var(--text-muted)]">
                                {m.actionPayload.houseUpdates.map((u: any, idx: number) => (
                                  <div key={idx} className="flex justify-between gap-2">
                                    <span className="text-[var(--text-page)] font-semibold truncate">{u.houseName || u.houseId}</span>
                                    <span className="shrink-0">
                                      {[
                                        u.newQuota !== undefined ? `Quota:${u.newQuota}` : null,
                                        u.newHouseparent ? u.newHouseparent : null
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Log Report Preview */}
                            {m.actionType === 'log_house_report' && m.actionPayload && (
                              <div className="p-2 rounded-lg bg-[var(--card-bg-elevated)] text-[11px] font-mono text-[var(--text-muted)]">
                                <span className="text-[var(--text-page)] font-bold">
                                  {m.actionPayload.houseName || m.actionPayload.houseId}
                                </span>{' '}
                                · {m.actionPayload.reportingDate || selectedDate} · Count:{' '}
                                <strong className="text-emerald-500">{m.actionPayload.reportedCount}</strong>
                              </div>
                            )}

                            {/* Batch Log Report Preview */}
                            {m.actionType === 'batch_log_reports' && Array.isArray(m.actionPayload?.reportUpdates) && (
                              <div className="p-2 rounded-lg bg-[var(--card-bg-elevated)] text-[11px] font-mono space-y-1 text-[var(--text-muted)]">
                                {m.actionPayload.reportUpdates.map((r: any, idx: number) => (
                                  <div key={idx} className="flex justify-between gap-2">
                                    <span className="text-[var(--text-page)] font-semibold truncate">{r.houseName || r.houseId}</span>
                                    <span className="text-emerald-500 font-bold shrink-0">{r.reportedCount}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Action Buttons */}
                            {m.actionType === 'draft_whatsapp' && !hasMultiSteps ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => executeActionCard(m)}
                                  className="flex-1 min-h-[36px] py-1.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>1-Tap Send to WhatsApp</span>
                                </button>
                                {whatsappDraft && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyDraft(m.id, whatsappDraft)}
                                    className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:border-emerald-500 text-xs font-semibold text-[var(--text-page)] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                  >
                                    {copiedId === m.id ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                    <span>{copiedId === m.id ? 'Copied' : 'Copy'}</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={
                                  applyingId === m.id ||
                                  (m.actionApplied && !INSTANT_ZERO_RISK_ACTIONS.has(m.actionType || ''))
                                }
                                onClick={() => executeActionCard(m)}
                                className={`w-full min-h-[36px] py-1.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                                  m.actionApplied
                                    ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                                    : 'bg-emerald-500 hover:bg-emerald-400 text-black disabled:opacity-50'
                                }`}
                              >
                                {applyingId === m.id ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Applying...</span>
                                  </>
                                ) : m.actionApplied ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>{m.actionStatusText || 'Applied'}</span>
                                  </>
                                ) : (
                                  <>
                                    <ArrowRight className="w-3.5 h-3.5" />
                                    <span>
                                      {hasMultiSteps && m.actions
                                        ? `Apply All (${m.actions.length})`
                                        : m.actionType === 'mark_duty_done'
                                          ? 'Confirm Mark Duty Done'
                                          : m.actionType === 'trigger_tally_sync'
                                            ? 'Sync Tally Now'
                                            : 'Apply Change'}
                                    </span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {loading && (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] p-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                    <span>Analyzing live data...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Quick Suggestion Chips */}
            <div className="px-4 py-2 border-t border-[var(--card-border-subtle)] flex items-center gap-1.5 overflow-x-auto text-[11px] bg-[var(--card-bg)]">
              {[
                'Summarize today with chart',
                'Show missing reports',
                '7-day attendance trend',
                'Draft WhatsApp reminder',
                'Mark duty done',
                'Open Form Link modal'
              ].map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleSend(chip)}
                  disabled={loading}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg-elevated)] hover:border-emerald-500 text-[var(--text-page)] shrink-0 cursor-pointer transition-colors whitespace-nowrap"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-[var(--card-border)] bg-[var(--card-bg-elevated)] flex items-center gap-2">
              <button
                type="button"
                onClick={handleVoiceToggle}
                title="Voice input"
                className={`min-h-[40px] min-w-[40px] p-2.5 rounded-xl border cursor-pointer transition-colors flex items-center justify-center shrink-0 ${
                  isRecording
                    ? 'bg-rose-500 text-white border-rose-600'
                    : 'border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-page)]'
                }`}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={isRecording ? 'Listening...' : 'Ask or command anything in Xtreme...'}
                className="flex-1 min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] text-xs text-[var(--text-page)] outline-none focus:border-emerald-500"
              />

              <button
                type="button"
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs flex items-center justify-center cursor-pointer transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
