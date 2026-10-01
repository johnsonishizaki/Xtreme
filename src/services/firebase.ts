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
  updatedAt: new Date().toISOString()
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

// Local storage fallback keys for high resilience offline
const LOCAL_STORAGE_KEYS = {
  SETTINGS: 'xtreme_duty_settings',
  ROSTERS: 'xtreme_duty_rosters',
  ASSIGNMENTS: 'xtreme_duty_assignments',
  HISTORY: 'xtreme_duty_history'
};

// --- SETTINGS ---

export async function getSettings(): Promise<AppSettings> {
  try {
    const docRef = doc(db, 'settings', 'main');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as AppSettings;
      localStorage.setItem(LOCAL_STORAGE_KEYS.SETTINGS, JSON.stringify(data));
      return data;
    }
    // initialize default
    await saveSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  } catch (err) {
    console.warn('Firestore getSettings fallback to local storage', err);
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.SETTINGS);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const updated: AppSettings = { ...settings, updatedAt: new Date().toISOString() };
  localStorage.setItem(LOCAL_STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
  try {
    const docRef = doc(db, 'settings', 'main');
    await setDoc(docRef, updated, { merge: true });
  } catch (err) {
    console.warn('Firestore saveSettings fallback to local storage only', err);
  }
}

// --- ROSTERS ---

export async function getRosters(): Promise<Roster[]> {
  try {
    const rostersCol = collection(db, 'rosters');
    const q = query(rostersCol, orderBy('uploadedAt', 'desc'));
    const snap = await getDocs(q);
    const rosters: Roster[] = [];
    snap.forEach((d) => rosters.push(d.data() as Roster));
    if (rosters.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.ROSTERS, JSON.stringify(rosters));
      return rosters;
    }
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.ROSTERS);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return [];
  } catch (err) {
    console.warn('Firestore getRosters fallback to local storage', err);
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.ROSTERS);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    return [];
  }
}

function cleanDoc<T>(obj: T): any {
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
  console.log(`[RosterSave:Firestore] Starting persistence for roster "${roster.name}" (${roster.id}) with ${assignments.length} assignments.`);

  // Update local cache first
  const cachedRosters = await getRosters();
  const filteredRosters = cachedRosters.map(r => ({ ...r, isActive: false }));
  localStorage.setItem(LOCAL_STORAGE_KEYS.ROSTERS, JSON.stringify([roster, ...filteredRosters]));

  const cachedAssignments = (await getDutyAssignments()).filter(a => a.rosterId !== roster.id);
  localStorage.setItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify([...assignments, ...cachedAssignments]));
  console.log('[RosterSave:Firestore] Local cache synchronized.');

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
  try {
    const assignCol = collection(db, 'dutyAssignments');
    const q = query(assignCol, orderBy('startDate', 'asc'));
    const snap = await getDocs(q);
    const assignments: DutyAssignment[] = [];
    snap.forEach((d) => assignments.push(d.data() as DutyAssignment));
    if (assignments.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
      return assignments;
    }
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return [];
  } catch (err) {
    console.warn('Firestore getDutyAssignments fallback', err);
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    return [];
  }
}

export async function updateDutyAssignment(assignment: DutyAssignment): Promise<void> {
  const cached = await getDutyAssignments();
  const updated = cached.map(a => a.id === assignment.id ? assignment : a);
  localStorage.setItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(updated));

  try {
    const docRef = doc(db, 'dutyAssignments', assignment.id);
    await setDoc(docRef, assignment, { merge: true });
  } catch (err) {
    console.warn('Firestore updateDutyAssignment fallback', err);
  }
}

// --- SEND HISTORY ---

export async function getSendHistory(): Promise<SendHistory[]> {
  try {
    const col = collection(db, 'sendHistory');
    const q = query(col, orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    const history: SendHistory[] = [];
    snap.forEach(d => history.push(d.data() as SendHistory));
    if (history.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.HISTORY, JSON.stringify(history));
    }
    return history;
  } catch (err) {
    console.warn('Firestore getSendHistory fallback', err);
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.HISTORY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
    return [];
  }
}

export async function recordSendHistory(item: SendHistory): Promise<void> {
  const cached = await getSendHistory();
  localStorage.setItem(LOCAL_STORAGE_KEYS.HISTORY, JSON.stringify([item, ...cached]));

  try {
    const docRef = doc(db, 'sendHistory', item.id);
    await setDoc(docRef, item);
  } catch (err) {
    console.warn('Firestore recordSendHistory fallback', err);
  }
}
