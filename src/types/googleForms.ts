/**
 * Domain types for Google Forms Attendance Integration
 * Architecture: Google Forms (Daily House Report) -> Google Sheets -> Google Apps Script -> Xtreme Backend Endpoint
 */

export interface GoogleFormsAttendancePayload {
  /** Unique submission/response identifier (e.g. from FormResponse.getId() or sheet row ID) */
  submissionId: string;
  /** Attendance reporting date in YYYY-MM-DD format */
  reportingDate: string;
  /** House name (must match one of the 8 OLAG houses) */
  house: string;
  /** Number of students present (non-negative whole integer) */
  reportedCount: number;
  /** Number of new arrivals (non-negative whole integer, optional, defaults to 0) */
  newArrivalsCount?: number;
  /** Optional notes or reasons for absent students */
  notes?: string;
  /** ISO timestamp when the response was submitted in Google Forms */
  submittedAt?: string;
  /** Optional houseparent name/identifier */
  houseparent?: string;
}

export interface GoogleFormsSubmissionRecord {
  id: string;
  submissionId: string;
  reportId: string;
  houseId: string;
  houseName: string;
  houseCategory: 'Boys' | 'Girls';
  reportingDate: string;
  reportedCount: number;
  newArrivalsCount: number;
  expectedCount: number;
  notReportedCount: number;
  notes: string;
  submittedAt: string;
  receivedAt: string;
  status: 'imported' | 'rejected';
  source: 'google_forms_apps_script';
}

export interface GoogleFormsReceiverResponse {
  success: boolean;
  message?: string;
  error?: string;
  submissionId?: string;
  reportId?: string;
  house?: string;
  reportingDate?: string;
  reportedCount?: number;
  newArrivalsCount?: number;
  expectedCount?: number;
  notReportedCount?: number;
  duplicate?: boolean;
}
