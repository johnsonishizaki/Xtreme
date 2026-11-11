export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionState;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch (err) {
    console.error('Failed to request notification permission:', err);
    return 'denied';
  }
}

/**
 * Plays a crisp, pleasant audio chime using Web Audio API (zero audio file dependencies)
 */
export function playNotificationChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.18, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.35);

    // Tone 2: 880.00 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, ctx.currentTime + 0.12);
    gain2.gain.setValueAtTime(0.22, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.55);
  } catch (e) {
    // Audio context may be restricted by autoplay policy until user gesture
  }
}

/**
 * Maxed-out Push Notification with sound, vibration, and service worker action buttons
 */
export async function sendLocalNotification(
  title: string = '🔔 Duty Reminder',
  options?: NotificationOptions & { playSound?: boolean }
): Promise<boolean> {
  if (options?.playSound !== false) {
    playNotificationChime();
  }

  const perm = getNotificationPermission();
  if (perm !== 'granted') {
    return false;
  }

  const defaultOptions: any = {
    body: 'Your teacher-duty announcement is ready. Tap to review and send it.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'xtreme-duty-reminder',
    vibrate: [200, 100, 200, 100, 300],
    requireInteraction: true,
    data: { url: '/' }
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

/**
 * Checks and triggers duty reminders repeatedly until the user has marked it done for the week.
 */
export async function checkAndTriggerDutyAlert(
  weekId: string,
  weekLabel: string,
  teachersList: string,
  isMarkedDone: boolean
): Promise<boolean> {
  if (isMarkedDone) {
    return false;
  }

  const storageKey = `xtreme_duty_alert_last_${weekId}`;
  const lastAlertTime = parseInt(localStorage.getItem(storageKey) || '0', 10);
  const now = Date.now();
  // Remind on app launch and at least every 45 minutes until marked done
  const minIntervalMs = 45 * 60 * 1000;

  if (now - lastAlertTime > minIntervalMs) {
    localStorage.setItem(storageKey, String(now));
    return await sendLocalNotification(`⚠️ Action Required: Send Duty Reminder (${weekLabel})`, {
      body: `Teachers on duty: ${teachersList}. Tap to send this week's reminder via WhatsApp.`,
      tag: `duty-pending-${weekId}`,
      requireInteraction: true
    });
  }

  return false;
}

export function isTodayReminderDay(targetDay: number = 0): boolean {
  const today = new Date().getDay();
  return today === targetDay;
}

export function hasReminderTimePassed(timeStr: string = '08:00'): boolean {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = hours * 60 + minutes;
  return currentMinutes >= targetMinutes;
}
