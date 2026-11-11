import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import { DEFAULT_HOUSES, DEFAULT_TERM } from '../services/sampleData.ts';
import { HouseConfig, AcademicTerm, HouseDailyReport } from '../types/index.ts';
import {
  TallyConfig,
  TallyConnectionStatus,
  TallySubmissionsApiResponse,
  TallySubmissionAudit,
  TallySyncLog,
  TallySyncResult,
  TallyValidationIssue
} from '../types/tally.ts';
import { processTallyApiResponse } from '../services/tallyParser.ts';

const TALLY_API_BASE = 'https://api.tally.so';
const DEFAULT_FORM_ID = '2jBVWA';
const DEFAULT_INTERVAL_SECONDS = 1;
const CONFIG_FILE_PATH = path.resolve(process.cwd(), '.tally-config.json');

// Initialize server-side Firestore instance
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig as any);
const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || '(default)');

interface StoredServerConfig {
  apiKey?: string;
  formId?: string;
  pollIntervalSeconds?: number;
  pollIntervalMinutes?: number;
}

export interface TallyServiceStats {
  totalRetrieved: number;
  totalImported: number;
  totalDuplicatesSkipped: number;
  totalInvalid: number;
}

class TallyIntegrationService {
  private formId: string = DEFAULT_FORM_ID;
  private apiKey: string = '';
  private pollIntervalSeconds: number = DEFAULT_INTERVAL_SECONDS;
  private pollTimer: NodeJS.Timeout | null = null;
  private isSyncInProgress: boolean = false;
  private connectionStatus: TallyConnectionStatus = 'not_configured';
  private consecutiveFailures: number = 0;

  // In-memory cache for fast status queries and audits
  private lastSyncLog: TallySyncLog | null = null;
  private syncLogsHistory: TallySyncLog[] = [];
  private failedSubmissions: TallyValidationIssue[] = [];
  private stats = {
    totalRetrieved: 0,
    totalImported: 0,
    totalDuplicatesSkipped: 0,
    totalInvalid: 0
  };

  constructor() {
    this.loadConfiguration();
  }

  /**
   * Loads configuration from environment variables and secure server file.
   * Priority: 1. Process environment (TALLY_API_KEY) 2. Server config file 3. Defaults
   */
  public loadConfiguration(): void {
    // 1. Check environment variable
    if (process.env.TALLY_API_KEY && process.env.TALLY_API_KEY.trim()) {
      this.apiKey = process.env.TALLY_API_KEY.trim();
    }

    if (process.env.TALLY_FORM_ID && process.env.TALLY_FORM_ID.trim()) {
      this.formId = process.env.TALLY_FORM_ID.trim();
    }

    if (process.env.TALLY_POLL_INTERVAL_SECONDS) {
      const parsed = parseInt(process.env.TALLY_POLL_INTERVAL_SECONDS, 10);
      if (!isNaN(parsed) && parsed >= 5) {
        this.pollIntervalSeconds = parsed;
      }
    } else if (process.env.TALLY_POLL_INTERVAL_MINUTES) {
      const parsed = parseInt(process.env.TALLY_POLL_INTERVAL_MINUTES, 10);
      if (!isNaN(parsed) && parsed >= 1) {
        this.pollIntervalSeconds = parsed * 60;
      }
    }

    // 2. Load from server config file if not set in process.env
    try {
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
        const parsed: StoredServerConfig = JSON.parse(fileContent);
        if (!this.apiKey && parsed.apiKey) {
          this.apiKey = parsed.apiKey.trim();
        }
        if (parsed.formId) {
          this.formId = parsed.formId.trim();
        }
        if (parsed.pollIntervalSeconds && parsed.pollIntervalSeconds >= 5) {
          this.pollIntervalSeconds = parsed.pollIntervalSeconds;
        } else if (parsed.pollIntervalMinutes && parsed.pollIntervalMinutes >= 1) {
          this.pollIntervalSeconds = parsed.pollIntervalMinutes * 60;
        }
      }
    } catch (err) {
      console.warn('[TallyService] Could not read .tally-config.json:', err);
    }

    this.updateConnectionStatusFast();
  }

  /**
   * Saves updated server-side configuration securely.
   */
  public saveConfiguration(
    newApiKey?: string,
    newFormId?: string,
    newIntervalSec?: number,
    newIntervalMin?: number
  ): void {
    if (newApiKey !== undefined) {
      this.apiKey = newApiKey.trim();
    }
    if (newFormId !== undefined && newFormId.trim()) {
      this.formId = newFormId.trim();
    }
    if (newIntervalSec !== undefined && newIntervalSec >= 5) {
      this.pollIntervalSeconds = newIntervalSec;
    } else if (newIntervalMin !== undefined && newIntervalMin >= 1) {
      this.pollIntervalSeconds = newIntervalMin * 60;
    }

    try {
      const data: StoredServerConfig = {
        apiKey: this.apiKey,
        formId: this.formId,
        pollIntervalSeconds: this.pollIntervalSeconds,
        pollIntervalMinutes: Math.round(this.pollIntervalSeconds / 60)
      };
      fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(data, null, 2), {
        encoding: 'utf-8',
        mode: 0o600 // Read/write only by owner
      });
    } catch (err) {
      console.error('[TallyService] Failed to persist .tally-config.json:', err);
    }

    this.updateConnectionStatusFast();
    this.restartPolling();
  }

  private updateConnectionStatusFast(): void {
    if (!this.apiKey) {
      this.connectionStatus = 'not_configured';
    }
  }

  /**
   * Tests connection to Tally API using configured key and form ID.
   */
  public async testConnection(): Promise<{
    status: TallyConnectionStatus;
    message: string;
    sampleCount?: number;
  }> {
    if (!this.apiKey) {
      this.connectionStatus = 'not_configured';
      return {
        status: 'not_configured',
        message: 'TALLY_API_KEY is not configured on the server.'
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const endpoint = `${TALLY_API_BASE}/forms/${this.formId}/submissions?limit=1`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'Xtreme-Attendance-Integration/1.0'
        },
        signal: controller.signal
      });

      if (response.status === 401 || response.status === 403) {
        this.connectionStatus = 'auth_failed';
        return {
          status: 'auth_failed',
          message: 'Tally API returned 401 Unauthorized: Invalid API Key or insufficient permissions.'
        };
      }

      if (response.status === 404) {
        this.connectionStatus = 'connection_error';
        return {
          status: 'connection_error',
          message: `Tally Form ID "${this.formId}" was not found (404).`
        };
      }

      if (!response.ok) {
        this.connectionStatus = 'connection_error';
        return {
          status: 'connection_error',
          message: `Tally API returned HTTP ${response.status}: ${response.statusText}`
        };
      }

      const data: TallySubmissionsApiResponse = await response.json();
      this.connectionStatus = 'connected';
      const total = data.totalNumberOfSubmissionsPerFilter?.all ?? data.submissions?.length ?? 0;

      return {
        status: 'connected',
        message: `Successfully connected to Tally API for form ${this.formId}.`,
        sampleCount: total
      };
    } catch (err: any) {
      this.connectionStatus = 'connection_error';
      return {
        status: 'connection_error',
        message: err.name === 'AbortError' ? 'Connection timed out (12s).' : err.message || 'Network error reaching api.tally.so'
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetches all submissions from Tally API with pagination support and rate limit safety.
   */
  public async fetchAllSubmissions(maxPages = 20): Promise<{
    questions: any[];
    submissions: any[];
  }> {
    if (!this.apiKey) {
      throw new Error('TALLY_API_KEY is not configured.');
    }

    let currentPage = 1;
    let hasMore = true;
    let allSubmissions: any[] = [];
    let questions: any[] = [];

    while (hasMore && currentPage <= maxPages) {
      const endpoint = `${TALLY_API_BASE}/forms/${this.formId}/submissions?page=${currentPage}&limit=50`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json',
            'User-Agent': 'Xtreme-Attendance-Integration/1.0'
          },
          signal: controller.signal
        });

        if (res.status === 429) {
          // Rate limit exceeded: wait 2 seconds and retry once
          console.warn('[TallyService] Rate limit (429) encountered. Waiting 2s...');
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        if (res.status === 401 || res.status === 403) {
          this.connectionStatus = 'auth_failed';
          throw new Error('Tally API Authentication Failed (401/403). Check TALLY_API_KEY.');
        }

        if (!res.ok) {
          throw new Error(`Tally API error (${res.status}): ${res.statusText}`);
        }

        const data: TallySubmissionsApiResponse = await res.json();
        if (currentPage === 1 && data.questions) {
          questions = data.questions;
        }

        const batch = data.submissions || [];
        allSubmissions.push(...batch);

        hasMore = Boolean(data.hasMore && batch.length > 0);
        currentPage++;
      } finally {
        clearTimeout(timer);
      }
    }

    this.connectionStatus = 'connected';
    return { questions, submissions: allSubmissions };
  }

  /**
   * Executes a full synchronization run:
   * Fetches -> Validates -> Deduplicates -> Persists to Firestore -> Logs Audit.
   */
  public async syncSubmissions(trigger: 'automatic' | 'manual' = 'manual'): Promise<TallySyncResult> {
    if (this.isSyncInProgress) {
      return {
        success: false,
        message: 'Synchronization already in progress.',
        submissionsRetrieved: 0,
        newReportsImported: 0,
        duplicatesSkipped: 0,
        invalidSubmissions: 0,
        syncTimestamp: new Date().toISOString(),
        issues: [],
        reports: []
      };
    }

    this.isSyncInProgress = true;
    const startTime = Date.now();
    const startIso = new Date(startTime).toISOString();

    try {
      // 1. Fetch raw submissions
      const { questions, submissions } = await this.fetchAllSubmissions();

      // 2. Fetch existing houses and active term from Firestore or defaults
      const houses = await this.getHousesFromDb();
      const term = await this.getActiveTermFromDb();

      // 3. Query already processed submission IDs to guarantee duplicate protection
      const processedSubIds = await this.getProcessedSubmissionIdsFromDb();

      // 4. Process and validate submissions
      const { validReports, reviewIssues, duplicatesSkipped, totalSubmissions } = processTallyApiResponse(
        { questions, submissions },
        houses,
        term,
        processedSubIds
      );

      // 5. Persist valid attendance reports directly into Firestore collection `houseReports`
      let newlyImportedCount = 0;
      for (const report of validReports) {
        await this.persistHouseReportToDb(report);
        newlyImportedCount++;

        // Audit entry
        await this.persistSubmissionAudit({
          id: report.tallySubmissionId || `tally_${report.id}`,
          formId: this.formId,
          reportingDate: report.reportingDate,
          houseId: report.houseId,
          houseName: report.houseName,
          reportedCount: report.reportedCount,
          newArrivalsCount: report.newArrivalsCount || 0,
          notReportedDetails: report.notReportedDetails,
          notes: report.notes,
          submittedAt: report.submittedAt,
          synchronizedAt: new Date().toISOString(),
          importStatus: 'imported',
          reportId: report.id
        });
      }

      // 6. Log failed submissions into audit store
      for (const issue of reviewIssues) {
        await this.persistSubmissionAudit({
          id: issue.submissionId,
          formId: this.formId,
          reportingDate: issue.reportingDate || 'invalid',
          houseId: 'unmatched',
          houseName: issue.rawHouse || 'unknown',
          reportedCount: typeof issue.rawReported === 'number' ? issue.rawReported : 0,
          newArrivalsCount: typeof issue.rawArrivals === 'number' ? issue.rawArrivals : 0,
          submittedAt: issue.submittedAt || new Date().toISOString(),
          synchronizedAt: new Date().toISOString(),
          importStatus: 'validation_failed',
          validationErrors: [issue.reason]
        });
      }

      // Update in-memory state
      this.failedSubmissions = reviewIssues;
      this.stats.totalRetrieved += totalSubmissions;
      this.stats.totalImported += newlyImportedCount;
      this.stats.totalDuplicatesSkipped += duplicatesSkipped;
      this.stats.totalInvalid += reviewIssues.length;

      const completedTime = Date.now();
      const syncLog: TallySyncLog = {
        id: `sync_${completedTime}`,
        startedAt: startIso,
        completedAt: new Date(completedTime).toISOString(),
        durationMs: completedTime - startTime,
        status: 'success',
        trigger,
        submissionsRetrieved: totalSubmissions,
        newReportsImported: newlyImportedCount,
        duplicatesSkipped,
        invalidSubmissions: reviewIssues.length,
        issues: reviewIssues.slice(0, 15) // Keep top issues
      };

      this.lastSyncLog = syncLog;
      this.syncLogsHistory.unshift(syncLog);
      if (this.syncLogsHistory.length > 30) {
        this.syncLogsHistory.pop();
      }

      // Persist sync log to Firestore
      await this.persistSyncLogToDb(syncLog);

      return {
        success: true,
        message: `Synchronized ${totalSubmissions} submissions: ${newlyImportedCount} imported, ${duplicatesSkipped} duplicates skipped, ${reviewIssues.length} invalid.`,
        submissionsRetrieved: totalSubmissions,
        newReportsImported: newlyImportedCount,
        duplicatesSkipped,
        invalidSubmissions: reviewIssues.length,
        syncTimestamp: syncLog.completedAt,
        issues: reviewIssues,
        reports: validReports
      };
    } catch (err: any) {
      console.error('[TallyService] Sync error:', err);
      const completedTime = Date.now();
      const errLog: TallySyncLog = {
        id: `sync_err_${completedTime}`,
        startedAt: startIso,
        completedAt: new Date(completedTime).toISOString(),
        durationMs: completedTime - startTime,
        status: 'error',
        trigger,
        submissionsRetrieved: 0,
        newReportsImported: 0,
        duplicatesSkipped: 0,
        invalidSubmissions: 0,
        errorMessage: err.message || 'Unknown synchronization error'
      };

      this.lastSyncLog = errLog;
      this.syncLogsHistory.unshift(errLog);
      await this.persistSyncLogToDb(errLog);

      return {
        success: false,
        message: err.message || 'Synchronization failed.',
        submissionsRetrieved: 0,
        newReportsImported: 0,
        duplicatesSkipped: 0,
        invalidSubmissions: 0,
        syncTimestamp: errLog.completedAt,
        issues: [],
        reports: []
      };
    } finally {
      this.isSyncInProgress = false;
    }
  }

  // ==========================================
  // DATABASE PERSISTENCE HELPERS
  // ==========================================

  private async getHousesFromDb(): Promise<HouseConfig[]> {
    try {
      const snap = await getDocs(collection(db, 'houses'));
      const houses: HouseConfig[] = [];
      snap.forEach(d => houses.push(d.data() as HouseConfig));
      if (houses.length === 8) return houses;
    } catch (err) {
      console.warn('[TallyService] Could not fetch houses from Firestore, using defaults:', err);
    }
    return DEFAULT_HOUSES;
  }

  private async getActiveTermFromDb(): Promise<AcademicTerm> {
    try {
      const snap = await getDocs(collection(db, 'terms'));
      const terms: AcademicTerm[] = [];
      snap.forEach(d => terms.push(d.data() as AcademicTerm));
      const open = terms.find(t => t.status === 'open');
      if (open) return open;
      if (terms.length > 0) return terms[0];
    } catch (err) {
      console.warn('[TallyService] Could not fetch terms from Firestore, using default:', err);
    }
    return DEFAULT_TERM;
  }

  private async getProcessedSubmissionIdsFromDb(): Promise<Set<string>> {
    const ids = new Set<string>();
    try {
      const snap = await getDocs(collection(db, 'tallySubmissions'));
      snap.forEach(d => ids.add(d.id));
    } catch (err) {
      console.warn('[TallyService] Could not fetch processed submission IDs:', err);
    }
    return ids;
  }

  private async persistHouseReportToDb(report: HouseDailyReport): Promise<void> {
    try {
      const ref = doc(db, 'houseReports', report.id);
      await setDoc(ref, { ...report, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.error(`[TallyService] Failed to persist report ${report.id} to Firestore:`, err);
      throw err;
    }
  }

  private async persistSubmissionAudit(audit: TallySubmissionAudit): Promise<void> {
    try {
      const ref = doc(db, 'tallySubmissions', audit.id);
      await setDoc(ref, audit, { merge: true });
    } catch (err) {
      console.warn(`[TallyService] Failed to persist submission audit ${audit.id}:`, err);
    }
  }

  private async persistSyncLogToDb(log: TallySyncLog): Promise<void> {
    try {
      const ref = doc(db, 'tallySyncLogs', log.id);
      await setDoc(ref, log, { merge: true });
    } catch (err) {
      console.warn('[TallyService] Failed to persist sync log to Firestore:', err);
    }
  }

  // ==========================================
  // POLLING LIFECYCLE (AUTOMATED PERIODIC SYNC)
  // ==========================================

  public startPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (!this.apiKey) {
      console.log('[TallyService] Background sync idle: TALLY_API_KEY is not configured.');
      return;
    }

    const intervalMs = Math.max(1000, this.pollIntervalSeconds * 1000);
    console.log(`[TallyService] Automated Tally API synchronization active every ${this.pollIntervalSeconds}s.`);

    this.pollTimer = setInterval(() => {
      if (!this.isSyncInProgress) {
        this.syncSubmissions('automatic').catch(err => {
          console.warn('[TallyService] Auto-sync cycle warning:', err);
        });
      }
    }, intervalMs);
  }

  public stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public restartPolling(): void {
    this.stopPolling();
    this.startPolling();
  }

  // ==========================================
  // STATUS & AUDIT GETTERS
  // ==========================================

  public getStatus(): {
    connectionStatus: TallyConnectionStatus;
    isConfigured: boolean;
    hasApiKey: boolean;
    formId: string;
    pollIntervalSeconds: number;
    pollIntervalMinutes: number;
    lastSyncTime?: string | null;
    lastSyncStatus?: 'success' | 'error' | null;
    lastSyncError?: string | null;
    isSyncInProgress: boolean;
    stats: TallyServiceStats;
  } {
    return {
      connectionStatus: this.connectionStatus,
      isConfigured: Boolean(this.apiKey),
      hasApiKey: Boolean(this.apiKey),
      formId: this.formId,
      pollIntervalSeconds: this.pollIntervalSeconds,
      pollIntervalMinutes: Math.max(1, Math.round(this.pollIntervalSeconds / 60)),
      lastSyncTime: this.lastSyncLog?.completedAt || null,
      lastSyncStatus: this.lastSyncLog?.status || null,
      lastSyncError: this.lastSyncLog?.errorMessage || null,
      isSyncInProgress: this.isSyncInProgress,
      stats: { ...this.stats }
    };
  }

  public getSyncHistory(): TallySyncLog[] {
    return this.syncLogsHistory;
  }

  public getFailedSubmissions(): TallyValidationIssue[] {
    return this.failedSubmissions;
  }
}

// Global singleton instance for server runtime
export const tallyService = new TallyIntegrationService();
