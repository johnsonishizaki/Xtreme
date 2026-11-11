import { HouseConfig, AcademicTerm, HouseDailyReport } from '../types/index.ts';
import {
  matchHouse,
  isValidCalendarDate,
  parseNonNegativeInteger,
  normalizeDateString
} from './tallyParser.ts';

export interface TallyWebhookField {
  key: string;
  label: string;
  type: string;
  value: any;
}

export interface TallyWebhookPayload {
  eventId: string;
  eventType: string;
  createdAt: string;
  data: {
    responseId: string;
    submissionId: string;
    formId: string;
    formName: string;
    createdAt?: string;
    fields: TallyWebhookField[];
  };
}

export interface ValidTallyWebhookResult {
  valid: true;
  submissionId: string;
  eventId: string;
  formId: string;
  report: HouseDailyReport;
  house: HouseConfig;
  isCorrection?: boolean;
}

export interface InvalidTallyWebhookResult {
  valid: false;
  statusCode: number;
  error: string;
  submissionId?: string;
}

/**
 * Resolves a Tally field value, unpacking option IDs using field.options array, objects, or arrays.
 */
export function resolveTallyFieldValue(f: TallyWebhookField): any {
  if (!f) return '';
  const val = f.value;
  const rawOptions = (f as any).options;
  const options = Array.isArray(rawOptions) ? rawOptions : [];

  const resolveItem = (v: any): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      const text = v.text || v.label || v.value;
      if (text) return String(text).trim();
      if (v.id) return resolveItem(v.id);
    }
    const strVal = String(v).trim();
    if (!strVal) return '';

    // 1. Check options array in field
    if (options.length > 0) {
      const matched = options.find((opt: any) =>
        opt && (opt.id === strVal || opt.value === strVal || opt.key === strVal)
      );
      if (matched) {
        const text = matched.text || matched.label || matched.value;
        if (text) return String(text).trim();
      }
    }

    // 2. Check known Option ID mapping for Tally form 2jBVWA
    const knownOptionMap: Record<string, string> = {
      '0ef977a0-2c29-444d-b47f-1ebaa1f3c3f0': 'St. Thomas Boys',
    };
    if (knownOptionMap[strVal]) {
      return knownOptionMap[strVal];
    }

    return strVal;
  };

  if (Array.isArray(val)) {
    if (val.length === 0) return '';
    const resolvedItems = val.map(resolveItem).filter(Boolean);
    return resolvedItems.length > 0 ? resolvedItems[0] : '';
  }

  return resolveItem(val);
}

/**
 * Validates and parses incoming Tally FORM_RESPONSE webhook payloads.
 */
export function parseTallyWebhookPayload(
  rawPayload: any,
  expectedFormId: string,
  houses: HouseConfig[],
  term?: AcademicTerm,
  processedSubmissionIds: Set<string> = new Set()
): ValidTallyWebhookResult | InvalidTallyWebhookResult {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return { valid: false, statusCode: 400, error: 'Invalid JSON body in webhook payload.' };
  }

  // 1. Validate eventType
  if (rawPayload.eventType !== 'FORM_RESPONSE') {
    return {
      valid: false,
      statusCode: 400,
      error: `Unsupported eventType "${rawPayload.eventType}". Expected "FORM_RESPONSE".`
    };
  }

  const data = rawPayload.data;
  if (!data || typeof data !== 'object') {
    return { valid: false, statusCode: 400, error: 'Missing required "data" object in webhook payload.' };
  }

  // 2. Validate Form ID
  if (data.formId && data.formId !== expectedFormId) {
    return {
      valid: false,
      statusCode: 400,
      error: `Form ID mismatch ("${data.formId}" != expected "${expectedFormId}").`
    };
  }

  // 3. Submission Identifier
  const rawSubId = data.submissionId || data.responseId || rawPayload.eventId;
  if (!rawSubId || typeof rawSubId !== 'string' || !rawSubId.trim()) {
    return { valid: false, statusCode: 400, error: 'Missing required "submissionId" or "responseId".' };
  }
  const submissionId = rawSubId.trim();

  // Deduplication check
  if (processedSubmissionIds.has(submissionId)) {
    return {
      valid: false,
      statusCode: 200,
      submissionId,
      error: `Submission "${submissionId}" was already processed.`
    };
  }

  // 4. Extract fields by searching labels, keys, types & resolving option IDs
  const fields: TallyWebhookField[] = Array.isArray(data.fields) ? data.fields : [];
  let rawDate: any = '';
  let rawHouse: any = '';
  let rawReported: any = undefined;
  let rawArrivals: any = undefined;
  let rawNotes: any = '';

  for (const f of fields) {
    const label = String(f.label || '').toLowerCase().trim();
    const key = String(f.key || '').toLowerCase().trim();
    const type = String(f.type || '').toLowerCase().trim();
    const resolvedVal = resolveTallyFieldValue(f);

    // 1. Reporting Date (matches "date", "reporting date", hidden fields, utility::today)
    if (
      !rawDate &&
      (label.includes('date') ||
        key.includes('date') ||
        type.includes('date') ||
        label.includes('today') ||
        key.includes('today') ||
        (typeof resolvedVal === 'string' &&
          (resolvedVal.toLowerCase().includes('today') || resolvedVal.toLowerCase().includes('utility'))))
    ) {
      rawDate = resolvedVal;
    }
    // 2. House Selection
    else if (!rawHouse && (label.includes('house') || label.includes('dorm') || key.includes('house') || key.includes('dorm'))) {
      rawHouse = resolvedVal;
    }
    // 3. Students Present / Reported Count
    else if (
      rawReported === undefined &&
      (label.includes('present') ||
        label.includes('reported') ||
        label.includes('students') ||
        label.includes('attendance') ||
        key.includes('present') ||
        key.includes('reported') ||
        key.includes('students') ||
        key.includes('attendance'))
    ) {
      rawReported = resolvedVal;
    }
    // 4. New Arrivals Count
    else if (
      rawArrivals === undefined &&
      (label.includes('arrival') || label.includes('new') || key.includes('arrival') || key.includes('new'))
    ) {
      rawArrivals = resolvedVal;
    }
    // 5. Notes / Absentees / Remarks
    else if (
      !rawNotes &&
      (label.includes('note') ||
        label.includes('reason') ||
        label.includes('comment') ||
        label.includes('remark') ||
        label.includes('detail') ||
        label.includes('absent') ||
        key.includes('note') ||
        key.includes('reason') ||
        key.includes('comment'))
    ) {
      rawNotes = resolvedVal;
    }
  }

  // Determine submission creation timestamp
  const submissionTimestamp = data.createdAt || rawPayload.createdAt || new Date().toISOString();
  const submissionDateOnly = submissionTimestamp.includes('T')
    ? submissionTimestamp.split('T')[0]
    : submissionTimestamp;

  // If date was omitted, hidden, or blank, automatically default to the submission creation date
  if (!rawDate || String(rawDate).trim() === '') {
    rawDate = submissionDateOnly;
  }

  // 5. Validate Date (Strict YYYY-MM-DD calendar check with automatic utility::today() resolution)
  const normalizedDate = normalizeDateString(rawDate, submissionDateOnly);
  if (!normalizedDate || !isValidCalendarDate(normalizedDate)) {
    return {
      valid: false,
      statusCode: 400,
      submissionId,
      error: `Invalid reporting date "${rawDate}". Must be a valid calendar date in YYYY-MM-DD format.`
    };
  }

  // 6. Validate House (Strict match against 8 OLAG houses)
  if (!rawHouse) {
    return {
      valid: false,
      statusCode: 400,
      submissionId,
      error: 'Missing required field: House selection.'
    };
  }
  const matchedHouse = matchHouse(String(rawHouse), houses);
  if (!matchedHouse) {
    const validNames = houses.map(h => h.name).join(', ');
    return {
      valid: false,
      statusCode: 400,
      submissionId,
      error: `Unrecognized house "${rawHouse}". Must match one of the 8 OLAG houses: ${validNames}.`
    };
  }

  // 7. Validate Reported Students Count (Strict whole non-negative integer, reject decimals or invalid strings)
  const parsedReported = parseNonNegativeInteger(rawReported, false);
  if (!parsedReported.valid) {
    return {
      valid: false,
      statusCode: 400,
      submissionId,
      error: `Invalid student present count: ${parsedReported.reason || 'Must be a non-negative whole integer.'}`
    };
  }
  const reportedCount = parsedReported.value;

  // 8. Validate New Arrivals Count (Strict non-negative integer if provided)
  const parsedArrivals = parseNonNegativeInteger(rawArrivals, true);
  if (!parsedArrivals.valid) {
    return {
      valid: false,
      statusCode: 400,
      submissionId,
      error: `Invalid new arrivals count: ${parsedArrivals.reason || 'Must be a non-negative whole integer.'}`
    };
  }
  const newArrivalsCount = parsedArrivals.value;

  // 9. Capacity calculation (dynamic from term/house)
  const expectedCount =
    term?.houseExpectedCounts?.[matchedHouse.id] ??
    matchedHouse.expectedStudentCount ??
    120;

  const notReportedCount = Math.max(0, expectedCount - reportedCount);
  const notes = typeof rawNotes === 'string' ? rawNotes.trim() : String(rawNotes || '').trim();

  let submittedAtIso = new Date().toISOString();
  if (data.createdAt || rawPayload.createdAt) {
    const parsedTime = Date.parse(data.createdAt || rawPayload.createdAt);
    if (!isNaN(parsedTime)) {
      submittedAtIso = new Date(parsedTime).toISOString();
    }
  }

  const reportId = `${normalizedDate}_${matchedHouse.id}`;

  const report: HouseDailyReport = {
    id: reportId,
    termId: term?.id || 'term-2026-2027-t1',
    reportingDate: normalizedDate,
    houseId: matchedHouse.id,
    houseName: matchedHouse.name,
    houseCategory: matchedHouse.category,
    expectedCount,
    reportedCount,
    notReportedCount,
    newArrivalsCount,
    notReportedDetails: notes,
    notes,
    houseparent: matchedHouse.assignedHouseparent,
    submittedAt: submittedAtIso,
    updatedAt: new Date().toISOString(),
    status: 'received',
    source: 'tally_api',
    tallySubmissionId: submissionId,
    tallyFormId: expectedFormId
  };

  return {
    valid: true,
    submissionId,
    eventId: rawPayload.eventId || submissionId,
    formId: expectedFormId,
    report,
    house: matchedHouse
  };
}
