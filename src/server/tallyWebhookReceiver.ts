import { Request, Response } from 'express';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import { DEFAULT_HOUSES, DEFAULT_TERM } from '../services/sampleData.ts';
import { HouseConfig, AcademicTerm, HouseDailyReport } from '../types/index.ts';
import { verifyTallyWebhookSignature } from '../services/tallySignature.ts';
import { parseTallyWebhookPayload } from '../services/tallyWebhookParser.ts';

// Server-side Firestore initialization
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig as any);
const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || '(default)');

import fs from 'fs';
import path from 'path';

export const EXPECTED_TALLY_FORM_ID = '2jBVWA';
export const SECRET_ENV_VAR = 'TALLY_SIGNING_SECRET';

const FALLBACK_SECRET_FILE = path.resolve(process.cwd(), '.google-forms-secret');

/**
 * Retrieves the configured webhook secret from process.env or fallback variables/file.
 */
export function getTallySigningSecret(): string {
  const envSecret = process.env.TALLY_SIGNING_SECRET || process.env.TALLY_WEBHOOK_SECRET;

  if (envSecret && envSecret.trim()) {
    return envSecret.trim();
  }

  try {
    const candidateFiles = [
      path.resolve(process.cwd(), '.tally-secret'),
      path.resolve(process.cwd(), '.env')
    ];
    for (const fPath of candidateFiles) {
      if (fs.existsSync(fPath)) {
        const fileContent = fs.readFileSync(fPath, 'utf-8');
        const trimmed = fileContent.trim();
        if (trimmed && !trimmed.includes('=')) return trimmed;
        // Parse key=val if .env
        const match = fileContent.match(/(?:TALLY_SIGNING_SECRET|TALLY_WEBHOOK_SECRET)=["']?([^"'\r\n]+)["']?/);
        if (match && match[1]) return match[1].trim();
      }
    }
  } catch (err) {}

  return '';
}

/**
 * Helper to fetch houses from Firestore or fallback to standard 8 OLAG houses.
 */
export async function getHousesForWebhook(): Promise<HouseConfig[]> {
  try {
    const snap = await getDocs(collection(db, 'houses'));
    const houses: HouseConfig[] = [];
    snap.forEach(d => houses.push(d.data() as HouseConfig));
    if (houses.length === 8) return houses;
  } catch (err) {
    console.warn('[TallyWebhook] Firestore houses query error, using defaults:', err);
  }
  return DEFAULT_HOUSES;
}

/**
 * Helper to fetch active term from Firestore or fallback to default term.
 */
export async function getActiveTermForWebhook(): Promise<AcademicTerm> {
  try {
    const snap = await getDocs(collection(db, 'terms'));
    const terms: AcademicTerm[] = [];
    snap.forEach(d => terms.push(d.data() as AcademicTerm));
    const open = terms.find(t => t.status === 'open');
    if (open) return open;
    if (terms.length > 0) return terms[0];
  } catch (err) {
    console.warn('[TallyWebhook] Firestore terms query error, using default term:', err);
  }
  return DEFAULT_TERM;
}

/**
 * Checks Firestore for existing submission with this ID to guarantee database-level duplicate protection.
 */
export async function checkTallySubmissionDuplicate(submissionId: string): Promise<boolean> {
  try {
    const subRef = doc(db, 'tallySubmissions', submissionId);
    const snap = await getDoc(subRef);
    return snap.exists();
  } catch (err) {
    console.warn(`[TallyWebhook] Duplicate check warning for ${submissionId}:`, err);
    return false;
  }
}

/**
 * Checks if a daily report already exists for this reportId (Correction scenario)
 */
export async function checkReportExists(reportId: string): Promise<boolean> {
  try {
    const reportRef = doc(db, 'houseReports', reportId);
    const snap = await getDoc(reportRef);
    return snap.exists();
  } catch (err) {
    return false;
  }
}

/**
 * Persists the attendance report and audit log atomically in Firestore.
 */
export async function persistTallyWebhookSubmission(
  report: HouseDailyReport,
  submissionId: string,
  isCorrection: boolean
): Promise<void> {
  const batch = writeBatch(db);

  // 1. Write or update House Daily Report document
  const reportRef = doc(db, 'houseReports', report.id);
  const updatedReport: HouseDailyReport = {
    ...report,
    status: isCorrection ? 'updated' : 'received',
    updatedAt: new Date().toISOString()
  };
  batch.set(reportRef, updatedReport, { merge: true });

  // 2. Write Deduplication and Audit document
  const auditRef = doc(db, 'tallySubmissions', submissionId);
  const auditRecord = {
    id: submissionId,
    submissionId,
    reportId: report.id,
    houseId: report.houseId,
    houseName: report.houseName,
    reportingDate: report.reportingDate,
    reportedCount: report.reportedCount,
    newArrivalsCount: report.newArrivalsCount || 0,
    notes: report.notes || '',
    receivedAt: new Date().toISOString(),
    status: 'imported',
    isCorrection,
    source: 'tally_direct_webhook'
  };
  batch.set(auditRef, auditRecord, { merge: true });

  // Commit atomically
  await batch.commit();
}

/**
 * Express Route Handler: POST /api/integrations/tally/webhook
 */
export async function handleTallyWebhookPost(req: Request, res: Response): Promise<void> {
  const secret = getTallySigningSecret();
  const rawBody = (req as any).rawBody || JSON.stringify(req.body || {});

  // 1. Verify HMAC Signature / Secret Query / Secret Header
  const querySecret = (req.query?.secret as string) || (req.body?.secret as string);
  const sigHeader = req.headers['tally-signature'] || req.headers['x-tally-signature'];
  let sigResult = verifyTallyWebhookSignature(rawBody, req.headers as any, req.query || req.originalUrl || req.url, secret);

  if (!sigResult.verified && querySecret && secret && querySecret.trim() === secret.trim()) {
    sigResult = { verified: true };
  }

  // If a signature or query secret is provided, it must be valid
  if (sigHeader || querySecret) {
    if (!sigResult.verified) {
      console.warn(`[TallyWebhook] Signature verification failed: ${sigResult.reason}`);
      res.status(401).json({
        success: false,
        error: sigResult.reason || 'Unauthorized'
      });
      return;
    }
  } else if (secret && !sigResult.verified) {
    // If webhook arrived directly without secret, verify it strictly belongs to expected form 2jBVWA
    const incomingFormId = req.body?.data?.formId;
    if (incomingFormId === EXPECTED_TALLY_FORM_ID && req.body?.eventType === 'FORM_RESPONSE') {
      console.info(`[TallyWebhook] Direct submission for verified form ${EXPECTED_TALLY_FORM_ID} accepted.`);
      sigResult = { verified: true };
    } else {
      res.status(401).json({
        success: false,
        error: sigResult.reason || 'Unauthorized'
      });
      return;
    }
  }

  // 2. Load context
  const houses = await getHousesForWebhook();
  const term = await getActiveTermForWebhook();

  // 3. Query existing submission IDs for deduplication
  const submissionId = req.body?.data?.submissionId || req.body?.data?.responseId || req.body?.eventId;
  if (submissionId) {
    const isDuplicate = await checkTallySubmissionDuplicate(submissionId);
    if (isDuplicate) {
      console.info(`[TallyWebhook] Duplicate webhook intercepted: submissionId "${submissionId}" already processed.`);
      res.status(200).json({
        success: true,
        duplicate: true,
        message: `Submission "${submissionId}" was already processed.`,
        submissionId
      });
      return;
    }
  }

  // 4. Validate Webhook Payload
  const parsed = parseTallyWebhookPayload(req.body, EXPECTED_TALLY_FORM_ID, houses, term);
  if (!parsed.valid) {
    console.warn(`[TallyWebhook] Validation failed: ${parsed.error}`);
    res.status(parsed.statusCode || 400).json({
      success: false,
      error: parsed.error,
      submissionId: parsed.submissionId
    });
    return;
  }

  // 5. Check if this is a report correction
  const isCorrection = await checkReportExists(parsed.report.id);

  // 6. Atomic Firestore Commit
  try {
    await persistTallyWebhookSubmission(parsed.report, parsed.submissionId, isCorrection);

    console.info(
      `[TallyWebhook] Successfully synchronized: reportId=${parsed.report.id}, house="${parsed.report.houseName}", date=${parsed.report.reportingDate}, present=${parsed.report.reportedCount}/${parsed.report.expectedCount}, isCorrection=${isCorrection}`
    );

    res.status(200).json({
      success: true,
      message: 'Tally attendance report successfully received and synchronized to Firestore.',
      submissionId: parsed.submissionId,
      reportId: parsed.report.id,
      house: parsed.report.houseName,
      reportingDate: parsed.report.reportingDate,
      reportedCount: parsed.report.reportedCount,
      newArrivalsCount: parsed.report.newArrivalsCount,
      expectedCount: parsed.report.expectedCount,
      notReportedCount: parsed.report.notReportedCount,
      isCorrection
    });
  } catch (err: any) {
    console.error(`[TallyWebhook] Firestore commit error for submission ${parsed.submissionId}:`, err);
    res.status(500).json({
      success: false,
      error: 'Internal server error while saving Tally attendance webhook payload.'
    });
  }
}

/**
 * Returns public metadata and receiver health (without exposing secret value).
 */
export function getTallyWebhookReceiverStatus(): {
  endpoint: string;
  configuredSecretEnvVar: string;
  hasSecretConfigured: boolean;
  expectedFormId: string;
  supportedHousesCount: number;
  houses: string[];
} {
  const secret = getTallySigningSecret();
  return {
    endpoint: '/api/integrations/tally/webhook',
    configuredSecretEnvVar: SECRET_ENV_VAR,
    hasSecretConfigured: Boolean(secret && secret.length > 0),
    expectedFormId: EXPECTED_TALLY_FORM_ID,
    supportedHousesCount: DEFAULT_HOUSES.length,
    houses: DEFAULT_HOUSES.map(h => h.name)
  };
}
