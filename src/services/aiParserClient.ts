import { ParsedRosterPayload } from '../types';

export async function parseRosterWithAI(
  rawText: string,
  fileName: string,
  sourceType: 'excel' | 'csv' | 'pdf' | 'sheets' | 'image',
  rawRows?: any[],
  imageBase64?: string,
  imageMimeType?: string
): Promise<ParsedRosterPayload> {
  try {
    const response = await fetch('/api/roster-parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: rawText,
        fileName,
        sourceType,
        sampleRows: rawRows ? rawRows.slice(0, 30) : undefined,
        imageBase64,
        imageMimeType
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Server error during AI interpretation (${response.status})`);
    }

    const result = await response.json();
    if (!result.success || !Array.isArray(result.assignments)) {
      throw new Error(result.error || 'AI could not extract structured duty assignments.');
    }

    return {
      rosterName: fileName.replace(/\.[^/.]+$/, ''),
      sourceType,
      assignments: result.assignments,
      method: 'ai',
      warnings: result.warnings
    };
  } catch (err: any) {
    console.error('AI roster parse error:', err);
    throw new Error(
      err.message || 'Unable to parse roster with AI. Please check the file format or enter details in the review screen.'
    );
  }
}
