import { ParsedRosterPayload } from '../types';
import { parseSpreadsheet } from './rosterParser';

export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export function buildGoogleSheetCsvUrl(url: string): string {
  const sheetId = extractSheetId(url);
  if (!sheetId) return url;

  // Extract gid if present
  const gidMatch = url.match(/gid=([0-9]+)/);
  const gidPart = gidMatch ? `&gid=${gidMatch[1]}` : '';

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidPart}`;
}

export async function importGoogleSheetFromUrl(url: string): Promise<ParsedRosterPayload> {
  const csvUrl = buildGoogleSheetCsvUrl(url);

  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Google Sheet (${response.status}). Ensure the sheet is shared as "Anyone with the link can view" or paste the CSV content directly.`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return await parseSpreadsheet(arrayBuffer, 'Google Sheet Roster.csv');
  } catch (err: any) {
    if (err.message && err.message.includes('Failed to fetch')) {
      throw new Error(
        'Could not fetch Google Sheet directly due to sharing permissions or network restrictions. Please make sure the sheet is public ("Anyone with the link can view"), or download as Excel/CSV and upload it, or paste the copied rows below.'
      );
    }
    throw err;
  }
}

export async function parsePastedSheetData(
  text: string,
  rosterName: string = 'Pasted Sheet Roster'
): Promise<ParsedRosterPayload> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(text).buffer;
  return await parseSpreadsheet(buffer, `${rosterName}.csv`);
}
