export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

const SOUND_SNOOZE_KEY = 'xtreme_sound_snooze_until';
let sharedAudioCtx: AudioContext | null = null;
let cachedAlarmWavUrl: string | null = null;
let sharedAlarmAudioEl: HTMLAudioElement | null = null;
let audioUnlockAttached = false;
let repeatingAlarmTimer: ReturnType<typeof setInterval> | null = null;
let activeWakeLock: any = null;

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

/**
 * Generates an unmistakable multi-pulse WAV alert chime in memory so iPhone <audio>
 * playback works reliably alongside Web Audio oscillators.
 */
function buildUrgentBellWavDataUrl(): string {
  if (cachedAlarmWavUrl) return cachedAlarmWavUrl;
  const sampleRate = 22050;
  const durationSec = 1.05;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  view.setUint8(8, 'W'.charCodeAt(0));
  view.setUint8(9, 'A'.charCodeAt(0));
  view.setUint8(10, 'V'.charCodeAt(0));
  view.setUint8(11, 'E'.charCodeAt(0));
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const pulses = [
    { start: 0.0, end: 0.17, f1: 880, f2: 1318.51 },
    { start: 0.21, end: 0.38, f1: 1046.5, f2: 1567.98 },
    { start: 0.44, end: 0.64, f1: 1318.51, f2: 1760 },
    { start: 0.72, end: 1.02, f1: 1318.51, f2: 1975.53 }
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (const p of pulses) {
      if (t >= p.start && t <= p.end) {
        const localT = t - p.start;
        const len = p.end - p.start;
        const env = Math.min(1, localT / 0.01) * Math.exp(-3.2 * (localT / len));
        const tone =
          0.65 * Math.sin(2 * Math.PI * p.f1 * t) +
          0.35 * Math.sin(2 * Math.PI * p.f2 * t);
        sample += env * tone;
      }
    }
    const clamped = Math.max(-0.95, Math.min(0.95, sample * 0.94));
    view.setInt16(44 + i * 2, Math.floor(clamped * 32767), true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  cachedAlarmWavUrl = `data:audio/wav;base64,${btoa(binary)}`;
  return cachedAlarmWavUrl;
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioContextClass();
    }
    const ctxState = sharedAudioCtx.state as string;
    if (ctxState === 'suspended' || ctxState === 'interrupted') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function getOrCreateAlarmAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  try {
    if (!sharedAlarmAudioEl) {
      sharedAlarmAudioEl = new Audio(buildUrgentBellWavDataUrl());
      sharedAlarmAudioEl.preload = 'auto';
      sharedAlarmAudioEl.volume = 1.0;
      (sharedAlarmAudioEl as any).playsInline = true;
    }
    return sharedAlarmAudioEl;
  } catch {
    return null;
  }
}

export function unlockAudioEngine(): void {
  if (typeof window === 'undefined' || audioUnlockAttached) return;
  audioUnlockAttached = true;

  const unlock = () => {
    const ctx = getOrCreateAudioContext();
    if (ctx && (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted')) {
      ctx.resume().catch(() => {});
    }
    const audioEl = getOrCreateAlarmAudioElement();
    if (audioEl && audioEl.paused) {
      audioEl.load();
    }
  };

  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('click', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

export function isSoundSnoozed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const until = parseInt(localStorage.getItem(SOUND_SNOOZE_KEY) || '0', 10);
    return until > Date.now();
  } catch {
    return false;
  }
}

export function getSnoozeRemainingMinutes(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const until = parseInt(localStorage.getItem(SOUND_SNOOZE_KEY) || '0', 10);
    if (until <= Date.now()) return 0;
    return Math.ceil((until - Date.now()) / 60000);
  } catch {
    return 0;
  }
}

export function snoozeSoundAlerts(minutes: number = 10): number {
  stopRepeatingAlarmSound();
  const until = Date.now() + minutes * 60 * 1000;
  try {
    localStorage.setItem(SOUND_SNOOZE_KEY, String(until));
  } catch {}
  return until;
}

export function clearSoundSnooze(): void {
  try {
    localStorage.removeItem(SOUND_SNOOZE_KEY);
  } catch {}
}

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionState;
}

/**
 * Registers real background Apple APNs / Web Push subscription with our server
 */
export async function subscribeToServerPush(sendWelcome: boolean = false): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  if (getNotificationPermission() !== 'granted') {
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const keyRes = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
      if (!keyRes.ok) return false;
      const { publicKey } = await keyRes.json();
      if (!publicKey) return false;

      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        sendWelcome
      })
    });
    return res.ok;
  } catch (err) {
    console.warn('Web Push subscription error:', err);
    return false;
  }
}

export async function syncDutyPushStateToServer(state: {
  assignmentId: string;
  weekLabel: string;
  teachersText: string;
  dutyPeriod?: string;
  message?: string;
  isAlreadySent: boolean;
  reminderEnabled: boolean;
  reminderDay: number;
  reminderTime: string;
  badgeCount: number;
}): Promise<void> {
  try {
    await fetch('/api/push/sync-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
  } catch {}
}

export async function triggerServerTestPush(): Promise<boolean> {
  try {
    await subscribeToServerPush(false);
    const res = await fetch('/api/push/test', { method: 'POST' });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.delivered > 0);
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      playUrgentAlarmChime(true);
      await subscribeToServerPush(true);
    }
    return result as NotificationPermissionState;
  } catch (err) {
    console.error('Failed to request notification permission:', err);
    return 'denied';
  }
}

/**
 * Speaks the overdue duty alert clearly over iPhone speaker
 */
export function speakUrgentDutyAlert(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch {}
}

export function stopSpeechAlert(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {}
}

/**
 * Prevents iPhone screen from auto-dimming/sleeping while active urgent alarm sheet is visible
 */
export async function requestAlarmWakeLock(): Promise<void> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  try {
    if (!activeWakeLock) {
      activeWakeLock = await (navigator as any).wakeLock.request('screen');
      activeWakeLock?.addEventListener?.('release', () => {
        activeWakeLock = null;
      });
    }
  } catch {}
}

export async function releaseAlarmWakeLock(): Promise<void> {
  if (!activeWakeLock) return;
  try {
    await activeWakeLock.release();
  } catch {}
  activeWakeLock = null;
}

/**
 * Maximum-audibility iPhone alert chime combining HTMLAudio WAV playback + dual Web Audio siren tones
 */
export function playUrgentAlarmChime(forcePlay: boolean = false): void {
  if (typeof window === 'undefined') return;
  if (!forcePlay && isSoundSnoozed()) return;

  try {
    const audioEl = getOrCreateAlarmAudioElement();
    if (audioEl) {
      audioEl.currentTime = 0;
      audioEl.volume = 1.0;
      audioEl.play().catch(() => {});
    }
  } catch {}

  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const tones = [
      { freq: 880.0, start: 0.0, dur: 0.14, gain: 0.48 },
      { freq: 1174.66, start: 0.16, dur: 0.14, gain: 0.52 },
      { freq: 1318.51, start: 0.32, dur: 0.16, gain: 0.55 },
      { freq: 1760.0, start: 0.5, dur: 0.28, gain: 0.58 },
      { freq: 1318.51, start: 0.84, dur: 0.14, gain: 0.5 },
      { freq: 1760.0, start: 1.0, dur: 0.3, gain: 0.58 }
    ];

    tones.forEach(t => {
      const osc = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = 'triangle';
      harmonic.type = 'sine';
      osc.frequency.setValueAtTime(t.freq, now + t.start);
      harmonic.frequency.setValueAtTime(t.freq * 1.5, now + t.start);

      gainNode.gain.setValueAtTime(t.gain, now + t.start);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);

      osc.connect(gainNode);
      harmonic.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + t.start);
      harmonic.start(now + t.start);
      osc.stop(now + t.start + t.dur);
      harmonic.stop(now + t.start + t.dur);
    });
  } catch {}
}

export const playNotificationChime = playUrgentAlarmChime;

/**
 * Continuously pulses chime + optional voice announcement every intervalMs while modal is open
 */
export function startRepeatingAlarmSound(
  intervalMs: number = 7000,
  voiceAnnouncement?: string
): void {
  stopRepeatingAlarmSound();
  requestAlarmWakeLock();
  playUrgentAlarmChime(false);
  if (voiceAnnouncement && !isSoundSnoozed()) {
    setTimeout(() => speakUrgentDutyAlert(voiceAnnouncement), 1150);
  }

  let tick = 0;
  repeatingAlarmTimer = setInterval(() => {
    if (!isSoundSnoozed() && document.visibilityState === 'visible') {
      tick++;
      playUrgentAlarmChime(false);
      if (voiceAnnouncement && tick % 2 === 0) {
        setTimeout(() => speakUrgentDutyAlert(voiceAnnouncement), 1150);
      }
    }
  }, intervalMs);
}

export function stopRepeatingAlarmSound(): void {
  if (repeatingAlarmTimer) {
    clearInterval(repeatingAlarmTimer);
    repeatingAlarmTimer = null;
  }
  stopSpeechAlert();
  releaseAlarmWakeLock();
  if (sharedAlarmAudioEl && !sharedAlarmAudioEl.paused) {
    try {
      sharedAlarmAudioEl.pause();
      sharedAlarmAudioEl.currentTime = 0;
    } catch {}
  }
}

export async function syncAppBadge(pendingCount: number): Promise<void> {
  if (typeof navigator === 'undefined') return;
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (pendingCount > 0 && typeof nav.setAppBadge === 'function') {
      await nav.setAppBadge(pendingCount);
    } else if (pendingCount <= 0 && typeof nav.clearAppBadge === 'function') {
      await nav.clearAppBadge();
    }
  } catch {}
}

export type EnhancedNotificationOptions = NotificationOptions & {
  playSound?: boolean;
  renotify?: boolean;
  vibrate?: number[];
  actions?: Array<{ action: string; title: string }>;
};

export async function sendLocalNotification(
  title: string = '⚠️ ACTION REQUIRED: Send Weekly Duty',
  options?: EnhancedNotificationOptions
): Promise<boolean> {
  if (options?.playSound !== false) {
    playUrgentAlarmChime(false);
  }

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(options?.vibrate || [400, 120, 400, 120, 600]);
    } catch {}
  }

  const perm = getNotificationPermission();
  if (perm !== 'granted') {
    return false;
  }

  const defaultOptions: any = {
    body: 'This week’s teacher duty announcement has not been sent. Tap to send on WhatsApp or mark done.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'xtreme-urgent-duty',
    renotify: true,
    requireInteraction: true,
    vibrate: [600, 150, 600, 150, 600, 200, 800],
    actions: [
      { action: 'open_duty', title: '📲 Open & Send' },
      { action: 'mark_done', title: '✅ Mark Done' }
    ],
    data: { url: '/?tab=duty' }
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, {
          ...defaultOptions,
          ...options
        });
        return true;
      }
    }

    new Notification(title, {
      ...defaultOptions,
      ...options
    });
    return true;
  } catch (err) {
    console.warn('Failed to fire local notification:', err);
    return false;
  }
}

export async function checkAndTriggerDutyAlert(
  weekId: string,
  weekLabel: string,
  teachersList: string,
  isMarkedDone: boolean,
  forceTrigger: boolean = false
): Promise<boolean> {
  if (isMarkedDone) {
    clearSoundSnooze();
    stopRepeatingAlarmSound();
    return false;
  }

  const storageKey = `xtreme_duty_alert_last_${weekId}`;
  const lastAlertTime = parseInt(localStorage.getItem(storageKey) || '0', 10);
  const now = Date.now();
  const minIntervalMs = 60 * 1000;

  if (forceTrigger || now - lastAlertTime >= minIntervalMs) {
    localStorage.setItem(storageKey, String(now));
    await sendLocalNotification(`⚠️ SEND DUTY NOW (${weekLabel})`, {
      body: `On Duty: ${teachersList}. Tap to send via WhatsApp or mark done.`,
      tag: `duty-pending-${weekId}`,
      requireInteraction: true,
      renotify: true
    });
    return true;
  }

  return false;
}

export async function testUrgentNotification(): Promise<boolean> {
  clearSoundSnooze();
  playUrgentAlarmChime(true);
  const perm = await requestNotificationPermission();
  const serverSent = await triggerServerTestPush();
  if (serverSent) {
    return true;
  }
  if (perm === 'granted') {
    return await sendLocalNotification('🔔 Xtreme iPhone Alert Active', {
      body: 'Loud chimes, voice alerts, and lock-screen push notifications stay active until marked done.',
      tag: 'xtreme-alert-test',
      requireInteraction: true,
      renotify: true,
      playSound: false
    });
  }
  return false;
}

export function snoozeUntilTimestamp(targetMs: number): number {
  stopRepeatingAlarmSound();
  const safeTarget = Math.max(Date.now() + 60 * 1000, targetMs);
  try {
    localStorage.setItem(SOUND_SNOOZE_KEY, String(safeTarget));
  } catch {}
  return safeTarget;
}

export function getTonightSnoozeTimestamp(hour24: number = 19, minute: number = 0): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour24, minute, 0, 0);
  if (target.getTime() <= now.getTime() + 5 * 60 * 1000) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

export function getNextReminderDate(
  reminderDay: number = 0,
  reminderTime: string = '08:00',
  referenceNow: Date = new Date()
): Date {
  const [hhStr, mmStr] = (reminderTime || '08:00').split(':');
  const hh = Math.max(0, Math.min(23, Number.isFinite(parseInt(hhStr, 10)) ? parseInt(hhStr, 10) : 8));
  const mm = Math.max(0, Math.min(59, Number.isFinite(parseInt(mmStr, 10)) ? parseInt(mmStr, 10) : 0));

  const next = new Date(referenceNow);
  const normalizedDay = ((Number(reminderDay) || 0) % 7 + 7) % 7;
  const diff = (normalizedDay - referenceNow.getDay() + 7) % 7;
  next.setDate(referenceNow.getDate() + diff);
  next.setHours(hh, mm, 0, 0);
  if (next.getTime() <= referenceNow.getTime()) {
    next.setDate(next.getDate() + 7);
  }
  return next;
}

export function formatCountdownToReminder(
  targetDate: Date,
  referenceNow: Date = new Date()
): string {
  const diffMs = Math.max(0, targetDate.getTime() - referenceNow.getTime());
  const totalMins = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

export function isDutyReminderOverdue(
  assignmentStartDate: string | undefined,
  reminderDay: number = 0,
  reminderTime: string = '08:00',
  isAlreadySent: boolean = false,
  referenceNow: Date = new Date()
): boolean {
  if (isAlreadySent) return false;
  if (isTodayReminderDay(reminderDay, referenceNow) && hasReminderTimePassed(reminderTime, referenceNow)) {
    return true;
  }
  if (!assignmentStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(assignmentStartDate)) {
    return false;
  }
  const [y, m, d] = assignmentStartDate.split('-').map(Number);
  const [hhStr, mmStr] = (reminderTime || '08:00').split(':');
  const hh = Math.max(0, Math.min(23, Number.isFinite(parseInt(hhStr, 10)) ? parseInt(hhStr, 10) : 8));
  const mm = Math.max(0, Math.min(59, Number.isFinite(parseInt(mmStr, 10)) ? parseInt(mmStr, 10) : 0));

  // Duty window start + reminder offset
  const dutyStart = new Date(y, m - 1, d, hh, mm, 0, 0);
  return referenceNow.getTime() >= dutyStart.getTime();
}

export interface DutyIcsEventInput {
  id?: string;
  weekLabel: string;
  startDate: string;
  endDate: string;
  teachersText: string;
}

function escapeIcsText(raw: string): string {
  return String(raw || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function computeReminderDateForWeek(
  weekStartIso: string,
  reminderDay: number,
  hh: number,
  mm: number
): Date {
  const [y, m, d] = weekStartIso.split('-').map(Number);
  const start = new Date(y, m - 1, d, hh, mm, 0, 0);
  const normalizedDay = ((Number(reminderDay) || 0) % 7 + 7) % 7;
  const startDay = start.getDay();
  // Match Sunday (0) right before Monday duty start (-1 day), or matching day within that duty week
  let delta = normalizedDay - startDay;
  if (delta < -1) delta += 7;
  if (delta > 5) delta -= 7;
  const target = new Date(start);
  target.setDate(start.getDate() + delta);
  target.setHours(hh, mm, 0, 0);
  return target;
}

export function buildDutyCalendarIcs(options: {
  reminderDay?: number;
  reminderTime?: string;
  weekLabel?: string;
  teachersText?: string;
  events?: DutyIcsEventInput[];
}): string {
  const {
    reminderDay = 0,
    reminderTime = '08:00',
    weekLabel = 'Weekly Teacher Duty',
    teachersText = 'Teachers on Duty',
    events = []
  } = options;

  const dayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const normalizedDay = ((Number(reminderDay) || 0) % 7 + 7) % 7;
  const targetDayCode = dayCodes[normalizedDay] || 'SU';
  const [hhStr, mmStr] = (reminderTime || '08:00').split(':');
  const hh = Math.max(0, Math.min(23, Number.isFinite(parseInt(hhStr, 10)) ? parseInt(hhStr, 10) : 8));
  const mm = Math.max(0, Math.min(59, Number.isFinite(parseInt(mmStr, 10)) ? parseInt(mmStr, 10) : 0));

  const pad = (n: number) => String(n).padStart(2, '0');
  const formatLocalIcs = (dt: Date) =>
    `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OLAG SHS Xtreme//Duty Reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:OLAG SHS Duty Reminders'
  ];

  const validWeekEvents = events.filter(
    e => /^\d{4}-\d{2}-\d{2}$/.test(e.startDate || '')
  );

  if (validWeekEvents.length > 0) {
    validWeekEvents.forEach((ev, idx) => {
      const startDt = computeReminderDateForWeek(ev.startDate, normalizedDay, hh, mm);
      const endDt = new Date(startDt.getTime() + 15 * 60 * 1000);
      const summary = escapeIcsText(`Send ${ev.weekLabel} Duty Announcement`);
      const desc = escapeIcsText(
        `Open Xtreme to copy & send the formatted WhatsApp announcement for ${ev.weekLabel} (${ev.startDate} to ${ev.endDate}).\n\nOn Duty: ${ev.teachersText}`
      );
      const uid = `xtreme-duty-${(ev.id || `${ev.startDate}-${idx}`).replace(/[^a-zA-Z0-9_-]/g, '')}@olagshs.app`;

      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${formatLocalIcs(startDt)}`,
        `DTEND:${formatLocalIcs(endDt)}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${desc}`,
        'STATUS:CONFIRMED',
        'BEGIN:VALARM',
        'TRIGGER:-PT0M',
        'ACTION:DISPLAY',
        `DESCRIPTION:${summary}`,
        'END:VALARM',
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        `DESCRIPTION:Upcoming in 15 mins: ${summary}`,
        'END:VALARM',
        'END:VEVENT'
      );
    });
  } else {
    const next = getNextReminderDate(normalizedDay, reminderTime);
    const endDt = new Date(next.getTime() + 15 * 60 * 1000);
    const summary = escapeIcsText(`Send ${weekLabel} Duty Announcement`);
    const desc = escapeIcsText(
      `Open Xtreme to copy & send this week's teacher duty message on WhatsApp.\n\nTeam: ${teachersText}`
    );

    lines.push(
      'BEGIN:VEVENT',
      `UID:xtreme-duty-weekly-${targetDayCode}@olagshs.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatLocalIcs(next)}`,
      `DTEND:${formatLocalIcs(endDt)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${targetDayCode}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT0M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${summary}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      `DESCRIPTION:Upcoming in 15 mins: ${summary}`,
      'END:VALARM',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadDutyCalendarAlarm(
  reminderDay: number = 0,
  reminderTime: string = '08:00',
  weekLabel: string = 'Weekly Teacher Duty',
  teachersText: string = 'Teachers on Duty',
  events?: DutyIcsEventInput[]
): void {
  if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
    const params = new URLSearchParams({
      day: String(reminderDay ?? 0),
      time: reminderTime || '08:00',
      week: weekLabel || 'Weekly Teacher Duty',
      teachers: teachersText || 'Teachers on Duty'
    });
    if (events && events.length > 0) {
      params.set(
        'events',
        JSON.stringify(events.slice(0, 8))
      );
    }
    const serverUrl = `${window.location.origin}/api/duty/calendar.ics?${params.toString()}`;
    if (isIOSDevice()) {
      // iOS Safari & Standalone PWAs open Apple Calendar's native "Add Events" sheet directly on text/calendar URLs
      window.location.assign(serverUrl);
      return;
    }
    const link = document.createElement('a');
    link.href = serverUrl;
    link.download = 'xtreme-duty-reminders.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  // Offline / non-HTTP fallback
  const icsContent = buildDutyCalendarIcs({
    reminderDay,
    reminderTime,
    weekLabel,
    teachersText,
    events
  });
  if (typeof document === 'undefined') return;
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'xtreme-duty-reminders.ics';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function isTodayReminderDay(targetDay: number = 0, referenceNow: Date = new Date()): boolean {
  const normalizedDay = ((Number(targetDay) || 0) % 7 + 7) % 7;
  return referenceNow.getDay() === normalizedDay;
}

export function hasReminderTimePassed(timeStr: string = '08:00', referenceNow: Date = new Date()): boolean {
  const [hoursStr, minutesStr] = (timeStr || '08:00').split(':');
  const hours = Number.isFinite(parseInt(hoursStr, 10)) ? parseInt(hoursStr, 10) : 8;
  const minutes = Number.isFinite(parseInt(minutesStr, 10)) ? parseInt(minutesStr, 10) : 0;
  const currentMinutes = referenceNow.getHours() * 60 + referenceNow.getMinutes();
  const targetMinutes = hours * 60 + minutes;
  return currentMinutes >= targetMinutes;
}
