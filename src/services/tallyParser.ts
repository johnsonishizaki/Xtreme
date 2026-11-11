import { HouseConfig, HouseDailyReport, AcademicTerm } from '../types/index.ts';
import {
  TallyQuestion,
  TallySubmission,
  TallySubmissionsApiResponse,
  TallyValidationIssue
} from '../types/tally.ts';

// EXACT 8 SUPPORTED HOUSES FOR OUR LADY OF GRACE SHS (OLAG SHS)
export const SUPPORTED_HOUSE_NAMES = [
  'St. Paul Boys',
  'St. Joseph Boys',
  'St. Mary Boys',
  'St. Thomas Boys',
  'St. Paul Girls',
  'St. Joseph Girls',
  'St. Mary Girls',
  'St. Thomas Girls'
] as const;

/**
 * Standardizes a house name string for comparison:
 * Trims whitespace, removes periods/hyphens/underscores, normalizes spaces, converts to lowercase.
 */
export function normalizeHouseName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[.\-_()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches raw input text to one of the 8 configured houses.
 * Does NOT fuzzy-match arbitrary names or invent houses.
 */
export function matchHouse(rawText: string, houses: HouseConfig[]): HouseConfig | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const clean = rawText.trim();
  const normalized = normalizeHouseName(clean);
  if (!normalized) return null;

  // 0. Check known Tally option ID map
  const knownOptionIdMap: Record<string, string> = {
    '0ef977a0-2c29-444d-b47f-1ebaa1f3c3f0': 'St. Thomas Boys',
  };
  if (knownOptionIdMap[clean]) {
    const targetName = knownOptionIdMap[clean];
    const found = houses.find(h => h.name.toLowerCase() === targetName.toLowerCase() || h.id.toLowerCase() === targetName.toLowerCase());
    if (found) return found;
  }

  // 1. Direct match on exact or normalized configured house name
  for (const h of houses) {
    if (h.name.toLowerCase() === clean.toLowerCase()) return h;
    if (h.id.toLowerCase() === clean.toLowerCase()) return h;
    if (h.houseCode && h.houseCode.toLowerCase() === clean.toLowerCase()) return h;
    if (normalizeHouseName(h.name) === normalized) return h;
  }

  // 2. Strict patron + gender matching for OLAG SHS 8 houses
  const isBoys = normalized.includes('boy') || normalized.includes('male');
  const isGirls = normalized.includes('girl') || normalized.includes('female');

  const patrons = [
    { key: 'paul', name: 'Paul' },
    { key: 'joseph', name: 'Joseph' },
    { key: 'mary', name: 'Mary' },
    { key: 'thomas', name: 'Thomas' }
  ];

  for (const p of patrons) {
    if (normalized.includes(p.key)) {
      if (isBoys) {
        const found = houses.find(
          h => normalizeHouseName(h.name).includes(p.key) && h.category === 'Boys'
        );
        if (found) return found;
      }
      if (isGirls) {
        const found = houses.find(
          h => normalizeHouseName(h.name).includes(p.key) && h.category === 'Girls'
        );
        if (found) return found;
      }
    }
  }

  return null;
}

/**
 * Validate real calendar date in YYYY-MM-DD
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;

  const [y, m, d] = trimmed.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;

  const testDate = new Date(Date.UTC(y, m - 1, d));
  return (
    testDate.getUTCFullYear() === y &&
    testDate.getUTCMonth() === m - 1 &&
    testDate.getUTCDate() === d
  );
}

/**
 * Normalizes input date from ISO, standard format, or Tally utility::today() formula into YYYY-MM-DD.
 */
export function normalizeDateString(rawDate: any, fallbackDate?: string): string | null {
  const getFallback = () => {
    if (fallbackDate) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(fallbackDate) && isValidCalendarDate(fallbackDate)) {
        return fallbackDate;
      }
      if (fallbackDate.includes('T')) {
        const part = fallbackDate.split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(part) && isValidCalendarDate(part)) {
          return part;
        }
      }
    }
    return new Date().toISOString().split('T')[0];
  };

  if (!rawDate || rawDate === undefined || rawDate === null) return getFallback();

  if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim();
    if (!trimmed) return getFallback();

    const lower = trimmed.toLowerCase();
    // Tally formula / expression values: utility::today(), utility::today, today(), today, now()
    if (
      lower.includes('today') ||
      lower.includes('utility') ||
      lower === 'now' ||
      lower.includes('now()') ||
      lower.includes('current_date')
    ) {
      return getFallback();
    }

    // Direct YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return isValidCalendarDate(trimmed) ? trimmed : null;
    }

    // ISO 8601 string e.g. 2026-11-08T00:00:00.000Z
    if (trimmed.includes('T')) {
      const part = trimmed.split('T')[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
        return isValidCalendarDate(part) ? part : null;
      }
    }

    // Attempt parse
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getUTCFullYear();
      const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
      const d = String(parsed.getUTCDate()).padStart(2, '0');
      const formatted = `${y}-${m}-${d}`;
      if (isValidCalendarDate(formatted)) return formatted;
    }
    return null;
  }

  if (typeof rawDate === 'number') {
    const timestamp = rawDate < 10000000000 ? rawDate * 1000 : rawDate;
    const parsed = new Date(timestamp);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getUTCFullYear();
      const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
      const d = String(parsed.getUTCDate()).padStart(2, '0');
      const formatted = `${y}-${m}-${d}`;
      if (isValidCalendarDate(formatted)) return formatted;
    }
  }

  return getFallback();
}

/**
 * Strictly validates and parses a non-negative whole integer.
 */
export function parseNonNegativeInteger(
  val: any,
  isOptional: boolean = false
): { valid: boolean; value: number; reason?: string } {
  if (val === undefined || val === null || val === '') {
    if (isOptional) {
      return { valid: true, value: 0 };
    }
    return { valid: false, value: 0, reason: 'Value is required and cannot be empty.' };
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val) || val < 0 || !Number.isInteger(val)) {
      return { valid: false, value: 0, reason: `Value must be a non-negative whole integer (received ${val}).` };
    }
    return { valid: true, value: val };
  }

  const str = String(val).trim();
  if (str === '') {
    if (isOptional) {
      return { valid: true, value: 0 };
    }
    return { valid: false, value: 0, reason: 'Value is required and cannot be empty.' };
  }

  if (!/^\d+$/.test(str)) {
    return { valid: false, value: 0, reason: `Value must be a non-negative whole integer (received "${str}").` };
  }

  const num = parseInt(str, 10);
  if (isNaN(num) || num < 0) {
    return { valid: false, value: 0, reason: `Value must be >= 0 (received "${str}").` };
  }

  return { valid: true, value: num };
}

/**
 * Extracts a clean string value from various Tally answer representations:
 * string, array of strings, object with value/label/text, or option IDs.
 */
export function extractStringAnswer(answer: any, question?: TallyQuestion): string {
  if (answer === null || answer === undefined) return '';
  if (typeof answer === 'string') return answer.trim();
  if (typeof answer === 'number') return String(answer);

  if (Array.isArray(answer)) {
    if (answer.length === 0) return '';
    const first = answer[0];
    if (typeof first === 'string') {
      // Check if this string is an option ID in the question
      if (question?.options && Array.isArray(question.options)) {
        const matchedOption = question.options.find(opt => opt.id === first);
        if (matchedOption) return matchedOption.text.trim();
      }
      return first.trim();
    }
    if (typeof first === 'object' && first !== null) {
      return String(first.text || first.label || first.value || '').trim();
    }
  }

  if (typeof answer === 'object' && answer !== null) {
    if (question?.options && Array.isArray(question.options) && answer.id) {
      const matched = question.options.find(opt => opt.id === answer.id);
      if (matched) return matched.text.trim();
    }
    return String(answer.text || answer.label || answer.value || '').trim();
  }

  return String(answer).trim();
}

export interface TallyFieldMapping {
  reportingDateQuestionId?: string;
  houseQuestionId?: string;
  reportedQuestionId?: string;
  newArrivalsQuestionId?: string;
  notesQuestionId?: string;
}

/**
 * Identifies question IDs for the 5 target fields based on question titles.
 */
export function detectTallyQuestionMapping(questions: TallyQuestion[]): TallyFieldMapping {
  const mapping: TallyFieldMapping = {};

  for (const q of questions) {
    const title = (q.title || '').toLowerCase().trim();

    // 1. Reporting Date
    if (
      !mapping.reportingDateQuestionId &&
      (title.includes('reporting date') ||
        title === 'date' ||
        (title.includes('date') && !title.includes('arrival')))
    ) {
      mapping.reportingDateQuestionId = q.id;
      continue;
    }

    // 2. House
    if (!mapping.houseQuestionId && (title.includes('house') || title.includes('dorm'))) {
      mapping.houseQuestionId = q.id;
      continue;
    }

    // 3. Number of Students Present
    if (
      !mapping.reportedQuestionId &&
      (title.includes('present') ||
        title.includes('students present') ||
        title.includes('reported') ||
        (title.includes('number of students') && !title.includes('arrival')))
    ) {
      mapping.reportedQuestionId = q.id;
      continue;
    }

    // 4. Number of New Arrivals
    if (!mapping.newArrivalsQuestionId && (title.includes('arrival') || title.includes('new arrivals'))) {
      mapping.newArrivalsQuestionId = q.id;
      continue;
    }

    // 5. Notes / Reasons
    if (
      !mapping.notesQuestionId &&
      (title.includes('note') ||
        title.includes('reason') ||
        title.includes('not present') ||
        title.includes('absent'))
    ) {
      mapping.notesQuestionId = q.id;
      continue;
    }
  }

  return mapping;
}

export interface ParsedTallySubmissionResult {
  valid: boolean;
  report?: HouseDailyReport;
  issue?: TallyValidationIssue;
  isDuplicate?: boolean;
}

/**
 * Parses and strictly validates a single Tally submission.
 */
export function parseAndValidateSubmission(
  submission: TallySubmission,
  mapping: TallyFieldMapping,
  questions: TallyQuestion[],
  houses: HouseConfig[],
  term?: AcademicTerm
): ParsedTallySubmissionResult {
  const subId = submission.id?.trim();
  if (!subId) {
    return {
      valid: false,
      issue: {
        submissionId: 'unknown',
        reason: 'Submission is missing unique identifier (submission.id).'
      }
    };
  }

  // Create question lookup
  const qMap = new Map<string, TallyQuestion>();
  for (const q of questions) {
    qMap.set(q.id, q);
  }

  // Extract raw responses
  const responseMap = new Map<string, any>();
  for (const item of submission.responses || []) {
    responseMap.set(item.questionId, item.answer);
  }

  const rawDate = mapping.reportingDateQuestionId
    ? extractStringAnswer(responseMap.get(mapping.reportingDateQuestionId), qMap.get(mapping.reportingDateQuestionId))
    : '';

  const rawHouse = mapping.houseQuestionId
    ? extractStringAnswer(responseMap.get(mapping.houseQuestionId), qMap.get(mapping.houseQuestionId))
    : '';

  const rawReported = mapping.reportedQuestionId
    ? responseMap.get(mapping.reportedQuestionId)
    : undefined;

  const rawArrivals = mapping.newArrivalsQuestionId
    ? responseMap.get(mapping.newArrivalsQuestionId)
    : undefined;

  const rawNotes = mapping.notesQuestionId
    ? extractStringAnswer(responseMap.get(mapping.notesQuestionId), qMap.get(mapping.notesQuestionId))
    : '';

  // Extract creation date for fallback if reporting date is hidden or utility::today()
  const submissionTimestamp = submission.createdAt || new Date().toISOString();
  const submissionDateOnly = submissionTimestamp.includes('T') ? submissionTimestamp.split('T')[0] : submissionTimestamp;
  const dateToValidate = rawDate && String(rawDate).trim() ? rawDate : submissionDateOnly;

  // 1. Validate reporting date (supports utility::today() and hidden date fields)
  const normalizedDate = normalizeDateString(dateToValidate, submissionDateOnly);
  if (!normalizedDate) {
    return {
      valid: false,
      issue: {
        submissionId: subId,
        reportingDate: String(rawDate),
        rawHouse,
        rawReported,
        reason: `Invalid reporting date "${rawDate}". Must be a valid calendar date in YYYY-MM-DD format.`
      }
    };
  }

  // 2. Validate house (must match one of 8 houses)
  const matchedHouse = matchHouse(rawHouse, houses);
  if (!matchedHouse) {
    return {
      valid: false,
      issue: {
        submissionId: subId,
        reportingDate: normalizedDate,
        rawHouse,
        rawReported,
        reason: `Unrecognized house "${rawHouse}". House does not match any of the 8 supported houses.`
      }
    };
  }

  // 3. Validate number of students present (non-negative whole integer)
  const parsedReported = parseNonNegativeInteger(rawReported, false);
  if (!parsedReported.valid) {
    return {
      valid: false,
      issue: {
        submissionId: subId,
        reportingDate: normalizedDate,
        rawHouse,
        rawReported,
        reason: parsedReported.reason || `Reported students count "${rawReported}" is invalid.`
      }
    };
  }
  const reportedNum = parsedReported.value;

  // 4. Validate new arrivals (optional, non-negative whole integer)
  const parsedArrivals = parseNonNegativeInteger(rawArrivals, true);
  if (!parsedArrivals.valid) {
    return {
      valid: false,
      issue: {
        submissionId: subId,
        reportingDate: normalizedDate,
        rawHouse,
        rawArrivals,
        reason: parsedArrivals.reason || `New arrivals count "${rawArrivals}" is invalid.`
      }
    };
  }
  const arrivalsNum = parsedArrivals.value;

  // 5. Timestamp validation
  let submissionIso = new Date().toISOString();
  if (submission.submittedAt) {
    const parsedTime = Date.parse(submission.submittedAt);
    if (!isNaN(parsedTime)) {
      submissionIso = new Date(parsedTime).toISOString();
    }
  }

  // 6. Expected count & calculations
  const expectedCount =
    term?.houseExpectedCounts?.[matchedHouse.id] ??
    matchedHouse.expectedStudentCount ??
    120;

  const notReportedCount = Math.max(0, expectedCount - reportedNum);
  const reportId = `${normalizedDate}_${matchedHouse.id}`;

  const report: HouseDailyReport = {
    id: reportId,
    termId: term?.id || 'term-1',
    reportingDate: normalizedDate,
    houseId: matchedHouse.id,
    houseName: matchedHouse.name,
    houseCategory: matchedHouse.category,
    expectedCount,
    reportedCount: reportedNum,
    notReportedCount,
    newArrivalsCount: arrivalsNum,
    notReportedDetails: rawNotes.trim(),
    notes: rawNotes.trim(),
    houseparent: matchedHouse.assignedHouseparent,
    houseparentName: matchedHouse.assignedHouseparent,
    submittedAt: submissionIso,
    updatedAt: new Date().toISOString(),
    status: notReportedCount === 0 ? 'complete' : 'follow_up_needed',
    source: 'tally_api',
    tallySubmissionId: subId,
    tallyFormId: submission.formId || '2jBVWA',
    syncTimestamp: new Date().toISOString()
  };

  return {
    valid: true,
    report
  };
}

/**
 * Processes a full Tally submissions API response:
 * Detects mapping, validates submissions, resolves duplicates (latest submission wins per date+house).
 */
export function processTallyApiResponse(
  apiResponse: TallySubmissionsApiResponse,
  houses: HouseConfig[],
  term?: AcademicTerm,
  alreadyProcessedSubmissionIds: Set<string> = new Set()
): {
  validReports: HouseDailyReport[];
  reviewIssues: TallyValidationIssue[];
  duplicatesSkipped: number;
  totalSubmissions: number;
} {
  const submissions = apiResponse.submissions || [];
  const questions = apiResponse.questions || [];
  const mapping = detectTallyQuestionMapping(questions);

  const validReportsMap = new Map<string, { report: HouseDailyReport; timestamp: number }>();
  const reviewIssues: TallyValidationIssue[] = [];
  let duplicatesSkipped = 0;

  for (const sub of submissions) {
    // Skip if already imported in past syncs
    if (alreadyProcessedSubmissionIds.has(sub.id)) {
      duplicatesSkipped++;
      continue;
    }

    const res = parseAndValidateSubmission(sub, mapping, questions, houses, term);
    if (!res.valid || !res.report) {
      if (res.issue) {
        reviewIssues.push(res.issue);
      }
      continue;
    }

    const candidate = res.report;
    const subTimestamp = Date.parse(candidate.submittedAt) || 0;
    const existing = validReportsMap.get(candidate.id);

    if (!existing || subTimestamp >= existing.timestamp) {
      if (existing) {
        duplicatesSkipped++; // Superseded earlier submission within the same payload
      }
      validReportsMap.set(candidate.id, {
        report: candidate,
        timestamp: subTimestamp
      });
    } else {
      duplicatesSkipped++;
    }
  }

  return {
    validReports: Array.from(validReportsMap.values()).map(v => v.report),
    reviewIssues,
    duplicatesSkipped,
    totalSubmissions: submissions.length
  };
}
