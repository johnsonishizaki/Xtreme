import {
  TallyConnectionStatus,
  TallySyncLog,
  TallySyncResult,
  TallyValidationIssue
} from '../types/tally.ts';

export interface TallyStatusResponse {
  success: boolean;
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
  stats: {
    totalRetrieved: number;
    totalImported: number;
    totalDuplicatesSkipped: number;
    totalInvalid: number;
  };
  error?: string;
}

export async function getTallyStatus(): Promise<TallyStatusResponse> {
  const res = await fetch('/api/tally/status');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: Failed to get Tally status`);
  }
  return res.json();
}

export async function testTallyConnection(): Promise<{
  status: TallyConnectionStatus;
  message: string;
  sampleCount?: number;
}> {
  const res = await fetch('/api/tally/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function saveTallyConfig(config: {
  apiKey?: string;
  formId?: string;
  pollIntervalSeconds?: number;
  pollIntervalMinutes?: number;
}): Promise<{ success: boolean; status: any }> {
  const res = await fetch('/api/tally/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save configuration (${res.status})`);
  }
  return res.json();
}

export async function syncTallyNow(): Promise<TallySyncResult> {
  const res = await fetch('/api/tally/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'manual' })
  });
  const data = await res.json();
  return data;
}

export async function getTallySyncHistory(): Promise<TallySyncLog[]> {
  const res = await fetch('/api/tally/history');
  if (!res.ok) return [];
  const data = await res.json();
  return data.history || [];
}

export async function getTallyFailedSubmissions(): Promise<TallyValidationIssue[]> {
  const res = await fetch('/api/tally/failed-submissions');
  if (!res.ok) return [];
  const data = await res.json();
  return data.issues || [];
}
