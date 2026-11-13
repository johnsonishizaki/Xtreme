import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import type webPushTypes from 'web-push';
const require = createRequire(import.meta.url);
const webPush: typeof webPushTypes = require('web-push');
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig as any);
const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || '(default)');

const VAPID_FILE_PATH = path.resolve(process.cwd(), '.push-config.json');
const SUBS_FILE_PATH = path.resolve(process.cwd(), '.push-subscriptions.json');
const DUTY_STATE_FILE_PATH = path.resolve(process.cwd(), '.push-duty-state.json');

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface StoredPushSubscription {
  id: string;
  subscription: webPushTypes.PushSubscription;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DutyPushState {
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
  updatedAt: string;
}

function hashEndpoint(endpoint: string): string {
  return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24);
}

class WebPushNotificationService {
  private vapidKeys: VapidKeys | null = null;
  private subscriptions: Map<string, StoredPushSubscription> = new Map();
  private dutyState: DutyPushState | null = null;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private lastScheduledPushAt: number = 0;
  private isLoaded: boolean = false;

  private ensureVapidKeys(): VapidKeys {
    if (this.vapidKeys) return this.vapidKeys;

    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      this.vapidKeys = {
        publicKey: process.env.VAPID_PUBLIC_KEY.trim(),
        privateKey: process.env.VAPID_PRIVATE_KEY.trim()
      };
    } else if (fs.existsSync(VAPID_FILE_PATH)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(VAPID_FILE_PATH, 'utf-8'));
        if (parsed?.publicKey && parsed?.privateKey) {
          this.vapidKeys = parsed;
        }
      } catch {}
    }

    if (!this.vapidKeys) {
      const generated = webPush.generateVAPIDKeys();
      this.vapidKeys = {
        publicKey: generated.publicKey,
        privateKey: generated.privateKey
      };
      try {
        fs.writeFileSync(VAPID_FILE_PATH, JSON.stringify(this.vapidKeys, null, 2), {
          encoding: 'utf-8',
          mode: 0o600
        });
      } catch (err) {
        console.warn('[PushService] Could not persist .push-config.json:', err);
      }
    }

    webPush.setVapidDetails(
      'mailto:senior-houseparent@olagshs.app',
      this.vapidKeys.publicKey,
      this.vapidKeys.privateKey
    );

    return this.vapidKeys;
  }

  private async loadPersistedState(): Promise<void> {
    if (this.isLoaded) return;
    this.isLoaded = true;
    this.ensureVapidKeys();

    // Load subscriptions from local file first
    try {
      if (fs.existsSync(SUBS_FILE_PATH)) {
        const arr = JSON.parse(fs.readFileSync(SUBS_FILE_PATH, 'utf-8'));
        if (Array.isArray(arr)) {
          arr.forEach((item: StoredPushSubscription) => {
            if (item?.id && item?.subscription?.endpoint) {
              this.subscriptions.set(item.id, item);
            }
          });
        }
      }
    } catch {}

    // Load duty state from local file
    try {
      if (fs.existsSync(DUTY_STATE_FILE_PATH)) {
        this.dutyState = JSON.parse(fs.readFileSync(DUTY_STATE_FILE_PATH, 'utf-8'));
      }
    } catch {}

    // Hydrate from Firestore cleanly
    try {
      const subsSnap = await getDocs(collection(db, 'notificationSubscriptions'));
      subsSnap.forEach(d => {
        const item = d.data() as StoredPushSubscription;
        if (item?.id && item?.subscription?.endpoint) {
          this.subscriptions.set(item.id, item);
        }
      });
    } catch {}

    try {
      const stateSnap = await getDoc(doc(db, 'pushConfig', 'dutyState'));
      if (stateSnap.exists()) {
        const remote = stateSnap.data() as DutyPushState;
        if (!this.dutyState || (remote.updatedAt && remote.updatedAt > this.dutyState.updatedAt)) {
          this.dutyState = remote;
        }
      }
    } catch {}
  }

  private saveLocalSubscriptions(): void {
    try {
      fs.writeFileSync(
        SUBS_FILE_PATH,
        JSON.stringify(Array.from(this.subscriptions.values()), null, 2),
        { encoding: 'utf-8', mode: 0o600 }
      );
    } catch {}
  }

  private saveLocalDutyState(): void {
    if (!this.dutyState) return;
    try {
      fs.writeFileSync(DUTY_STATE_FILE_PATH, JSON.stringify(this.dutyState, null, 2), {
        encoding: 'utf-8',
        mode: 0o600
      });
    } catch {}
  }

  public getPublicKey(): string {
    return this.ensureVapidKeys().publicKey;
  }

  public getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  public async registerSubscription(
    sub: webPushTypes.PushSubscription,
    userAgent?: string,
    sendWelcome: boolean = false
  ): Promise<{ id: string; totalSubscribers: number }> {
    await this.loadPersistedState();
    const id = hashEndpoint(sub.endpoint);
    const now = new Date().toISOString();
    const record: StoredPushSubscription = {
      id,
      subscription: sub,
      userAgent: userAgent || 'unknown',
      createdAt: this.subscriptions.get(id)?.createdAt || now,
      updatedAt: now
    };

    this.subscriptions.set(id, record);
    this.saveLocalSubscriptions();

    setDoc(doc(db, 'notificationSubscriptions', id), record, { merge: true }).catch(() => {});

    if (sendWelcome) {
      await this.sendPayloadToSubscription(record, {
        title: '🔔 Xtreme iPhone Lock-Screen Push Ready',
        body: 'You will now receive persistent alerts on your Lock Screen whenever weekly teacher duty or attendance needs action.',
        url: '/?tab=duty',
        tag: 'xtreme-push-welcome',
        badgeCount: this.dutyState && !this.dutyState.isAlreadySent ? Math.max(1, this.dutyState.badgeCount) : 0
      });
    }

    return { id, totalSubscribers: this.subscriptions.size };
  }

  public async removeSubscription(endpoint: string): Promise<void> {
    await this.loadPersistedState();
    const id = hashEndpoint(endpoint);
    this.subscriptions.delete(id);
    this.saveLocalSubscriptions();
    deleteDoc(doc(db, 'notificationSubscriptions', id)).catch(() => {});
  }

  public async syncDutyState(incoming: Partial<DutyPushState>): Promise<DutyPushState> {
    await this.loadPersistedState();
    const prev = this.dutyState;
    this.dutyState = {
      assignmentId: incoming.assignmentId ?? prev?.assignmentId ?? '',
      weekLabel: incoming.weekLabel ?? prev?.weekLabel ?? 'This Week',
      teachersText: incoming.teachersText ?? prev?.teachersText ?? 'Teachers on Duty',
      dutyPeriod: incoming.dutyPeriod ?? prev?.dutyPeriod ?? '',
      message: incoming.message ?? prev?.message ?? '',
      isAlreadySent: incoming.isAlreadySent ?? prev?.isAlreadySent ?? false,
      reminderEnabled: incoming.reminderEnabled ?? prev?.reminderEnabled ?? true,
      reminderDay: incoming.reminderDay ?? prev?.reminderDay ?? 0,
      reminderTime: incoming.reminderTime ?? prev?.reminderTime ?? '08:00',
      badgeCount: incoming.badgeCount ?? prev?.badgeCount ?? 0,
      updatedAt: new Date().toISOString()
    };

    this.saveLocalDutyState();
    setDoc(doc(db, 'pushConfig', 'dutyState'), this.dutyState, { merge: true }).catch(() => {});
    return this.dutyState;
  }

  public async markDutyDoneFromPush(): Promise<{ success: boolean; weekLabel?: string }> {
    await this.loadPersistedState();
    if (!this.dutyState || !this.dutyState.assignmentId) {
      return { success: false };
    }

    this.dutyState = {
      ...this.dutyState,
      isAlreadySent: true,
      badgeCount: Math.max(0, (this.dutyState.badgeCount || 1) - 1),
      updatedAt: new Date().toISOString()
    };
    this.saveLocalDutyState();
    setDoc(doc(db, 'pushConfig', 'dutyState'), this.dutyState, { merge: true }).catch(() => {});

    // Persist confirmed send history in Firestore so app syncs automatically
    const historyItem = {
      id: `sent-push-${Date.now()}`,
      assignmentId: this.dutyState.assignmentId,
      weekLabel: this.dutyState.weekLabel,
      dutyPeriod: this.dutyState.dutyPeriod || '',
      message: this.dutyState.message || `Confirmed from notification for ${this.dutyState.weekLabel}`,
      timestamp: new Date().toISOString(),
      status: 'sent_confirmed'
    };
    await setDoc(doc(db, 'sendHistory', historyItem.id), historyItem).catch(() => {});

    return { success: true, weekLabel: this.dutyState.weekLabel };
  }

  private async sendPayloadToSubscription(
    record: StoredPushSubscription,
    payload: {
      title: string;
      body: string;
      url?: string;
      tag?: string;
      badgeCount?: number;
      assignmentId?: string;
    }
  ): Promise<boolean> {
    this.ensureVapidKeys();
    try {
      await webPush.sendNotification(
        record.subscription,
        JSON.stringify(payload),
        {
          TTL: 120,
          urgency: 'high'
        }
      );
      return true;
    } catch (err: any) {
      const statusCode = err?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        this.subscriptions.delete(record.id);
        this.saveLocalSubscriptions();
        deleteDoc(doc(db, 'notificationSubscriptions', record.id)).catch(() => {});
      } else {
        console.warn(`[PushService] Delivery error (${statusCode || 'unknown'}):`, err?.message || err);
      }
      return false;
    }
  }

  public async broadcastPush(payload: {
    title: string;
    body: string;
    url?: string;
    tag?: string;
    badgeCount?: number;
    assignmentId?: string;
  }): Promise<{ attempted: number; delivered: number }> {
    await this.loadPersistedState();
    const list = Array.from(this.subscriptions.values());
    if (list.length === 0) {
      return { attempted: 0, delivered: 0 };
    }

    let delivered = 0;
    await Promise.all(
      list.map(async (rec) => {
        const ok = await this.sendPayloadToSubscription(rec, payload);
        if (ok) delivered++;
      })
    );
    return { attempted: list.length, delivered };
  }

  public async sendHouseReportArrivalPush(
    houseName: string,
    reportedCount: number,
    expectedCount: number
  ): Promise<void> {
    await this.broadcastPush({
      title: `✅ ${houseName} Submitted Attendance`,
      body: `${reportedCount}/${expectedCount} students reported. Open Xtreme to view school totals.`,
      url: '/',
      tag: `house-report-${Date.now()}`,
      badgeCount: this.dutyState?.badgeCount
    });
  }

  public async sendTestDutyPush(): Promise<{ attempted: number; delivered: number }> {
    await this.loadPersistedState();
    const weekLabel = this.dutyState?.weekLabel || 'This Week';
    const teachers = this.dutyState?.teachersText || 'Teachers on Duty';
    return await this.broadcastPush({
      title: `⚠️ URGENT: Send ${weekLabel} Duty`,
      body: `On Duty: ${teachers}. Tap to open WhatsApp or Mark Done.`,
      url: '/?tab=duty',
      tag: `xtreme-urgent-test-${Date.now()}`,
      badgeCount: Math.max(1, this.dutyState?.badgeCount || 1),
      assignmentId: this.dutyState?.assignmentId
    });
  }

  /**
   * Background Watchdog: runs continuously on server even when iPhone screen is locked & PWA is closed.
   * Sends persistent APNs push every 60s on/after scheduled reminder day while pending!
   */
  public startScheduler(): void {
    this.ensureVapidKeys();
    this.loadPersistedState().catch(() => {});

    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
    }

    this.schedulerTimer = setInterval(async () => {
      try {
        await this.loadPersistedState();
        const state = this.dutyState;
        if (!state || state.isAlreadySent || !state.assignmentId || this.subscriptions.size === 0) {
          return;
        }
        if (!state.reminderEnabled) return;

        const now = new Date();
        const todayDay = now.getDay();
        const [targetHour, targetMin] = (state.reminderTime || '08:00').split(':').map(Number);
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const targetMins = (targetHour || 8) * 60 + (targetMin || 0);

        // Fire when on reminder day >= target time, or if pending any time after schedule has elapsed (>= 60s spacing)
        const isReminderWindow = todayDay === state.reminderDay && nowMins >= targetMins;
        if (!isReminderWindow) return;

        if (Date.now() - this.lastScheduledPushAt < 60 * 1000) {
          return;
        }

        this.lastScheduledPushAt = Date.now();
        await this.broadcastPush({
          title: `⚠️ SEND DUTY NOW (${state.weekLabel})`,
          body: `On Duty: ${state.teachersText}. Tap to send via WhatsApp or Mark Done.`,
          url: '/?tab=duty',
          tag: `xtreme-duty-due-${state.assignmentId}`,
          badgeCount: Math.max(1, state.badgeCount || 1),
          assignmentId: state.assignmentId
        });
      } catch (err) {
        console.warn('[PushService] Scheduler cycle warning:', err);
      }
    }, 30 * 1000);
  }
}

export const pushService = new WebPushNotificationService();
