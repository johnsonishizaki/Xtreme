import { AppSettings } from '../types';

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

export async function sendLocalNotification(
  title: string = '🔔 Weekly Duty Reminder',
  options?: NotificationOptions
): Promise<boolean> {
  const perm = getNotificationPermission();
  if (perm !== 'granted') {
    return false;
  }

  try {
    // If service worker registration is available, use showNotification
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, {
          body: 'Your teacher-duty announcement is ready. Tap to review and send it.',
          icon: '/assets/icon-192.png',
          badge: '/assets/icon-192.png',
          tag: 'duty-reminder',
          data: { url: '/' },
          ...options
        });
        return true;
      }
    }

    // Fallback to standard window Notification
    new Notification(title, {
      body: 'Your teacher-duty announcement is ready. Tap to review and send it.',
      icon: '/assets/icon-192.png',
      ...options
    });
    return true;
  } catch (err) {
    console.warn('Failed to fire local notification:', err);
    return false;
  }
}

/**
 * Checks if today is the scheduled reminder day (0 = Sunday, 1 = Monday, etc.)
 */
export function isTodayReminderDay(targetDay: number = 0): boolean {
  const today = new Date().getDay();
  return today === targetDay;
}

/**
 * Checks if the configured reminder time has arrived or passed today
 */
export function hasReminderTimePassed(timeStr: string = '08:00'): boolean {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = hours * 60 + minutes;
  return currentMinutes >= targetMinutes;
}
