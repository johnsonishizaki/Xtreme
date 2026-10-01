import { DutyAssignment, ParsedRosterPayload } from '../types';
import { parseRosterWithAI } from './aiParserClient';

// Helper to format Date to YYYY-MM-DD
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Helper to clean and split teacher names
export function extractTeacherNames(raw: string): string[] {
  if (!raw) return [];
  // Split on newlines, " & ", " and ", semicolons, or commas (if not "LastName, FirstName")
  const cleaned = raw.replace(/\r/g, '').trim();
  const tokens = cleaned.split(/\n|;| & | and /i);
  const names: string[] = [];

  for (const token of tokens) {
    const trimmed = token.trim().replace(/^[-*•\d.]+\s*/, '');
    if (trimmed && trimmed.length > 1 && !/^(n\/a|none|nil|tba|vacant|-)$/i.test(trimmed)) {
      names.push(trimmed);
    }
  }

  return names.length > 0 ? names : (cleaned ? [cleaned] : []);
}

// Heuristic date range parsing
export function parseDateRange(dateCell: any): { startDate: string; endDate: string; weekLabel: string } | null {
  if (!dateCell) return null;

  // If already a JS Date object from SheetJS cellDates
  if (dateCell instanceof Date && !isNaN(dateCell.getTime())) {
    const start = new Date(dateCell);
    const end = new Date(dateCell);
    end.setDate(start.getDate() + 6); // standard 7-day week
    const startDate = toISODate(start);
    const endDate = toISODate(end);
    const label = `${start.getDate()} - ${end.getDate()} ${start.toLocaleString('en-GB', { month: 'short', year: 'numeric' })}`;
    return { startDate, endDate, weekLabel: label };
  }

  const str = String(dateCell).trim();
  if (!str) return null;

  // Look for standard range formats like "21/09/2026 - 27/09/2026" or "2026-09-21 to 2026-09-27"
  const rangeMatch = str.match(/(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})\s*(?:-|–|—|to)\s*(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})/i);
  if (rangeMatch) {
    const sDate = parseSingleDate(rangeMatch[1]);
    const eDate = parseSingleDate(rangeMatch[2]);
    if (sDate && eDate) {
      return {
        startDate: toISODate(sDate),
        endDate: toISODate(eDate),
        weekLabel: str
      };
    }
  }

  // Look for format like "21 - 27 September 2026" or "21-27 Sep 2026"
  const dayRangeMonthMatch = str.match(/(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s+([A-Za-z]+)\s*(\d{4})?/i);
  if (dayRangeMonthMatch) {
    const day1 = parseInt(dayRangeMonthMatch[1], 10);
    const day2 = parseInt(dayRangeMonthMatch[2], 10);
    const monthName = dayRangeMonthMatch[3];
    const year = dayRangeMonthMatch[4] ? parseInt(dayRangeMonthMatch[4], 10) : 2026;

    const testDate = new Date(`${monthName} 1, ${year}`);
    if (!isNaN(testDate.getTime())) {
      const monthIdx = testDate.getMonth();
      const start = new Date(year, monthIdx, day1);
      const end = new Date(year, monthIdx, day2);
      return {
        startDate: toISODate(start),
        endDate: toISODate(end),
        weekLabel: str
      };
    }
  }

  // Single starting date, e.g. "Week Commencing: 21/09/2026"
  const single = parseSingleDate(str);
  if (single) {
    const end = new Date(single);
    end.setDate(single.getDate() + 6);
    return {
      startDate: toISODate(single),
      endDate: toISODate(end),
      weekLabel: `Week of ${toISODate(single)}`
    };
  }

  return null;
}

function parseSingleDate(str: string): Date | null {
  const cleaned = str.replace(/^(week\s*commencing|w\/c|from)\s*[:.]?/i, '').trim();
  
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    let year = parseInt(dmy[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // YYYY-MM-DD
  const ymd = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10) - 1;
    const day = parseInt(ymd[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  const generic = new Date(cleaned);
  if (!isNaN(generic.getTime())) return generic;

  return null;
}

/**
 * Parses an Excel or CSV file buffer
 */
export async function parseSpreadsheet(
  buffer: ArrayBuffer,
  fileName: string
): Promise<ParsedRosterPayload> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  
  // Pick primary sheet
  let sheetName = workbook.SheetNames[0];
  for (const name of workbook.SheetNames) {
    if (/duty|roster|term|schedule/i.test(name)) {
      sheetName = name;
      break;
    }
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('No readable sheet found in this workbook.');
  }

  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: ''
  });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('Spreadsheet appears to be empty.');
  }

  // Try deterministic parsing first
  const deterministicResult = attemptDeterministicParse(rawRows, fileName);

  if (deterministicResult && deterministicResult.assignments.length > 0) {
    return deterministicResult;
  }

  // If deterministic cannot find structured columns, fall back to AI interpretation
  const rawTextSnippet = rawRows
    .slice(0, 40)
    .map(row => row.filter(c => c !== '').join(' | '))
    .filter(line => line.trim().length > 0)
    .join('\n');

  return await parseRosterWithAI(rawTextSnippet, fileName, 'excel', rawRows);
}

/**
 * Deterministic column & row scanner
 */
function attemptDeterministicParse(
  rows: any[][],
  fileName: string
): ParsedRosterPayload | null {
  let headerRowIndex = -1;
  let teacherCol = -1;
  let dateCol = -1;
  let weekCol = -1;
  let dutyCol = -1;

  // Scan first 15 rows for header row
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    let foundTeacher = -1;
    let foundDate = -1;
    let foundWeek = -1;
    let foundDuty = -1;

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || '').toLowerCase().trim();
      if (!cell) continue;

      if (/^(teacher|teacher\s*name|staff|staff\s*name|name|duty\s*teacher|personnel|assigned)$/i.test(cell)) {
        foundTeacher = c;
      } else if (/^(date|dates|period|duty\s*period|start\s*date|commencing|w\/c|week\s*commencing)$/i.test(cell)) {
        foundDate = c;
      } else if (/^(week|duty\s*week|week\s*no|week\s*#)$/i.test(cell)) {
        foundWeek = c;
      } else if (/^(duty|duty\s*type|role|assignment|station|area)$/i.test(cell)) {
        foundDuty = c;
      }
    }

    if (foundTeacher !== -1 && (foundDate !== -1 || foundWeek !== -1)) {
      headerRowIndex = r;
      teacherCol = foundTeacher;
      dateCol = foundDate;
      weekCol = foundWeek;
      dutyCol = foundDuty;
      break;
    }
  }

  if (headerRowIndex === -1 || teacherCol === -1) {
    return null;
  }

  const assignments: ParsedRosterPayload['assignments'] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const teacherRaw = String(row[teacherCol] || '').trim();
    if (!teacherRaw || /^(total|notes|signed|prepared by)/i.test(teacherRaw)) continue;

    const teacherNames = extractTeacherNames(teacherRaw);
    if (teacherNames.length === 0) continue;

    const dateCell = dateCol !== -1 ? row[dateCol] : (weekCol !== -1 ? row[weekCol] : '');
    const weekCell = weekCol !== -1 ? String(row[weekCol] || '').trim() : '';
    const dutyTitle = dutyCol !== -1 && row[dutyCol] ? String(row[dutyCol]).trim() : '';

    const parsedDate = parseDateRange(dateCell);
    let startDate = '';
    let endDate = '';
    let weekLabel = weekCell;

    if (parsedDate) {
      startDate = parsedDate.startDate;
      endDate = parsedDate.endDate;
      if (!weekLabel || !weekLabel.includes('20')) {
        weekLabel = weekLabel ? `${weekLabel} (${parsedDate.weekLabel})` : parsedDate.weekLabel;
      }
    } else {
      // Fallback date if not formatted
      startDate = '2026-09-21';
      endDate = '2026-09-27';
      weekLabel = weekLabel || `Duty Week ${assignments.length + 1}`;
    }

    assignments.push({
      weekLabel: weekLabel || `Week ${assignments.length + 1}`,
      startDate,
      endDate,
      teachers: teacherNames.map(name => ({ name })),
      dutyTitle,
      confidence: parsedDate ? 'high' : 'review_needed',
      reviewReason: parsedDate ? undefined : 'Dates could not be deterministically confirmed'
    });
  }

  if (assignments.length === 0) {
    return null;
  }

  return {
    rosterName: fileName.replace(/\.[^/.]+$/, ''),
    sourceType: fileName.endsWith('.csv') ? 'csv' : 'excel',
    assignments,
    method: 'deterministic'
  };
}
