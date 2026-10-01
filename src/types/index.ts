/**
 * Core domain types for Xtreme - Weekly Duty Reminder Assistant
 */

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

export interface AppSettings {
  reminderEnabled: boolean;
  reminderDay: number; // 0 = Sunday, 1 = Monday, etc.
  reminderTime: string; // HH:mm format, e.g. "08:00"
  messageTemplate: string;
  whatsAppBehavior: 'app' | 'web' | 'prompt';
  targetGroupHint?: string;
  googleSheetUrl?: string;
  lastSyncHash?: string;
  theme?: 'dark' | 'light';
  updatedAt: string;
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
