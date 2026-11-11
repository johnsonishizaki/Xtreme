/**
 * Tally API & Integration Domain Types
 * For universal Tally form: "Xtreme | Daily House Report" (Form ID: 2jBVWA)
 */

export interface TallyQuestionField {
  uuid?: string;
  type?: string;
  questionType?: string;
  title?: string;
}

export interface TallyQuestionOption {
  id: string;
  text: string;
}

export interface TallyQuestion {
  id: string;
  type: string;
  title: string;
  fields?: TallyQuestionField[];
  options?: TallyQuestionOption[];
}

export interface TallyResponseItem {
  id?: string;
  questionId: string;
  answer: any;
}

export interface TallySubmission {
  id: string;
  formId: string;
  respondentId?: string;
  isCompleted?: boolean;
  submittedAt: string;
  createdAt?: string;
  updatedAt?: string;
  responses: TallyResponseItem[];
}

export interface TallySubmissionsApiResponse {
  page?: number;
  limit?: number;
  hasMore?: boolean;
  totalNumberOfSubmissionsPerFilter?: {
    all?: number;
    completed?: number;
    partial?: number;
  };
  questions: TallyQuestion[];
  submissions: TallySubmission[];
}

export type TallyConnectionStatus =
  | 'connected'
  | 'not_configured'
  | 'auth_failed'
  | 'connection_error';

export interface TallyConfig {
  formId: string;
  hasApiKey: boolean;
  pollIntervalSeconds: number;
  pollIntervalMinutes: number;
  lastSyncTime?: string | null;
  lastSyncStatus?: 'success' | 'error' | null;
  lastSyncError?: string | null;
}

export interface TallyValidationIssue {
  submissionId: string;
  reportingDate?: string;
  rawHouse?: string;
  rawReported?: any;
  rawArrivals?: any;
  rawNotes?: any;
  reason: string;
  submittedAt?: string;
}

export interface TallySubmissionAudit {
  id: string; // Tally submission ID
  formId: string;
  reportingDate: string;
  houseId: string;
  houseName: string;
  reportedCount: number;
  newArrivalsCount: number;
  notReportedDetails?: string;
  notes?: string;
  submittedAt: string;
  synchronizedAt: string;
  importStatus: 'imported' | 'skipped_duplicate' | 'validation_failed' | 'superseded';
  reportId?: string;
  validationErrors?: string[];
  rawPayload?: any;
}

export interface TallySyncLog {
  id: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: 'success' | 'error';
  trigger: 'automatic' | 'manual';
  submissionsRetrieved: number;
  newReportsImported: number;
  duplicatesSkipped: number;
  invalidSubmissions: number;
  errorMessage?: string | null;
  issues?: TallyValidationIssue[];
}

export interface TallySyncResult {
  success: boolean;
  message: string;
  submissionsRetrieved: number;
  newReportsImported: number;
  duplicatesSkipped: number;
  invalidSubmissions: number;
  syncTimestamp: string;
  issues: TallyValidationIssue[];
  reports: any[];
}
