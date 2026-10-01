import * as pdfjsLib from 'pdfjs-dist';
import { ParsedRosterPayload } from '../types';
import { parseRosterWithAI } from './aiParserClient';
import { parseDateRange, extractTeacherNames } from './rosterParser';

// Set up worker source from public folder
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface TextItemWithCoords {
  str: string;
  x: number;
  y: number;
}

export async function parsePdfRoster(
  buffer: ArrayBuffer,
  fileName: string
): Promise<ParsedRosterPayload> {
  const uint8 = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8 });
  const pdf = await loadingTask.promise;

  let allLines: string[] = [];
  let totalTextItemsCount = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items as any[];

    if (items.length === 0) continue;
    totalTextItemsCount += items.length;

    const extracted: TextItemWithCoords[] = [];
    for (const it of items) {
      if ('str' in it && it.str.trim()) {
        extracted.push({
          str: it.str.trim(),
          x: it.transform[4],
          y: it.transform[5]
        });
      }
    }

    // Group items into lines based on vertical Y position (within 4px tolerance)
    extracted.sort((a, b) => b.y - a.y); // top to bottom

    const lines: TextItemWithCoords[][] = [];
    let currentLine: TextItemWithCoords[] = [];
    let currentY: number | null = null;

    for (const item of extracted) {
      if (currentY === null || Math.abs(currentY - item.y) > 4) {
        if (currentLine.length > 0) {
          currentLine.sort((a, b) => a.x - b.x); // left to right
          lines.push(currentLine);
        }
        currentLine = [item];
        currentY = item.y;
      } else {
        currentLine.push(item);
      }
    }
    if (currentLine.length > 0) {
      currentLine.sort((a, b) => a.x - b.x);
      lines.push(currentLine);
    }

    const pageTextLines = lines.map(line => line.map(i => i.str).join('   '));
    allLines = allLines.concat(pageTextLines);
  }

  // Check if PDF has zero or near-zero selectable text (scanned image PDF)
  if (totalTextItemsCount < 5) {
    throw new Error(
      'This PDF appears to be a scanned image or photo without selectable text. Xtreme cannot reliably extract teacher names from image scans. Please provide an Excel, CSV, or digital text-based PDF.'
    );
  }

  const rawExtractedText = allLines.join('\n');

  // Attempt deterministic extraction on lines
  const deterministic = attemptPdfDeterministicParse(allLines, fileName);
  if (deterministic && deterministic.assignments.length > 0) {
    return deterministic;
  }

  // Use Gemini AI for table understanding on the extracted PDF text
  return await parseRosterWithAI(rawExtractedText, fileName, 'pdf');
}

function attemptPdfDeterministicParse(
  lines: string[],
  fileName: string
): ParsedRosterPayload | null {
  const assignments: ParsedRosterPayload['assignments'] = [];

  for (const line of lines) {
    // Check if line contains a date range like "21/09/2026 - 27/09/2026" or "21-27 Sep"
    const parsedDate = parseDateRange(line);
    if (!parsedDate) continue;

    // Remove the date portion to find potential teacher names
    let remainder = line
      .replace(parsedDate.startDate, '')
      .replace(parsedDate.endDate, '')
      .replace(/(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\s*(?:-|–|to)\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/g, '')
      .replace(/week\s*\d+/i, '')
      .trim();

    const names = extractTeacherNames(remainder);
    if (names.length > 0) {
      assignments.push({
        weekLabel: parsedDate.weekLabel,
        startDate: parsedDate.startDate,
        endDate: parsedDate.endDate,
        teachers: names.map(name => ({ name })),
        dutyTitle: 'Weekly Duty',
        confidence: 'high'
      });
    }
  }

  if (assignments.length >= 2) {
    return {
      rosterName: fileName.replace(/\.pdf$/i, ''),
      sourceType: 'pdf',
      assignments,
      method: 'deterministic'
    };
  }

  return null;
}
