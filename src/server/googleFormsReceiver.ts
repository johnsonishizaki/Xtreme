import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import { DEFAULT_HOUSES, DEFAULT_TERM } from '../services/sampleData.ts';
import { HouseConfig, AcademicTerm, HouseDailyReport } from '../types/index.ts';
import {
  GoogleFormsAttendancePayload,
  GoogleFormsReceiverResponse,
  GoogleFormsSubmissionRecord
} from '../types/googleForms.ts';
import {
  matchHouse,
  isValidCalendarDate,
  normalizeDateString,
  parseNonNegativeInteger
} from '../services/tallyParser.ts';

// Server-side Firestore initialization
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig as any);
const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || '(default)');

const SECRET_ENV_VAR = 'GOOGLE_FORMS_WEBHOOK_SECRET';
const FALLBACK_SECRET_FILE = path.resolve(process.cwd(), '.google-forms-secret');

let inMemorySecretOverride: string | null = null;

/**
 * Retrieves the configured webhook secret from environment variables,
 * secret file, or in-memory override.
 */
export function getWebhookSecret(): string {
  if (inMemorySecretOverride !== null && inMemorySecretOverride.trim().length > 0) {
    return inMemorySecretOverride.trim();
  }

  // 1. Primary: Server environment variable
  const envSecret = process.env[SECRET_ENV_VAR];
  if (envSecret && envSecret.trim().length > 0) {
    return envSecret.trim();
  }

  // 2. Secondary: Secure server-side secret file (.google-forms-secret)
  try {
    if (fs.existsSync(FALLBACK_SECRET_FILE)) {
      const fileSecret = fs.readFileSync(FALLBACK_SECRET_FILE, 'utf-8').trim();
      if (fileSecret.length > 0) {
        return fileSecret;
      }
    }
  } catch (err) {
    // Non-fatal, fallback to empty
  }

  return '';
}

/**
 * Sets an in-memory override for the webhook secret (useful for tests and dynamic updates).
 */
export function setWebhookSecret(secret: string | null): void {
  inMemorySecretOverride = secret;
}

/**
 * Safely extracts the token from incoming request headers or body.
 * Supports:
 * - Header: 'x-webhook-secret'
 * - Header: 'x-google-forms-secret'
 * - Header: 'authorization' (Bearer <secret>)
 * - Body: 'secret' (fallback for restrictive environments)
 */
export function extractProvidedSecret(req: Request): string {
  const customHeader = req.headers['x-webhook-secret'] || req.headers['x-google-forms-secret'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim();
  }

  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.trim()) {
    const parts = authHeader.trim().split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1].trim();
    }
    return authHeader.trim();
  }

  if (req.body && typeof req.body.secret === 'string' && req.body.secret.trim()) {
    return req.body.secret.trim();
  }

  return '';
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Authenticates the request against the configured secret.
 */
export function authenticateWebhookRequest(
  req: Request,
  configuredSecret: string
): { authenticated: boolean; reason?: string } {
  if (!configuredSecret || configuredSecret.trim().length === 0) {
    return {
      authenticated: false,
      reason: `Server configuration error: ${SECRET_ENV_VAR} is not configured on the server.`
    };
  }

  const provided = extractProvidedSecret(req);
  if (!provided) {
    return {
      authenticated: false,
      reason: 'Authentication failed: Missing webhook secret. Provide header X-Webhook-Secret or Authorization: Bearer <secret>.'
    };
  }

  if (!timingSafeCompare(provided, configuredSecret)) {
    return {
      authenticated: false,
      reason: 'Authentication failed: Invalid webhook secret.'
    };
  }

  return { authenticated: true };
}

/**
 * Helper to fetch houses from Firestore or fallback to standard 8 OLAG houses.
 */
export async function getHousesForReceiver(): Promise<HouseConfig[]> {
  try {
    const snap = await getDocs(collection(db, 'houses'));
    const houses: HouseConfig[] = [];
    snap.forEach(d => houses.push(d.data() as HouseConfig));
    if (houses.length === 8) return houses;
  } catch (err) {
    console.warn('[GoogleForms] Firestore houses query error, using defaults:', err);
  }
  return DEFAULT_HOUSES;
}

/**
 * Helper to fetch active term from Firestore or fallback to default term.
 */
export async function getActiveTermForReceiver(): Promise<AcademicTerm> {
  try {
    const snap = await getDocs(collection(db, 'terms'));
    const terms: AcademicTerm[] = [];
    snap.forEach(d => terms.push(d.data() as AcademicTerm));
    const open = terms.find(t => t.status === 'open');
    if (open) return open;
    if (terms.length > 0) return terms[0];
  } catch (err) {
    console.warn('[GoogleForms] Firestore terms query error, using default term:', err);
  }
  return DEFAULT_TERM;
}

export interface ValidationSuccess {
  valid: true;
  submissionId: string;
  normalizedDate: string;
  matchedHouse: HouseConfig;
  reportedCount: number;
  newArrivalsCount: number;
  expectedCount: number;
  notReportedCount: number;
  notes: string;
  submittedAtIso: string;
}

export interface ValidationFailure {
  valid: false;
  statusCode: number;
  error: string;
}

/**
 * Validates Google Forms attendance submission payload against OLAG domain rules.
 */
export function validateGoogleFormsSubmission(
  rawBody: any,
  houses: HouseConfig[],
  term?: AcademicTerm
): ValidationSuccess | ValidationFailure {
  if (!rawBody || typeof rawBody !== 'object') {
    return {
      valid: false,
      statusCode: 400,
      error: 'Invalid request body. Expected a JSON object with attendance submission fields.'
    };
  }

  // 1. Submission Identifier
  const rawSubId = rawBody.submissionId ?? rawBody.responseId ?? rawBody.formResponseId ?? rawBody.id;
  if (!rawSubId || typeof rawSubId !== 'string' || !rawSubId.trim()) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Missing required field "submissionId". A unique Google Forms response/sheet identifier is required.'
    };
  }
  const submissionId = rawSubId.trim();
  if (submissionId.length > 256) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Field "submissionId" exceeds maximum allowed length of 256 characters.'
    };
  }

  // 2. Reporting Date
  const rawDate = rawBody.reportingDate ?? rawBody.date;
  if (!rawDate) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Missing required field "reportingDate". Expected calendar date in YYYY-MM-DD format.'
    };
  }
  const normalizedDate = normalizeDateString(rawDate);
  if (!normalizedDate || !isValidCalendarDate(normalizedDate)) {
    return {
      valid: false,
      statusCode: 400,
      error: `Invalid reporting date "${rawDate}". Date must be a valid calendar date in YYYY-MM-DD format.`
    };
  }

  // 3. House Validation (must match one of the 8 OLAG houses)
  const rawHouse = rawBody.house ?? rawBody.houseName ?? rawBody.houseId;
  if (!rawHouse || typeof rawHouse !== 'string' || !rawHouse.trim()) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Missing required field "house". Must specify one of the eight OLAG houses.'
    };
  }
  const matchedHouse = matchHouse(rawHouse, houses);
  if (!matchedHouse) {
    const validHouseList = houses.map(h => h.name).join(', ');
    return {
      valid: false,
      statusCode: 400,
      error: `Invalid house: "${rawHouse}". Must match one of the eight OLAG houses: ${validHouseList}.`
    };
  }

  // 4. Student Present Count (non-negative whole integer)
  const rawReported =
    rawBody.reportedCount ??
    rawBody.reported ??
    rawBody.studentPresentCount ??
    rawBody.studentsPresent ??
    rawBody.presentCount ??
    rawBody.present;

  const parsedReported = parseNonNegativeInteger(rawReported, false);
  if (!parsedReported.valid) {
    return {
      valid: false,
      statusCode: 400,
      error: `Invalid student-present count: ${parsedReported.reason || 'Must be a non-negative whole integer (>= 0).'}`
    };
  }
  const reportedCount = parsedReported.value;

  // 5. New Arrivals Count (optional non-negative whole integer, default 0)
  const rawArrivals = rawBody.newArrivalsCount ?? rawBody.newArrivals ?? rawBody.arrivals;
  const parsedArrivals = parseNonNegativeInteger(rawArrivals, true);
  if (!parsedArrivals.valid) {
    return {
      valid: false,
      statusCode: 400,
      error: `Invalid new-arrivals count: ${parsedArrivals.reason || 'Must be a non-negative whole integer (>= 0).'}`
    };
  }
  const newArrivalsCount = parsedArrivals.value;

  // 6. Expected count and capacity calculation
  const expectedCount =
    term?.houseExpectedCounts?.[matchedHouse.id] ??
    matchedHouse.expectedStudentCount ??
    120;

  if (reportedCount > expectedCount) {
    return {
      valid: false,
      statusCode: 400,
      error: `Reported students present (${reportedCount}) exceeds house expected capacity (${expectedCount}) for ${matchedHouse.name}.`
    };
  }

  const notReportedCount = Math.max(0, expectedCount - reportedCount);

  // 7. Optional Notes
  const rawNotes = rawBody.notes ?? rawBody.notReportedDetails ?? rawBody.comments ?? rawBody.reason ?? '';
  const notes = typeof rawNotes === 'string' ? rawNotes.trim() : String(rawNotes || '').trim();

  // 8. Submitted At Timestamp
  const rawTimestamp = rawBody.submittedAt ?? rawBody.timestamp;
  let submittedAtIso = new Date().toISOString();
  if (rawTimestamp) {
    const parsedTime = Date.parse(String(rawTimestamp));
    if (!isNaN(parsedTime)) {
      submittedAtIso = new Date(parsedTime).toISOString();
    }
  }

  return {
    valid: true,
    submissionId,
    normalizedDate,
    matchedHouse,
    reportedCount,
    newArrivalsCount,
    expectedCount,
    notReportedCount,
    notes,
    submittedAtIso
  };
}

/**
 * Checks Firestore for existing submission with this ID to guarantee database-level duplicate protection.
 */
export async function checkSubmissionDuplicate(submissionId: string): Promise<boolean> {
  try {
    const subRef = doc(db, 'googleFormsSubmissions', submissionId);
    const snap = await getDoc(subRef);
    return snap.exists();
  } catch (err) {
    console.warn(`[GoogleForms] Duplicate check failed for ${submissionId}, proceeding with caution:`, err);
    return false;
  }
}

/**
 * Persists the attendance report and audit log in Firestore.
 */
export async function persistGoogleFormsSubmission(
  validation: ValidationSuccess,
  termId: string
): Promise<{ report: HouseDailyReport; audit: GoogleFormsSubmissionRecord }> {
  const reportId = `${validation.normalizedDate}_${validation.matchedHouse.id}`;

  const report: HouseDailyReport = {
    id: reportId,
    termId,
    reportingDate: validation.normalizedDate,
    houseId: validation.matchedHouse.id,
    houseName: validation.matchedHouse.name,
    houseCategory: validation.matchedHouse.category,
    expectedCount: validation.expectedCount,
    reportedCount: validation.reportedCount,
    notReportedCount: validation.notReportedCount,
    newArrivalsCount: validation.newArrivalsCount,
    notReportedDetails: validation.notes,
    notes: validation.notes,
    houseparent: validation.matchedHouse.assignedHouseparent,
    submittedAt: validation.submittedAtIso,
    updatedAt: new Date().toISOString(),
    status: 'received',
    source: 'google_form'
  };

  const audit: GoogleFormsSubmissionRecord = {
    id: validation.submissionId,
    submissionId: validation.submissionId,
    reportId,
    houseId: validation.matchedHouse.id,
    houseName: validation.matchedHouse.name,
    houseCategory: validation.matchedHouse.category,
    reportingDate: validation.normalizedDate,
    reportedCount: validation.reportedCount,
    newArrivalsCount: validation.newArrivalsCount,
    expectedCount: validation.expectedCount,
    notReportedCount: validation.notReportedCount,
    notes: validation.notes,
    submittedAt: validation.submittedAtIso,
    receivedAt: new Date().toISOString(),
    status: 'imported',
    source: 'google_forms_apps_script'
  };

  // 1. Write report document to houseReports collection
  const reportRef = doc(db, 'houseReports', report.id);
  await setDoc(reportRef, { ...report, updatedAt: new Date().toISOString() }, { merge: true });

  // 2. Write deduplication and audit document to googleFormsSubmissions collection
  const auditRef = doc(db, 'googleFormsSubmissions', audit.id);
  await setDoc(auditRef, audit, { merge: true });

  return { report, audit };
}

/**
 * Express Route Handler: POST /api/integrations/google-forms/attendance
 */
export async function handleGoogleFormsAttendanceWebhook(req: Request, res: Response): Promise<void> {
  const configuredSecret = getWebhookSecret();

  // 1. Authenticate Request
  const authResult = authenticateWebhookRequest(req, configuredSecret);
  if (!authResult.authenticated) {
    // Sanitized logging: never print secret in logs
    console.warn(`[GoogleForms] Unauthorized request from ${req.ip || 'unknown IP'}: ${authResult.reason}`);
    const statusCode = authResult.reason?.startsWith('Server configuration error') ? 500 : 401;
    res.status(statusCode).json({
      success: false,
      error: authResult.reason || 'Unauthorized'
    });
    return;
  }

  // 2. Load House and Term context
  const houses = await getHousesForReceiver();
  const term = await getActiveTermForReceiver();

  // 3. Validate Payload
  const validation = validateGoogleFormsSubmission(req.body, houses, term);
  if (!validation.valid) {
    console.warn(`[GoogleForms] Validation rejected: ${validation.error}`);
    res.status(validation.statusCode).json({
      success: false,
      error: validation.error
    });
    return;
  }

  // 4. Database-level Duplicate Protection
  const isDuplicate = await checkSubmissionDuplicate(validation.submissionId);
  if (isDuplicate) {
    const isIdempotentRequested =
      req.query.idempotent === 'true' ||
      req.headers['x-idempotent'] === 'true';

    console.info(
      `[GoogleForms] Duplicate submission detected: submissionId "${validation.submissionId}" already processed.`
    );

    if (isIdempotentRequested) {
      res.status(200).json({
        success: true,
        duplicate: true,
        message: `Submission "${validation.submissionId}" was already processed.`,
        submissionId: validation.submissionId,
        reportId: `${validation.normalizedDate}_${validation.matchedHouse.id}`
      });
      return;
    }

    res.status(409).json({
      success: false,
      duplicate: true,
      error: `Duplicate submission: submissionId "${validation.submissionId}" has already been imported.`,
      submissionId: validation.submissionId,
      reportId: `${validation.normalizedDate}_${validation.matchedHouse.id}`
    });
    return;
  }

  // 5. Persist to Firestore
  try {
    const { report } = await persistGoogleFormsSubmission(validation, term.id);

    // Sanitized outcome log
    console.info(
      `[GoogleForms] Successfully synchronized attendance: reportId=${report.id}, house="${report.houseName}", date=${report.reportingDate}, present=${report.reportedCount}/${report.expectedCount}, newArrivals=${report.newArrivalsCount}`
    );

    const responsePayload: GoogleFormsReceiverResponse = {
      success: true,
      message: 'House attendance report successfully received and synchronized.',
      submissionId: validation.submissionId,
      reportId: report.id,
      house: report.houseName,
      reportingDate: report.reportingDate,
      reportedCount: report.reportedCount,
      newArrivalsCount: report.newArrivalsCount,
      expectedCount: report.expectedCount,
      notReportedCount: report.notReportedCount
    };

    res.status(200).json(responsePayload);
  } catch (err: any) {
    console.error(`[GoogleForms] Persistence error for submission ${validation.submissionId}:`, err);
    res.status(500).json({
      success: false,
      error: 'Internal server error while saving attendance submission.'
    });
  }
}

/**
 * Returns public metadata and receiver health (without exposing secret value).
 */
export function getGoogleFormsReceiverStatus(): {
  endpoint: string;
  configuredSecretEnvVar: string;
  hasSecretConfigured: boolean;
  supportedHousesCount: number;
  houses: string[];
} {
  const secret = getWebhookSecret();
  return {
    endpoint: '/api/integrations/google-forms/attendance',
    configuredSecretEnvVar: SECRET_ENV_VAR,
    hasSecretConfigured: Boolean(secret && secret.length > 0),
    supportedHousesCount: DEFAULT_HOUSES.length,
    houses: DEFAULT_HOUSES.map(h => h.name)
  };
}
