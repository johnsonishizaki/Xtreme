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
import {
  AppSettings,
  DutyAssignment,
  Roster,
  SendHistory,
  HouseConfig,
  AcademicTerm,
  HouseDailyReport,
  DailyCollation
} from '../types';
import {
  DEFAULT_HOUSES,
  DEFAULT_TERM,
  SAMPLE_HOUSE_REPORTS,
  SAMPLE_ROSTER,
  SAMPLE_ASSIGNMENTS
} from './sampleData';

import { DEFAULT_TEMPLATE } from '../constants/template.ts';
export { DEFAULT_TEMPLATE };


export const DEFAULT_SETTINGS: AppSettings = {
  reminderEnabled: true,
  reminderDay: 0, // Sunday
  reminderTime: '08:00',
  messageTemplate: DEFAULT_TEMPLATE,
  whatsAppBehavior: 'app',
  targetGroupHint: 'Teachers Staff Group',
  activeTermId: DEFAULT_TERM.id,
  warningOutstandingThreshold: 1,
  criticalOutstandingRateThreshold: 10,
  theme: 'dark',
  updatedAt: new Date().toISOString()
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || '(default)');
export const auth = getAuth(app);

// Local storage fallback keys for high resilience offline & 0ms initial render
export const LOCAL_STORAGE_KEYS = {
  SETTINGS: 'xtreme_duty_settings',
  ROSTERS: 'xtreme_duty_rosters',
  ASSIGNMENTS: 'xtreme_duty_assignments',
  HISTORY: 'xtreme_duty_history',
  HOUSES: 'xtreme_houses',
  TERMS: 'xtreme_terms',
  HOUSE_REPORTS: 'xtreme_house_reports'
};

// ==========================================
// FAST-PATH CACHE ACCESSORS (0ms INSTANT LOAD)
// ==========================================

export function getCachedSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.SETTINGS);
    if (cached) return JSON.parse(cached);
  } catch {}
  return DEFAULT_SETTINGS;
}

export function getCachedRosters(): Roster[] {
  if (typeof window === 'undefined') return [SAMPLE_ROSTER];
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.ROSTERS);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return Array.from(new Map(parsed.map((r: Roster) => [r.id, r])).values());
      }
    }
  } catch {}
  return [SAMPLE_ROSTER];
}

export function getCachedDutyAssignments(): DutyAssignment[] {
  if (typeof window === 'undefined') return SAMPLE_ASSIGNMENTS;
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return Array.from(new Map(parsed.map((a: DutyAssignment) => [a.id, a])).values());
      }
    }
  } catch {}
  return SAMPLE_ASSIGNMENTS;
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

export function getCachedHouses(): HouseConfig[] {
  if (typeof window === 'undefined') return DEFAULT_HOUSES;
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.HOUSES);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_HOUSES;
}

export function getCachedTerms(): AcademicTerm[] {
  if (typeof window === 'undefined') return [DEFAULT_TERM];
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.TERMS);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [DEFAULT_TERM];
}

export function getCachedHouseReports(): HouseDailyReport[] {
  if (typeof window === 'undefined') return SAMPLE_HOUSE_REPORTS;
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.HOUSE_REPORTS);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return SAMPLE_HOUSE_REPORTS;
}

// Bounded timeout helper
function withTimeout<T>(promise: Promise<T>, ms: number = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Network timeout after ${ms}ms`)), ms)
    )
  ]);
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

// ==========================================
// 1. APP SETTINGS
// ==========================================

export async function getSettings(): Promise<AppSettings> {
  try {
    const docRef = doc(db, 'settings', 'main');
    const snap = await withTimeout(getDoc(docRef), 2500);
    if (snap.exists()) {
      const data = snap.data() as AppSettings;
      localStorage.setItem(LOCAL_STORAGE_KEYS.SETTINGS, JSON.stringify(data));
      return data;
    }
    await saveSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  } catch (err) {
    return getCachedSettings();
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const updated: AppSettings = { ...settings, updatedAt: new Date().toISOString() };
  localStorage.setItem(LOCAL_STORAGE_KEYS.SETTINGS, JSON.stringify(updated));

  try {
    const docRef = doc(db, 'settings', 'main');
    await setDoc(docRef, cleanDoc(updated), { merge: true });
  } catch (err) {
    console.warn('Firestore saveSettings fallback to local storage only', err);
  }
}

// ==========================================
// 2. 8 HOUSES MANAGEMENT
// ==========================================

export async function getHouses(): Promise<HouseConfig[]> {
  try {
    const colRef = collection(db, 'houses');
    const snap = await withTimeout(getDocs(colRef), 2500);
    const houses: HouseConfig[] = [];
    snap.forEach(d => houses.push(d.data() as HouseConfig));
    if (houses.length > 0) {
      houses.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
      localStorage.setItem(LOCAL_STORAGE_KEYS.HOUSES, JSON.stringify(houses));
      return houses;
    }
    // Seed default houses if none exist
    await saveHouses(DEFAULT_HOUSES);
    return DEFAULT_HOUSES;
  } catch (err) {
    return getCachedHouses();
  }
}

export async function saveHouses(houses: HouseConfig[]): Promise<void> {
  localStorage.setItem(LOCAL_STORAGE_KEYS.HOUSES, JSON.stringify(houses));
  try {
    const batch = writeBatch(db);
    for (const h of houses) {
      batch.set(doc(db, 'houses', h.id), cleanDoc(h), { merge: true });
    }
    await batch.commit();
  } catch (err) {
    console.warn('Firestore saveHouses fallback to local storage:', err);
  }
}

export async function saveHouse(house: HouseConfig): Promise<void> {
  const current = getCachedHouses();
  const updated = current.map(h => (h.id === house.id ? house : h));
  await saveHouses(updated);
}

// ==========================================
// 3. ACADEMIC TERMS MANAGEMENT
// ==========================================

export async function getTerms(): Promise<AcademicTerm[]> {
  try {
    const colRef = collection(db, 'terms');
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snap = await withTimeout(getDocs(q), 2500);
    const terms: AcademicTerm[] = [];
    snap.forEach(d => terms.push(d.data() as AcademicTerm));
    if (terms.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.TERMS, JSON.stringify(terms));
      return terms;
    }
    await saveTerm(DEFAULT_TERM);
    return [DEFAULT_TERM];
  } catch (err) {
    return getCachedTerms();
  }
}

export async function saveTerm(term: AcademicTerm): Promise<void> {
  const current = getCachedTerms();
  const exists = current.some(t => t.id === term.id);
  const updatedList = exists
    ? current.map(t => (t.id === term.id ? term : t))
    : [term, ...current];

  localStorage.setItem(LOCAL_STORAGE_KEYS.TERMS, JSON.stringify(updatedList));

  try {
    await setDoc(doc(db, 'terms', term.id), cleanDoc(term), { merge: true });
  } catch (err) {
    console.warn('Firestore saveTerm fallback to local storage:', err);
  }
}

// Close term reporting period (does NOT delete data)
export async function setTermStatus(termId: string, status: 'open' | 'closed'): Promise<void> {
  const current = getCachedTerms();
  const target = current.find(t => t.id === termId);
  if (!target) return;
  const updated: AcademicTerm = { ...target, status, updatedAt: new Date().toISOString() };
  await saveTerm(updated);
}

// ==========================================
// 4. HOUSE DAILY REPORTING & COLLATION
// ==========================================

export async function getHouseReports(): Promise<HouseDailyReport[]> {
  try {
    const colRef = collection(db, 'houseReports');
    const q = query(colRef, orderBy('reportingDate', 'desc'));
    const snap = await withTimeout(getDocs(q), 2500);
    const reports: HouseDailyReport[] = [];
    snap.forEach(d => reports.push(d.data() as HouseDailyReport));
    if (reports.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.HOUSE_REPORTS, JSON.stringify(reports));
      return reports;
    }
    // Seed initial reports if empty
    for (const rep of SAMPLE_HOUSE_REPORTS) {
      await saveHouseReport(rep);
    }
    return SAMPLE_HOUSE_REPORTS;
  } catch (err) {
    return getCachedHouseReports();
  }
}

/**
 * Saves a daily house report with strict mathematical validation and duplicate protection.
 * Logical identifier: reportingDate + '_' + houseId
 */
export async function saveHouseReport(report: HouseDailyReport): Promise<void> {
  // Validate numbers
  const expected = Math.max(0, Number(report.expectedCount) || 0);
  let reported = Math.max(0, Number(report.reportedCount) || 0);

  if (reported > expected) {
    throw new Error(`Reported count (${reported}) cannot exceed expected student count (${expected}).`);
  }

  const notReported = Math.max(0, expected - reported);

  const cleanReport: HouseDailyReport = {
    ...report,
    id: `${report.reportingDate}_${report.houseId}`,
    expectedCount: expected,
    reportedCount: reported,
    notReportedCount: notReported,
    updatedAt: new Date().toISOString()
  };

  // Update local cache first (replace duplicate reportingDate + houseId)
  const cached = getCachedHouseReports();
  const filtered = cached.filter(r => r.id !== cleanReport.id);
  const updatedList = [cleanReport, ...filtered];
  localStorage.setItem(LOCAL_STORAGE_KEYS.HOUSE_REPORTS, JSON.stringify(updatedList));

  // Sync to Firestore
  try {
    await setDoc(doc(db, 'houseReports', cleanReport.id), cleanDoc(cleanReport), { merge: true });
  } catch (err) {
    console.warn('Firestore saveHouseReport fallback to local storage:', err);
  }
}

/**
 * Calculates complete daily collation for a specified date and term.
 * All arithmetic done deterministically in code (NEVER with AI).
 */
export function collateDailyReports(
  reports: HouseDailyReport[],
  houses: HouseConfig[],
  reportingDate: string,
  termId: string
): DailyCollation {
  const activeHouses = houses.filter(h => h.active);
  const dateReports = reports.filter(r => r.reportingDate === reportingDate && r.termId === termId);

  let totalExpected = 0;
  let totalReported = 0;
  let boysExpected = 0;
  let boysReported = 0;
  let girlsExpected = 0;
  let girlsReported = 0;
  let followUpHousesCount = 0;
  const missingHouseIds: string[] = [];

  for (const house of activeHouses) {
    totalExpected += house.expectedStudentCount;
    if (house.category === 'Boys') {
      boysExpected += house.expectedStudentCount;
    } else {
      girlsExpected += house.expectedStudentCount;
    }

    const report = dateReports.find(r => r.houseId === house.id);
    if (report) {
      totalReported += report.reportedCount;
      if (house.category === 'Boys') {
        boysReported += report.reportedCount;
      } else {
        girlsReported += report.reportedCount;
      }
      if (report.notReportedCount > 0 || (report.notReportedDetails && report.notReportedDetails.trim())) {
        followUpHousesCount++;
      }
    } else {
      missingHouseIds.push(house.id);
    }
  }

  const totalNotReported = Math.max(0, totalExpected - totalReported);
  const reportingPercentage = totalExpected > 0 ? Number(((totalReported / totalExpected) * 100).toFixed(1)) : 0;

  const boysNotReported = Math.max(0, boysExpected - boysReported);
  const boysPercentage = boysExpected > 0 ? Number(((boysReported / boysExpected) * 100).toFixed(1)) : 0;

  const girlsNotReported = Math.max(0, girlsExpected - girlsReported);
  const girlsPercentage = girlsExpected > 0 ? Number(((girlsReported / girlsExpected) * 100).toFixed(1)) : 0;

  return {
    reportingDate,
    termId,
    totalExpected,
    totalReported,
    totalNotReported,
    reportingPercentage,
    reportsReceivedCount: dateReports.length,
    totalHousesCount: activeHouses.length,
    boysExpected,
    boysReported,
    boysNotReported,
    boysPercentage,
    girlsExpected,
    girlsReported,
    girlsNotReported,
    girlsPercentage,
    missingHouseIds,
    followUpHousesCount
  };
}

// ==========================================
// 5. TEACHER DUTY MANAGEMENT
// ==========================================

export async function getRosters(): Promise<Roster[]> {
  try {
    const rostersCol = collection(db, 'rosters');
    const q = query(rostersCol, orderBy('uploadedAt', 'desc'));
    const snap = await withTimeout(getDocs(q), 2500);
    const rosters: Roster[] = [];
    snap.forEach(d => rosters.push(d.data() as Roster));
    if (rosters.length > 0) {
      const unique = Array.from(new Map(rosters.map(r => [r.id, r])).values());
      localStorage.setItem(LOCAL_STORAGE_KEYS.ROSTERS, JSON.stringify(unique));
      return unique;
    }
    return getCachedRosters();
  } catch (err) {
    return getCachedRosters();
  }
}

export async function saveRosterWithAssignments(
  roster: Roster,
  assignments: DutyAssignment[]
): Promise<void> {
  const cachedRosters = await getRosters();
  const filteredRosters = cachedRosters.filter(r => r.id !== roster.id).map(r => ({ ...r, isActive: false }));
  localStorage.setItem(LOCAL_STORAGE_KEYS.ROSTERS, JSON.stringify([roster, ...filteredRosters]));

  const cachedAssignments = (await getDutyAssignments()).filter(a => a.rosterId !== roster.id);
  localStorage.setItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify([...assignments, ...cachedAssignments]));

  try {
    const batch = writeBatch(db);
    for (const r of cachedRosters) {
      if (r.id !== roster.id && r.isActive) {
        batch.set(doc(db, 'rosters', r.id), { ...r, isActive: false }, { merge: true });
      }
    }
    batch.set(doc(db, 'rosters', roster.id), cleanDoc(roster));
    for (const assignment of assignments) {
      batch.set(doc(db, 'dutyAssignments', assignment.id), cleanDoc(assignment));
    }
    await batch.commit();
  } catch (err) {
    console.warn('Firestore saveRosterWithAssignments fallback:', err);
  }
}

export async function deleteRoster(rosterId: string): Promise<void> {
  const currentRosters = await getRosters();
  const targetRoster = currentRosters.find(r => r.id === rosterId);
  const wasActive = targetRoster?.isActive ?? false;

  let remainingRosters = currentRosters.filter(r => r.id !== rosterId);
  if (wasActive && remainingRosters.length > 0) {
    remainingRosters = remainingRosters.map((r, idx) => ({ ...r, isActive: idx === 0 }));
  }

  localStorage.setItem(LOCAL_STORAGE_KEYS.ROSTERS, JSON.stringify(remainingRosters));
  const cachedAssignments = (await getDutyAssignments()).filter(a => a.rosterId !== rosterId);
  localStorage.setItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(cachedAssignments));

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'rosters', rosterId));
    if (wasActive && remainingRosters.length > 0) {
      batch.set(doc(db, 'rosters', remainingRosters[0].id), { isActive: true }, { merge: true });
    }
    const assignmentsSnap = await getDocs(collection(db, 'dutyAssignments'));
    assignmentsSnap.forEach(d => {
      const data = d.data() as DutyAssignment;
      if (data.rosterId === rosterId) {
        batch.delete(d.ref);
      }
    });
    await batch.commit();
  } catch (err) {
    console.warn('Firestore deleteRoster fallback:', err);
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
  } catch (err) {
    console.warn('Firestore setActiveRoster fallback:', err);
  }
}

export async function getDutyAssignments(): Promise<DutyAssignment[]> {
  try {
    const assignCol = collection(db, 'dutyAssignments');
    const q = query(assignCol, orderBy('startDate', 'asc'));
    const snap = await withTimeout(getDocs(q), 2500);
    const assignments: DutyAssignment[] = [];
    snap.forEach(d => assignments.push(d.data() as DutyAssignment));
    if (assignments.length > 0) {
      const unique = Array.from(new Map(assignments.map(a => [a.id, a])).values());
      localStorage.setItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(unique));
      return unique;
    }
    return getCachedDutyAssignments();
  } catch (err) {
    return getCachedDutyAssignments();
  }
}

export async function updateDutyAssignment(assignment: DutyAssignment): Promise<void> {
  const cached = await getDutyAssignments();
  const updated = cached.map(a => (a.id === assignment.id ? assignment : a));
  localStorage.setItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(updated));

  try {
    await setDoc(doc(db, 'dutyAssignments', assignment.id), cleanDoc(assignment), { merge: true });
  } catch (err) {
    console.warn('Firestore updateDutyAssignment fallback:', err);
  }
}

// ==========================================
// 6. SEND HISTORY
// ==========================================

export async function getSendHistory(): Promise<SendHistory[]> {
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

  try {
    await setDoc(doc(db, 'sendHistory', item.id), cleanDoc(item));
  } catch (err) {
    console.warn('Firestore recordSendHistory fallback:', err);
  }
}

// ==========================================
// 7. DEMO DATA RESET & SEEDING CONTROLS
// ==========================================

export async function loadAllDemoData(): Promise<void> {
  localStorage.setItem(LOCAL_STORAGE_KEYS.HOUSES, JSON.stringify(DEFAULT_HOUSES));
  localStorage.setItem(LOCAL_STORAGE_KEYS.TERMS, JSON.stringify([DEFAULT_TERM]));
  localStorage.setItem(LOCAL_STORAGE_KEYS.HOUSE_REPORTS, JSON.stringify(SAMPLE_HOUSE_REPORTS));
  localStorage.setItem(LOCAL_STORAGE_KEYS.ROSTERS, JSON.stringify([SAMPLE_ROSTER]));
  localStorage.setItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(SAMPLE_ASSIGNMENTS));
  localStorage.setItem(LOCAL_STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));

  try {
    await saveHouses(DEFAULT_HOUSES);
    await saveTerm(DEFAULT_TERM);
    for (const r of SAMPLE_HOUSE_REPORTS) {
      await saveHouseReport(r);
    }
    await saveRosterWithAssignments(SAMPLE_ROSTER, SAMPLE_ASSIGNMENTS);
    await saveSettings(DEFAULT_SETTINGS);
  } catch (err) {
    console.warn('Demo data loaded into local cache:', err);
  }
}

export async function clearAllDemoData(): Promise<void> {
  localStorage.removeItem(LOCAL_STORAGE_KEYS.HOUSE_REPORTS);
  localStorage.removeItem(LOCAL_STORAGE_KEYS.ASSIGNMENTS);
  localStorage.removeItem(LOCAL_STORAGE_KEYS.ROSTERS);
  localStorage.removeItem(LOCAL_STORAGE_KEYS.HISTORY);
  // Keep houses and settings structure initialized
}
