import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { AppSettings, DutyAssignment, Roster, SendHistory } from '../types';

export const DEFAULT_TEMPLATE = `Good evening, teachers.

Please be reminded that the following teacher(s) are on duty for the coming week:

{TEACHERS}

Duty period: {START_DATE} - {END_DATE}

Kindly take note and make the necessary preparations.

Thank you.`;

export const DEFAULT_SETTINGS: AppSettings = {
  reminderEnabled: true,
  reminderDay: 0, // Sunday
  reminderTime: '08:00',
  messageTemplate: DEFAULT_TEMPLATE,
  whatsAppBehavior: 'app',
  targetGroupHint: 'Teachers Staff Group',
  theme: 'dark',
  updatedAt: new Date().toISOString()
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || '(default)');
export const auth = getAuth(app);

// Local storage fallback keys for high resilience offline
export const LOCAL_STORAGE_KEYS = {
  SETTINGS: 'xtreme_duty_settings',
  ROSTERS: 'xtreme_duty_rosters',
  ASSIGNMENTS: 'xtreme_duty_assignments',
  HISTORY: 'xtreme_duty_history'
};

// Synchronous fast-path cache accessors for instant (0ms) app startup
export function getCachedSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.SETTINGS);
    if (cached) return JSON.parse(cached);
  } catch {}
  return DEFAULT_SETTINGS;
}

export function getCachedRosters(): Roster[] {
  if (typeof window === 'undefined') return [];
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.ROSTERS);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function getCachedDutyAssignments(): DutyAssignment[] {
  if (typeof window === 'undefined') return [];
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function getCachedSendHistory(): SendHistory[] {
  if (typeof window === 'undefined') return [];
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.HISTORY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

// Bounded timeout helper to prevent slow network handshakes from stalling UI updates
function withTimeout<T>(promise: Promise<T>, ms: number = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Network timeout after ${ms}ms`)), ms)
    )
  ]);
}

// Helper to get auth header if user is logged in
async function getAuthHeader(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      return { 'Authorization': `Bearer ${token}` };
    } catch {}
  }
  return {};
}

// --- SETTINGS ---

export async function getSettings(): Promise<AppSettings> {
  const headers = await getAuthHeader();
  const isUserLoggedIn = !!headers.Authorization;

  if (isUserLoggedIn) {
    try {
      const res = await withTimeout(fetch('/api/settings', { headers }), 2500);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          localStorage.setItem(LOCAL_STORAGE_KEYS.SETTINGS, JSON.stringify(data));
          return data;
        }
      }
    } catch (err) {
      console.warn('PostgreSQL getSettings skipped or timed out, checking cache...', err);
    }
  }

  // Fallback to Firestore & LocalStorage
  try {
    const docRef = doc(db, 'settings', 'main');
    const snap = await withTimeout(getDoc(docRef), 2500);
    if (snap.exists()) {
      const data = snap.data() as AppSettings;
      localStorage.setItem(LOCAL_STORAGE_KEYS.SETTINGS, JSON.stringify(data));
      return data;
    }
    // initialize default
    await saveSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  } catch (err) {
    return getCachedSettings();
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const updated: AppSettings = { ...settings, updatedAt: new Date().toISOString() };
  localStorage.setItem(LOCAL_STORAGE_KEYS.SETTINGS, JSON.stringify(updated));

  const headers = await getAuthHeader();
  const isUserLoggedIn = !!headers.Authorization;

  if (isUserLoggedIn) {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify(updated)
      });
      if (res.ok) return;
    } catch (err) {
      console.warn('PostgreSQL saveSettings failed, falling back...', err);
    }
  }

  // Fallback to Firestore
  try {
    const docRef = doc(db, 'settings', 'main');
    await setDoc(docRef, updated, { merge: true });
  } catch (err) {
    console.warn('Firestore saveSettings fallback to local storage only', err);
  }
}

// --- ROSTERS ---

export async function getRosters(): Promise<Roster[]> {
  const headers = await getAuthHeader();
  const isUserLoggedIn = !!headers.Authorization;

  if (isUserLoggedIn) {
    try {
      const res = await withTimeout(fetch('/api/rosters', { headers }), 2500);
      if (res.ok) {
        const rosters = await res.json();
        localStorage.setItem(LOCAL_STORAGE_KEYS.ROSTERS, JSON.stringify(rosters));
        return rosters;
      }
    } catch (err) {
      console.warn('PostgreSQL getRosters skipped or timed out, checking cache...', err);
    }
  }

  // Fallback to Firestore & LocalStorage
  try {
    const rostersCol = collection(db, 'rosters');
    const q = query(rostersCol, orderBy('uploadedAt', 'desc'));
    const snap = await withTimeout(getDocs(q), 2500);
    const rosters: Roster[] = [];
    snap.forEach((d) => rosters.push(d.data() as Roster));
    if (rosters.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.ROSTERS, JSON.stringify(rosters));
      return rosters;
    }
    return getCachedRosters();
  } catch (err) {
    return getCachedRosters();
  }
}

function cleanDoc(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(cleanDoc);
  if (typeof obj === 'object') {
    const res: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        res[k] = cleanDoc(v);
      }
    }
    return res;
  }
  return obj;
}

export async function saveRosterWithAssignments(
  roster: Roster,
  assignments: DutyAssignment[]
): Promise<void> {
  console.log(`[RosterSave:Client] Starting persistence for roster "${roster.name}" (${roster.id}) with ${assignments.length} assignments.`);

  // Update local cache first
  const cachedRosters = await getRosters();
  const filteredRosters = cachedRosters.map(r => ({ ...r, isActive: false }));
  localStorage.setItem(LOCAL_STORAGE_KEYS.ROSTERS, JSON.stringify([roster, ...filteredRosters]));

  const cachedAssignments = (await getDutyAssignments()).filter(a => a.rosterId !== roster.id);
  localStorage.setItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify([...assignments, ...cachedAssignments]));
  console.log('[RosterSave:Client] Local cache synchronized.');

  const headers = await getAuthHeader();
  const isUserLoggedIn = !!headers.Authorization;

  if (isUserLoggedIn) {
    try {
      const res = await fetch('/api/rosters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({ roster, assignments })
      });
      if (res.ok) {
        console.log('[RosterSave:PostgreSQL] Saved successfully to Cloud SQL PostgreSQL.');
        return;
      }
    } catch (err) {
      console.warn('PostgreSQL saveRoster failed, falling back to Firestore...', err);
    }
  }

  // Fallback to Firestore
  try {
    const batch = writeBatch(db);

    // Deactivate previous active rosters in Firestore
    for (const r of cachedRosters) {
      if (r.id !== roster.id && r.isActive) {
        batch.set(doc(db, 'rosters', r.id), { ...r, isActive: false }, { merge: true });
      }
    }

    // Save roster doc
    const rosterRef = doc(db, 'rosters', roster.id);
    batch.set(rosterRef, cleanDoc(roster));

    // Save assignments docs
    for (const assignment of assignments) {
      const assignRef = doc(db, 'dutyAssignments', assignment.id);
      batch.set(assignRef, cleanDoc(assignment));
    }

    console.log('[RosterSave:Firestore] Committing batch write to Firestore...');
    await batch.commit();
    console.log('[RosterSave:Firestore] Batch write committed successfully to Firestore.');
  } catch (err: any) {
    console.error('[RosterSave:Firestore] Batch commit failed:', err);
    throw err;
  }
}

export async function deleteRoster(rosterId: string): Promise<void> {
  console.log(`[RosterDelete] Initiating delete for roster: ${rosterId}`);
  const currentRosters = await getRosters();
  const targetRoster = currentRosters.find(r => r.id === rosterId);
  const wasActive = targetRoster?.isActive ?? false;

  let remainingRosters = currentRosters.filter(r => r.id !== rosterId);

  // If the deleted roster was active and other rosters exist, mark the first one as active
  if (wasActive && remainingRosters.length > 0) {
    remainingRosters = remainingRosters.map((r, idx) => ({
      ...r,
      isActive: idx === 0
    }));
  }

  localStorage.setItem(LOCAL_STORAGE_KEYS.ROSTERS, JSON.stringify(remainingRosters));

  const cachedAssignments = (await getDutyAssignments()).filter(a => a.rosterId !== rosterId);
  localStorage.setItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(cachedAssignments));

  const headers = await getAuthHeader();
  const isUserLoggedIn = !!headers.Authorization;

  if (isUserLoggedIn) {
    try {
      const res = await fetch(`/api/rosters/${rosterId}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        console.log('[RosterDelete:PostgreSQL] Deleted successfully from Cloud SQL.');
        return;
      }
    } catch (err) {
      console.warn('PostgreSQL deleteRoster failed, falling back to Firestore...', err);
    }
  }

  // Fallback to Firestore
  try {
    const batch = writeBatch(db);

    // Delete target roster doc
    batch.delete(doc(db, 'rosters', rosterId));

    // If a new roster is now active, update it in Firestore
    if (wasActive && remainingRosters.length > 0) {
      batch.set(doc(db, 'rosters', remainingRosters[0].id), { isActive: true }, { merge: true });
    }

    // Delete all duty assignments associated with this roster
    const assignmentsSnap = await getDocs(collection(db, 'dutyAssignments'));
    assignmentsSnap.forEach(d => {
      const data = d.data() as DutyAssignment;
      if (data.rosterId === rosterId) {
        batch.delete(d.ref);
      }
    });

    await batch.commit();
    console.log(`[RosterDelete] Successfully deleted roster ${rosterId} and its assignments from Firestore.`);
  } catch (err: any) {
    console.error('[RosterDelete] Error deleting roster:', err);
    throw err;
  }
}

export async function setActiveRoster(rosterId: string): Promise<void> {
  const currentRosters = await getRosters();
  const updatedRosters = currentRosters.map(r => ({
    ...r,
    isActive: r.id === rosterId
  }));

  localStorage.setItem(LOCAL_STORAGE_KEYS.ROSTERS, JSON.stringify(updatedRosters));

  const headers = await getAuthHeader();
  const isUserLoggedIn = !!headers.Authorization;

  if (isUserLoggedIn) {
    try {
      const res = await fetch('/api/rosters/active', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({ rosterId })
      });
      if (res.ok) {
        console.log('[RosterActivate:PostgreSQL] Activated roster successfully in Cloud SQL.');
        return;
      }
    } catch (err) {
      console.warn('PostgreSQL setActiveRoster failed, falling back to Firestore...', err);
    }
  }

  // Fallback to Firestore
  try {
    const batch = writeBatch(db);
    for (const r of updatedRosters) {
      batch.set(doc(db, 'rosters', r.id), { isActive: r.isActive }, { merge: true });
    }
    await batch.commit();
    console.log(`[RosterActivate] Activated roster: ${rosterId}`);
  } catch (err: any) {
    console.error('[RosterActivate] Error activating roster:', err);
    throw err;
  }
}

// --- DUTY ASSIGNMENTS ---

export async function getDutyAssignments(): Promise<DutyAssignment[]> {
  const headers = await getAuthHeader();
  const isUserLoggedIn = !!headers.Authorization;

  if (isUserLoggedIn) {
    try {
      const res = await withTimeout(fetch('/api/assignments', { headers }), 2500);
      if (res.ok) {
        const assignments = await res.json();
        localStorage.setItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
        return assignments;
      }
    } catch (err) {
      console.warn('PostgreSQL getDutyAssignments skipped or timed out, checking cache...', err);
    }
  }

  // Fallback to Firestore & LocalStorage
  try {
    const assignCol = collection(db, 'dutyAssignments');
    const q = query(assignCol, orderBy('startDate', 'asc'));
    const snap = await withTimeout(getDocs(q), 2500);
    const assignments: DutyAssignment[] = [];
    snap.forEach((d) => assignments.push(d.data() as DutyAssignment));
    if (assignments.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
      return assignments;
    }
    return getCachedDutyAssignments();
  } catch (err) {
    return getCachedDutyAssignments();
  }
}

export async function updateDutyAssignment(assignment: DutyAssignment): Promise<void> {
  const cached = await getDutyAssignments();
  const updated = cached.map(a => a.id === assignment.id ? assignment : a);
  localStorage.setItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(updated));

  const headers = await getAuthHeader();
  const isUserLoggedIn = !!headers.Authorization;

  if (isUserLoggedIn) {
    try {
      const res = await fetch('/api/assignments/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({ assignment })
      });
      if (res.ok) {
        console.log('[AssignmentUpdate:PostgreSQL] Updated assignment successfully in Cloud SQL.');
        return;
      }
    } catch (err) {
      console.warn('PostgreSQL updateDutyAssignment failed, falling back...', err);
    }
  }

  // Fallback to Firestore
  try {
    const docRef = doc(db, 'dutyAssignments', assignment.id);
    await setDoc(docRef, assignment, { merge: true });
  } catch (err) {
    console.warn('Firestore updateDutyAssignment fallback', err);
  }
}

// --- SEND HISTORY ---

export async function getSendHistory(): Promise<SendHistory[]> {
  const headers = await getAuthHeader();
  const isUserLoggedIn = !!headers.Authorization;

  if (isUserLoggedIn) {
    try {
      const res = await withTimeout(fetch('/api/send-history', { headers }), 2500);
      if (res.ok) {
        const history = await res.json();
        localStorage.setItem(LOCAL_STORAGE_KEYS.HISTORY, JSON.stringify(history));
        return history;
      }
    } catch (err) {
      console.warn('PostgreSQL getSendHistory skipped or timed out, checking cache...', err);
    }
  }

  // Fallback to Firestore & LocalStorage
  try {
    const col = collection(db, 'sendHistory');
    const q = query(col, orderBy('timestamp', 'desc'));
    const snap = await withTimeout(getDocs(q), 2500);
    const history: SendHistory[] = [];
    snap.forEach(d => history.push(d.data() as SendHistory));
    if (history.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.HISTORY, JSON.stringify(history));
      return history;
    }
    return getCachedSendHistory();
  } catch (err) {
    return getCachedSendHistory();
  }
}

export async function recordSendHistory(item: SendHistory): Promise<void> {
  const cached = await getSendHistory();
  localStorage.setItem(LOCAL_STORAGE_KEYS.HISTORY, JSON.stringify([item, ...cached]));

  const headers = await getAuthHeader();
  const isUserLoggedIn = !!headers.Authorization;

  if (isUserLoggedIn) {
    try {
      const res = await fetch('/api/send-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify(item)
      });
      if (res.ok) {
        console.log('[SendHistory:PostgreSQL] Recorded history successfully in Cloud SQL.');
        return;
      }
    } catch (err) {
      console.warn('PostgreSQL recordSendHistory failed, falling back...', err);
    }
  }

  // Fallback to Firestore
  try {
    const docRef = doc(db, 'sendHistory', item.id);
    await setDoc(docRef, item);
  } catch (err) {
    console.warn('Firestore recordSendHistory fallback', err);
  }
}
