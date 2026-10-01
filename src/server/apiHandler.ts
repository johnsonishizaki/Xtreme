import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

export async function handleRosterParseApi(reqBody: {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
  fileName?: string;
  sourceType?: string;
  sampleRows?: any[];
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  const systemInstruction = `You are a specialized duty-roster understanding assistant for the app Xtreme.
The app's sole user is Xtreme.
Your task is to analyze raw roster text, table image/photo, or spreadsheet data and extract structured weekly teacher duty assignments.

CRITICAL INSTRUCTIONS:
1. Identify all weekly teacher duty assignments.
2. For each week, extract:
   - weekLabel: clean readable label, e.g. "21 - 27 September 2026" or "Week 3 (28 Sep - 04 Oct 2026)"
   - startDate: YYYY-MM-DD format (e.g. "2026-09-21"). If the year is not given in the document, assume 2026.
   - endDate: YYYY-MM-DD format (e.g. "2026-09-27").
   - dutyTitle: Duty description/role if explicitly specified, otherwise empty string "".
   - teachers: array of objects { name: string, role?: string }.
   - confidence: "high" if teacher names and date ranges are clear and identifiable; "review_needed" if dates, teachers, or formatting is ambiguous or incomplete.
   - reviewReason: brief explanation if confidence is "review_needed".

STRICT CONSTRAINTS:
- DO NOT invent, guess, or hallucinate teacher names! If a slot is vacant, blank, or TBA, leave it out or mark confidence as "review_needed".
- Clean up any stray symbols (*, -, numbers, bullets) from names.
- Output ONLY valid JSON matching the requested schema.`;

  const parts: any[] = [];
  if (reqBody.imageBase64 && reqBody.imageMimeType) {
    parts.push({
      inlineData: {
        data: reqBody.imageBase64,
        mimeType: reqBody.imageMimeType
      }
    });
  }

  const promptText = `Please parse the following duty roster document or image into a structured list of weekly duty assignments:

Document name: ${reqBody.fileName || 'duty_roster'}
Source format: ${reqBody.sourceType || 'document'}

${reqBody.text ? `Document content / text:\n---\n${reqBody.text}\n---` : 'Please inspect the table visible in this roster image and extract each weekly teacher duty assignment.'}

Return a JSON array of weekly assignments.`;

  parts.push({ text: promptText });

  const candidateModels = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
  let lastError: any = null;

  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                weekLabel: { type: Type.STRING },
                startDate: { type: Type.STRING },
                endDate: { type: Type.STRING },
                dutyTitle: { type: Type.STRING },
                teachers: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      role: { type: Type.STRING }
                    },
                    required: ['name']
                  }
                },
                confidence: { type: Type.STRING, enum: ['high', 'review_needed'] },
                reviewReason: { type: Type.STRING }
              },
              required: ['weekLabel', 'startDate', 'endDate', 'teachers']
            }
          }
        }
      });

      const outputText = response.text || '[]';
      const assignments = JSON.parse(outputText);

      return {
        success: true,
        assignments: Array.isArray(assignments) ? assignments : []
      };
    } catch (error: any) {
      console.warn(`Model ${modelName} attempt failed:`, error.message);
      lastError = error;
    }
  }

  console.error('All Gemini model candidates failed:', lastError);
  throw new Error(lastError?.message || 'Failed to analyze roster with Gemini.');
}
