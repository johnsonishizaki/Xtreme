/**
 * Core domain types for Xtreme - Private Operational Assistant for Senior Houseparent
 */

// ========================
// 1. TEACHER DUTY DOMAIN
// ========================

export interface DutyTeacher {
  id: string;
  name: string;
  role?: string;
}

export interface DutyAssignment {
  id: string;
  rosterId: string;
  weekLabel: string; // e.g. "21 - 27 September 2026"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  teachers: DutyTeacher[];
  dutyTitle: string; // e.g. "Weekly Duty" or "Gate & Morning Assembly"
  status: 'confirmed' | 'needs_review';
  confidence: 'high' | 'review_needed';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Roster {
  id: string;
  name: string;
  sourceType: 'excel' | 'csv' | 'pdf' | 'sheets' | 'sample' | 'image';
  totalWeeks: number;
  uploadedAt: string;
  isActive: boolean;
  notes?: string;
}

export interface SendHistory {
  id: string;
  assignmentId: string;
  weekLabel: string;
  dutyPeriod: string;
  message: string;
  timestamp: string;
  status: 'copied' | 'sent_confirmed';
}

export interface ParsedRosterPayload {
  rosterName: string;
  sourceType: Roster['sourceType'];
  assignments: Array<{
    weekLabel: string;
    startDate: string;
    endDate: string;
    teachers: Array<{ name: string; role?: string }>;
    dutyTitle?: string;
    confidence: 'high' | 'review_needed';
    reviewReason?: string;
  }>;
  method: 'deterministic' | 'ai';
  warnings?: string[];
}

// ========================
// 2. HOUSE REPORTING DOMAIN
// ========================

export type HouseCategory = 'Boys' | 'Girls';

export interface HouseConfig {
  id: string; // e.g. "house-1"
  name: string; // Configurable house name (e.g. "House 1")
  category: HouseCategory;
  assignedHouseparent: string; // Configurable (e.g. "Houseparent 1") - strictly NO personal names
  houseparentPhone?: string;
  houseCode?: string; // e.g. "H1"
  expectedStudentCount: number;
  active: boolean;
  displayOrder: number;
}

export interface AcademicTerm {
  id: string;
  academicYear: string; // e.g. "2026/2027"
  termName: string; // e.g. "Term 1"
  openingDate: string; // YYYY-MM-DD
  reportingStartDate: string; // YYYY-MM-DD
  reportingEndDate: string; // YYYY-MM-DD
  status: 'open' | 'closed';
  houseExpectedCounts?: Record<string, number>; // houseId -> expected count for this term
  createdAt: string;
  updatedAt: string;
}

export interface HouseDailyReport {
  id: string; // e.g. "2026-10-07_house-1" (logical identifier: reportingDate + '_' + houseId)
  termId: string;
  reportingDate: string; // YYYY-MM-DD
  houseId: string;
  houseName: string;
  houseCategory: HouseCategory;
  expectedCount: number;
  reportedCount: number;
  notReportedCount: number; // expected - reported
  newArrivalsCount?: number;
  notReportedDetails?: string; // Follow-up notes/reasons submitted by houseparent
  notes?: string;
  houseparent?: string; // Title / identifier
  houseparentName?: string;
  submittedAt: string; // ISO string
  updatedAt: string; // ISO string
  status: 'received' | 'updated' | 'corrected' | 'complete' | 'follow_up_needed';
  source?: 'google_form' | 'google_sheet' | 'manual_correction' | 'universal_form' | 'feed_csv' | 'tally_api';
  tallySubmissionId?: string;
  tallyFormId?: string;
  syncTimestamp?: string;
}

export interface DailyCollation {
  reportingDate: string;
  termId: string;
  totalExpected: number;
  totalReported: number;
  totalNotReported: number;
  reportingPercentage: number;
  reportsReceivedCount: number;
  totalHousesCount: number;
  boysExpected: number;
  boysReported: number;
  boysNotReported: number;
  boysPercentage: number;
  girlsExpected: number;
  girlsReported: number;
  girlsNotReported: number;
  girlsPercentage: number;
  missingHouseIds: string[];
  followUpHousesCount: number;
}

// ========================
// 3. SETTINGS & APP CONFIG
// ========================

export interface AppSettings {
  // Duty Reminder Settings
  reminderEnabled: boolean;
  reminderDay: number; // 0 = Sunday, 1 = Monday, etc.
  reminderTime: string; // HH:mm format, e.g. "08:00"
  messageTemplate: string;
  whatsAppBehavior: 'app' | 'web' | 'prompt';
  targetGroupHint?: string;
  googleSheetUrl?: string;
  lastSyncHash?: string;

  // House Reporting Settings
  activeTermId?: string;
  warningOutstandingThreshold?: number; // e.g. 1
  criticalOutstandingRateThreshold?: number; // e.g. 10%
  googleFormUrl?: string; // Base Google Form URL for house reporting
  googleFormHouseEntryId?: string; // Entry ID for prefilled house name
  googleSheetSyncUrl?: string; // Apps Script Webhook or Sheet sync URL
  feedCsvUrl?: string; // Published Google Sheets CSV URL for Xtreme Feed tab
  lastFeedSyncTime?: string;
  lastFeedSyncError?: string;

  // Tally Integration Settings (Form 2jBVWA)
  tallyFormId?: string;
  tallyApiKeyConfigured?: boolean;
  tallyPollIntervalMinutes?: number;
  lastTallySyncTime?: string;
  lastTallySyncStatus?: 'success' | 'error';
  lastTallySyncError?: string;

  // Push notifications
  pushNotificationsEnabled?: boolean;
  fcmToken?: string;

  theme?: 'dark' | 'light';
  updatedAt: string;
}

export * from './tally.ts';
