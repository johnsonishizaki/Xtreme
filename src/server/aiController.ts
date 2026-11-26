import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import { DEFAULT_HOUSES } from '../services/sampleData.ts';

dotenv.config();

function getLocalIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig as any);
const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || '(default)');

export interface AiChatTurn {
  sender: 'user' | 'ai';
  text: string;
}

export interface AiControllerRequestBody {
  prompt: string;
  aiPersona?: 'concise' | 'supportive' | 'detailed' | string;
  history?: AiChatTurn[];
  context?: {
    activeTab?: string;
    selectedDate?: string;
    activeTerm?: any;
    terms?: any[];
    houses?: any[];
    reports?: any[];
    rosters?: any[];
    assignments?: any[];
    featuredAssignment?: any;
    isDutyPending?: boolean;
    settings?: any;
  };
}

const ALL_ACTION_TYPES = [
  'none',
  'draft_whatsapp',
  'update_house',
  'batch_update_houses',
  'log_house_report',
  'batch_log_reports',
  'delete_house_report',
  'select_date',
  'open_house_modal',
  'open_form_link_modal',
  'open_whatsapp_modal',
  'copy_text',
  'send_duty_announcement',
  'mark_duty_done',
  'unmark_duty_done',
  'update_duty_assignment',
  'set_active_roster',
  'test_duty_alarm',
  'download_duty_ics',
  'create_term',
  'activate_term',
  'delete_term',
  'update_settings',
  'trigger_tally_sync',
  'navigate_tab',
  'set_persona',
  'toggle_theme',
  'export_report'
] as const;

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```[\s]*$/i, '')
      .trim();
  }
  return trimmed;
}

function repairTruncatedJson(input: string): string | null {
  const start = input.indexOf('{');
  if (start === -1) return null;
  let s = input.slice(start);

  // Track string/brace/bracket state to close any incomplete tail cleanly
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      stack.push('}');
    } else if (ch === '[') {
      stack.push(']');
    } else if (ch === '}' || ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop();
      }
    }
  }

  if (escaped) s = s.slice(0, -1);
  if (inString) s += '"';
  // Clean trailing dangling punctuation/colon before closing containers
  s = s.replace(/,\s*$/, '').replace(/:\s*$/, ': null');
  while (stack.length > 0) {
    s += stack.pop();
  }
  return s;
}

function safeParseAiJson(raw: string): any {
  const cleaned = stripJsonFences(raw || '');
  if (!cleaned) {
    throw new Error('Model returned empty content.');
  }

  try {
    return JSON.parse(cleaned);
  } catch {}

  // Try extracting balanced outermost JSON object if surrounded by text
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch {}
  }

  // Try repairing truncated JSON from mid-stream token cutoff
  const repaired = repairTruncatedJson(cleaned);
  if (repaired) {
    try {
      return JSON.parse(repaired);
    } catch {}
  }

  // Extract partial replyText if present in damaged JSON
  const replyMatch = cleaned.match(/"replyText"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (replyMatch?.[1]) {
    try {
      const decodedReply = JSON.parse(`"${replyMatch[1]}"`);
      if (decodedReply.trim()) {
        return { replyText: decodedReply, actionType: 'none' };
      }
    } catch {
      return {
        replyText: replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
        actionType: 'none'
      };
    }
  }

  // If plain natural language without JSON braces, present cleanly instead of crashing
  if (firstBrace === -1 && cleaned.length > 0) {
    return { replyText: cleaned, actionType: 'none' };
  }

  throw new Error('Malformed JSON returned by AI model.');
}

function buildDeterministicSnapshot(
  houses: any[],
  reports: any[],
  selectedDate: string,
  context: AiControllerRequestBody['context'] = {}
) {
  const rawHouses = houses.length > 0 ? houses : DEFAULT_HOUSES;
  const activeHouses = rawHouses.filter((h: any) => h.active !== false);
  const dateReports = reports.filter((r: any) => r.reportingDate === selectedDate);
  const reportMap = new Map<string, any>();
  for (const r of dateReports) {
    reportMap.set(r.houseId, r);
  }

  let totalExpected = 0;
  let totalReported = 0;
  let boysExpected = 0;
  let boysReported = 0;
  let girlsExpected = 0;
  let girlsReported = 0;

  const houseBreakdown: any[] = [];
  const missingHouses: any[] = [];
  const pendingHouses: any[] = [];
  const followUpNotes: any[] = [];

  for (const h of rawHouses) {
    const rep = reportMap.get(h.id);
    const expected = rep?.expectedCount ?? h.expectedStudentCount ?? 0;
    const reported = rep?.reportedCount ?? 0;
    const notReported = Math.max(0, expected - reported);
    const pct = expected > 0 ? Number(((reported / expected) * 100).toFixed(1)) : 0;

    if (h.active !== false) {
      totalExpected += expected;
      totalReported += reported;
      if (h.category === 'Boys') {
        boysExpected += expected;
        boysReported += reported;
      } else {
        girlsExpected += expected;
        girlsReported += reported;
      }

      if (!rep) {
        missingHouses.push({
          id: h.id,
          name: h.name,
          houseparent: h.assignedHouseparent,
          phone: h.houseparentPhone || '',
          expected
        });
      } else if (notReported > 0) {
        pendingHouses.push({ id: h.id, name: h.name, reported, expected, notReported, pct });
      }

      if (rep?.notReportedDetails?.trim()) {
        followUpNotes.push({ house: h.name, note: rep.notReportedDetails.trim() });
      }
    }

    houseBreakdown.push({
      id: h.id,
      name: h.name,
      category: h.category,
      active: h.active !== false,
      houseparent: h.assignedHouseparent || 'Houseparent',
      phone: h.houseparentPhone || '',
      reported,
      expected,
      notReported,
      pct,
      hasReport: !!rep,
      followUp: rep?.notReportedDetails || ''
    });
  }

  const totalNotReported = Math.max(0, totalExpected - totalReported);
  const overallPct = totalExpected > 0 ? Number(((totalReported / totalExpected) * 100).toFixed(1)) : 0;
  const boysPct = boysExpected > 0 ? Number(((boysReported / boysExpected) * 100).toFixed(1)) : 0;
  const girlsPct = girlsExpected > 0 ? Number(((girlsReported / girlsExpected) * 100).toFixed(1)) : 0;

  // Compute multi-day trend summary across recent dates
  const byDate = new Map<string, { reported: number; housesIn: number }>();
  for (const r of reports) {
    if (!r.reportingDate) continue;
    const cur = byDate.get(r.reportingDate) || { reported: 0, housesIn: 0 };
    cur.reported += Number(r.reportedCount) || 0;
    cur.housesIn += 1;
    byDate.set(r.reportingDate, cur);
  }
  const recentDailyTrend = Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 7)
    .map(([date, v]) => ({
      date,
      reported: v.reported,
      expected: totalExpected || 949,
      pct: totalExpected > 0 ? Number(((v.reported / totalExpected) * 100).toFixed(1)) : 0,
      housesIn: v.housesIn
    }));

  const terms = Array.isArray(context.terms)
    ? context.terms.map((t: any) => ({
        id: t.id,
        termName: t.termName,
        termType:
          t.termType ||
          (String(t.termName || '').toLowerCase().includes('mid') ? 'midterm' : 'term'),
        academicYear: t.academicYear,
        status: t.status || 'open',
        openingDate: t.openingDate,
        reportingStartDate: t.reportingStartDate,
        reportingEndDate: t.reportingEndDate,
        isActive: context.activeTerm?.id === t.id || context.settings?.activeTermId === t.id
      }))
    : [];

  const rosters = Array.isArray(context.rosters)
    ? context.rosters.map((r: any) => ({
        id: r.id,
        name: r.name,
        totalWeeks: r.totalWeeks,
        isActive: Boolean(r.isActive)
      }))
    : [];

  const dutyWeeks = Array.isArray(context.assignments)
    ? context.assignments.slice(0, 16).map((a: any) => ({
        id: a.id,
        rosterId: a.rosterId,
        weekLabel: a.weekLabel,
        startDate: a.startDate,
        endDate: a.endDate,
        dutyTitle: a.dutyTitle || 'Weekly Duty',
        teachers: (a.teachers || []).map((t: any) => t.name),
        isFeatured: context.featuredAssignment?.id === a.id
      }))
    : [];

  return {
    selectedDate,
    summary: {
      totalReported,
      totalExpected,
      totalNotReported,
      overallPct,
      housesReportedCount: Math.max(0, activeHouses.length - missingHouses.length),
      totalHousesCount: activeHouses.length,
      boysReported,
      boysExpected,
      boysPct,
      girlsReported,
      girlsExpected,
      girlsPct
    },
    houseBreakdown,
    missingHouses,
    pendingHouses,
    followUpNotes,
    recentDailyTrend,
    terms,
    rosters,
    dutyWeeks,
    featuredDuty: context.featuredAssignment
      ? {
          id: context.featuredAssignment.id,
          weekLabel: context.featuredAssignment.weekLabel,
          startDate: context.featuredAssignment.startDate,
          endDate: context.featuredAssignment.endDate,
          dutyTitle: context.featuredAssignment.dutyTitle || 'Weekly Duty',
          teachers: (context.featuredAssignment.teachers || []).map((t: any) => t.name),
          isPending: Boolean(context.isDutyPending)
        }
      : null,
    settings: context.settings
      ? {
          aiPersona: context.settings.aiPersona || 'concise',
          theme: context.settings.theme || 'dark',
          reminderEnabled: Boolean(context.settings.reminderEnabled),
          reminderDay: context.settings.reminderDay ?? 0,
          reminderTime: context.settings.reminderTime || '08:00',
          soundAlertEnabled: context.settings.soundAlertEnabled !== false,
          voiceAlertEnabled: context.settings.voiceAlertEnabled !== false,
          whatsAppBehavior: context.settings.whatsAppBehavior || 'app',
          messageTemplate: context.settings.messageTemplate || ''
        }
      : null
  };
}

function getPersonaInstruction(aiPersona: string): string {
  if (aiPersona === 'supportive') {
    return `PERSONA: Supportive & Encouraging.
- Warm, appreciative, collaborative tone encouraging houseparents and duty teachers.
- Celebrate full houses while kindly surfacing pending or missing actions.`;
  }
  if (aiPersona === 'detailed') {
    return `PERSONA: Detailed Analysis.
- Comprehensive cohort & house breakdown, variance numbers, multi-day comparisons, follow-up reasons, and operational recommendations.`;
  }
  return `PERSONA: Concise Executive.
- Crisp, scannable, metric-focused. Lead with bold headline metrics, concise bullets, and immediate next-step actions.`;
}

function buildSystemInstruction(snapshot: any, aiPersona: string, activeTab: string) {
  const personaInstruction = getPersonaInstruction(aiPersona);

  return `You are Xtreme AI, the full-control operations assistant for OLAG SHS Senior Houseparent Suite ("Xtreme").
You can inspect EVERY piece of data AND perform ANY action in the app—including chained multi-step workflows.

${personaInstruction}

ACCURACY & FORMATTING RULES:
1. NEVER hallucinate counts, names, or dates. Rely strictly on the verified JSON snapshot below (Current viewed date: ${snapshot.selectedDate}, Active tab: ${activeTab}).
2. Format house/date attendance lines using clean markdown bullets like:
   - **St. Mary Boys**: **89/121** (73.6%) — 32 pending
   - **St. Paul Boys**: **0/120** (0%) — Missing
   This syntax powers interactive breakdown charts automatically! Always also populate \`chartData\` for numerical breakdowns or multi-day trends.
3. For follow-up prompts ("do it", "yes", "go ahead", "apply that", "send it"), read conversation history and execute/propose the exact action immediately.
4. For multi-step user requests (e.g. "update two houses and switch to quotas" or "create Term 2 and navigate to duty"), populate the \`actions\` array in exact execution order! For single actions, you may use \`actionType\` + \`actionPayload\` (or put 1 item in \`actions\`).

COMPLETE ACTION CATALOG (you have full app control):
- \`none\`: Analytical answer / summary / chart / Q&A only.
- \`draft_whatsapp\`: Prepare a clean plain-Unicode WhatsApp message (attendance reminder, full collation, houseparent ping, or weekly duty announcement). Payload: \`{ whatsappMessage, phone?, targetLabel? }\`.
- \`update_house\`: Edit a house's name, quota, houseparent, phone, or active status. Payload: \`{ houseId?, houseName?, newName?, newQuota?, newHouseparent?, newPhone?, active? }\`.
- \`batch_update_houses\`: Edit multiple houses at once. Payload: \`{ houseUpdates: [{ houseId?, houseName?, newName?, newQuota?, newHouseparent?, newPhone?, active? }] }\`.
- \`log_house_report\`: Record or update daily attendance for a house. Payload: \`{ houseId?, houseName?, reportingDate?, reportedCount, notReportedDetails?, notes? }\`.
- \`batch_log_reports\`: Record/update counts for multiple houses on a date. Payload: \`{ reportUpdates: [{ houseId?, houseName?, reportingDate?, reportedCount, notReportedDetails?, notes? }] }\`.
- \`delete_house_report\`: Remove an erroneous daily report. Payload: \`{ houseId?, houseName?, reportingDate? }\`.
- \`select_date\`: Switch the Attendance dashboard date viewer. Payload: \`{ date: "YYYY-MM-DD" }\`.
- \`open_house_modal\`: Open the interactive detail/edit popup for a specific house. Payload: \`{ houseId?, houseName? }\`.
- \`open_form_link_modal\`: Open the Tally Form Link broadcast modal.
- \`open_whatsapp_modal\`: Open the WhatsApp Share dialog. Payload: \`{ houseId?, houseName?, date? }\`.
- \`copy_text\`: Copy a generated summary or message directly to clipboard. Payload: \`{ textToCopy, copyLabel? }\`.
- \`send_duty_announcement\`: Generate the OLAG SHS formatted weekly duty announcement (from \`settings.messageTemplate\`), copy it, and open WhatsApp immediately. Payload: \`{ assignmentId?, weekLabel? }\`.
- \`mark_duty_done\`: Mark this week's duty complete and silence repeating alarms.
- \`unmark_duty_done\`: Undo duty done status so this week returns to Pending.
- \`update_duty_assignment\`: Edit a duty week's teachers, duty title, or dates. Payload: \`{ assignmentId?, weekLabel?, dutyTitle?, startDate?, endDate?, teachers?: [{ name, role? }] }\`.
- \`set_active_roster\`: Switch active duty roster. Payload: \`{ rosterId?, rosterName? }\`.
- \`test_duty_alarm\`: Ring the urgent duty alarm test.
- \`download_duty_ics\`: Download the recurring iPhone Calendar Lock-Screen alarm (.ics).
- \`create_term\`: Create and activate a new Academic Term or Mid-Term. Payload: \`{ academicYear, termName, termType?: "term" | "midterm", openingDate?, reportingStartDate?, reportingEndDate? }\`.
- \`activate_term\`: Switch active Academic Term or Mid-Term. Payload: \`{ termId?, termName? }\`.
- \`delete_term\`: Delete an Academic Term or Mid-Term. Payload: \`{ termId?, termName? }\`.
- \`update_settings\`: Update message template, scheduled reminder day/time, alert chime/voice flags, or WhatsApp behavior. Payload: \`{ messageTemplate?, reminderEnabled?, reminderDay?, reminderTime?, soundAlertEnabled?, voiceAlertEnabled?, whatsAppBehavior? }\`.
- \`trigger_tally_sync\`: Pull new Tally form submissions immediately.
- \`navigate_tab\`: Switch screen. Payload: \`{ tabName: "houseReports" | "duty" | "settings", settingsSection?: "terms" | "general" | "duty" | "ai" }\`.
- \`set_persona\`: Switch persona preset. Payload: \`{ aiPersona: "concise" | "supportive" | "detailed" }\`.
- \`toggle_theme\`: Switch theme. Payload: \`{ theme?: "dark" | "light" }\`.
- \`export_report\`: Export attendance graphs and house data (or weekly duty schedule) as a downloadable file. Payload: \`{ exportFormat: "pdf" | "excel" | "word", exportScope?: "attendance" | "duty", date?: "YYYY-MM-DD" }\`.

JSON OUTPUT SCHEMA:
{
  "replyText": "Markdown response with ### headings, **bold metrics**, and structured bullets",
  "planTitle": "Short label for action review card",
  "actionType": "one of the action names above (primary action, or 'none')",
  "actionPayload": { ... },
  "actions": [ { "actionType": "...", "planTitle": "...", "actionPayload": { ... } } ],
  "chartData": [ { "label": "Label", "value": 89, "max": 121 } ]
}

VERIFIED LIVE STATE SNAPSHOT:
${JSON.stringify(snapshot)}
`;
}

async function callDeepSeekCheapest(
  systemInstruction: string,
  prompt: string,
  history: AiChatTurn[]
): Promise<{ parsed: any; modelUsed: string } | null> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!deepseekKey) return null;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemInstruction }
  ];

  for (const turn of history.slice(-10)) {
    if (!turn?.text) continue;
    messages.push({
      role: turn.sender === 'user' ? 'user' : 'assistant',
      content: turn.text.slice(0, 700)
    });
  }
  messages.push({ role: 'user', content: prompt });

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekKey}`
        },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({
          model: 'deepseek-chat', // DeepSeek's cheapest, fastest general model
          messages,
          temperature: 0.2,
          max_tokens: 4096,
          response_format: { type: 'json_object' }
        })
      });

      const rawBody = await response.text();
      if (!response.ok) {
        throw new Error(`DeepSeek API error (${response.status}): ${rawBody.slice(0, 200)}`);
      }
      if (!rawBody || !rawBody.trim()) {
        throw new Error('DeepSeek returned an empty HTTP body.');
      }

      let data: any;
      try {
        data = JSON.parse(rawBody);
      } catch {
        throw new Error(`DeepSeek returned non-JSON envelope (${rawBody.slice(0, 120)})`);
      }

      const content = data?.choices?.[0]?.message?.content;
      if (!content || !String(content).trim()) {
        throw new Error('Empty message content from DeepSeek.');
      }

      return {
        parsed: safeParseAiJson(String(content)),
        modelUsed: 'deepseek-chat'
      };
    } catch (err: any) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 250));
      }
    }
  }

  throw lastErr || new Error('DeepSeek request failed');
}

const ACTION_PAYLOAD_PROPERTIES = {
  whatsappMessage: { type: Type.STRING },
  phone: { type: Type.STRING },
  targetLabel: { type: Type.STRING },
  houseId: { type: Type.STRING },
  houseName: { type: Type.STRING },
  newName: { type: Type.STRING },
  newQuota: { type: Type.NUMBER },
  newHouseparent: { type: Type.STRING },
  newPhone: { type: Type.STRING },
  active: { type: Type.BOOLEAN },
  reportingDate: { type: Type.STRING },
  reportedCount: { type: Type.NUMBER },
  notReportedDetails: { type: Type.STRING },
  notes: { type: Type.STRING },
  date: { type: Type.STRING },
  textToCopy: { type: Type.STRING },
  copyLabel: { type: Type.STRING },
  assignmentId: { type: Type.STRING },
  weekLabel: { type: Type.STRING },
  dutyTitle: { type: Type.STRING },
  startDate: { type: Type.STRING },
  endDate: { type: Type.STRING },
  rosterId: { type: Type.STRING },
  rosterName: { type: Type.STRING },
  termId: { type: Type.STRING },
  termName: { type: Type.STRING },
  termType: { type: Type.STRING },
  academicYear: { type: Type.STRING },
  openingDate: { type: Type.STRING },
  reportingStartDate: { type: Type.STRING },
  reportingEndDate: { type: Type.STRING },
  messageTemplate: { type: Type.STRING },
  reminderEnabled: { type: Type.BOOLEAN },
  reminderDay: { type: Type.NUMBER },
  reminderTime: { type: Type.STRING },
  soundAlertEnabled: { type: Type.BOOLEAN },
  voiceAlertEnabled: { type: Type.BOOLEAN },
  whatsAppBehavior: { type: Type.STRING },
  tabName: { type: Type.STRING },
  settingsSection: { type: Type.STRING },
  aiPersona: { type: Type.STRING },
  theme: { type: Type.STRING },
  exportFormat: { type: Type.STRING },
  exportScope: { type: Type.STRING },
  teachers: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        role: { type: Type.STRING }
      }
    }
  },
  houseUpdates: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        houseId: { type: Type.STRING },
        houseName: { type: Type.STRING },
        newName: { type: Type.STRING },
        newQuota: { type: Type.NUMBER },
        newHouseparent: { type: Type.STRING },
        newPhone: { type: Type.STRING },
        active: { type: Type.BOOLEAN }
      }
    }
  },
  reportUpdates: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        houseId: { type: Type.STRING },
        houseName: { type: Type.STRING },
        reportingDate: { type: Type.STRING },
        reportedCount: { type: Type.NUMBER },
        notReportedDetails: { type: Type.STRING },
        notes: { type: Type.STRING }
      }
    }
  }
};

export const CHEAPEST_GEMINI_MODELS = [
  { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
  { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW }
] as const;

async function callGeminiCheapestWithFallback(
  systemInstruction: string,
  prompt: string,
  history: AiChatTurn[]
): Promise<{ parsed: any; modelUsed: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });

  const historyText = history
    .slice(-12)
    .map(t => `${t.sender === 'user' ? 'User' : 'Assistant'}: ${t.text}`)
    .join('\n');

  const combinedContents = historyText
    ? `Recent Conversation:\n${historyText}\n\nLatest User Message:\n${prompt}`
    : prompt;

  let lastErr: any = null;
  for (const candidate of CHEAPEST_GEMINI_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: candidate.model,
        contents: combinedContents,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              replyText: {
                type: Type.STRING,
                description: 'Markdown formatted response with bold metrics and structured lists.'
              },
              planTitle: {
                type: Type.STRING,
                description: 'Concise action plan title if an action is proposed.'
              },
              actionType: {
                type: Type.STRING,
                enum: [...ALL_ACTION_TYPES]
              },
              actionPayload: {
                type: Type.OBJECT,
                description: 'Typed parameters for the proposed action.',
                properties: ACTION_PAYLOAD_PROPERTIES
              },
              actions: {
                type: Type.ARRAY,
                description: 'Optional list of chained actions to execute in sequence.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, enum: [...ALL_ACTION_TYPES] },
                    planTitle: { type: Type.STRING },
                    actionPayload: { type: Type.OBJECT, properties: ACTION_PAYLOAD_PROPERTIES }
                  },
                  required: ['actionType']
                }
              },
              chartData: {
                type: Type.ARRAY,
                description: 'Optional numeric comparison items to visualize as progress bars.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    value: { type: Type.NUMBER },
                    max: { type: Type.NUMBER }
                  },
                  required: ['label', 'value', 'max']
                }
              }
            },
            required: ['replyText', 'actionType']
          }
        }
      });

      const parsed = safeParseAiJson(response.text || '{}');
      return {
        parsed,
        modelUsed: candidate.model
      };
    } catch (err: any) {
      console.warn(`Gemini model ${candidate.model} failed, trying fallback:`, err?.message || err);
      lastErr = err;
    }
  }

  throw lastErr || new Error('All Gemini cheapest model attempts failed.');
}

function deterministicLocalFallback(prompt: string, snapshot: any) {
  const lower = prompt.toLowerCase();
  const s = snapshot.summary;

  if (lower.includes('missing')) {
    const missingLines = snapshot.missingHouses.length > 0
      ? snapshot.missingHouses.map((h: any) => `- **${h.name}**: **0/${h.expected}** (0%) — Missing (${h.houseparent})`).join('\n')
      : '- All houses have submitted reports!';
    return {
      replyText: `### Missing House Reports (${snapshot.selectedDate})\n**${snapshot.missingHouses.length}** of **${s.totalHousesCount}** houses have not reported yet:\n${missingLines}`,
      actionType: snapshot.missingHouses.length > 0 ? 'draft_whatsapp' : 'none',
      planTitle: 'Send Missing Reports Reminder on WhatsApp',
      actionPayload: snapshot.missingHouses.length > 0 ? {
        targetLabel: 'Missing Houses Reminder',
        whatsappMessage: `⚠️ MISSING ATTENDANCE REPORTS (${snapshot.selectedDate})\n\nThe following houses have not submitted counts yet:\n${snapshot.missingHouses.map((h: any) => `• ${h.name} (${h.houseparent})`).join('\n')}\n\nPlease submit today's count via the Tally form.\n— Senior Houseparent, OLAG SHS`
      } : {},
      chartData: snapshot.houseBreakdown.filter((h: any) => h.active).map((h: any) => ({ label: h.name, value: h.reported, max: h.expected }))
    };
  }

  if (lower.includes('mid-term') || lower.includes('midterm')) {
    const today = getLocalIsoDate();
    return {
      replyText: `### Create & Activate Mid-Term\nReady to create **Mid-Term 1 (2026/2027)** starting **${today}**.`,
      actionType: 'create_term',
      planTitle: 'Create & Activate Mid-Term 1',
      actionPayload: {
        academicYear: '2026/2027',
        termName: 'Mid-Term 1',
        termType: 'midterm',
        openingDate: today,
        reportingStartDate: today,
        reportingEndDate: today
      }
    };
  }

  if (lower.includes('remind') && (lower.includes('duty') || lower.includes('announce') || lower.includes('schedule'))) {
    return {
      replyText: `### Weekly Duty Reminder Configured\nWeekly duty reminders will chime & alert on **Sunday at 08:00** so you can manually review and send to WhatsApp.`,
      actionType: 'update_settings',
      planTitle: 'Enable Weekly Duty Reminders',
      actionPayload: {
        reminderEnabled: true,
        reminderDay: 0,
        reminderTime: '08:00',
        soundAlertEnabled: true,
        voiceAlertEnabled: true
      }
    };
  }

  if (
    (lower.includes('send') || lower.includes('dispatch')) &&
    (lower.includes('duty') || lower.includes('announcement'))
  ) {
    return {
      replyText: `### Dispatch Weekly Duty Announcement\nReady to send **${snapshot.featuredDuty?.weekLabel || 'Weekly Duty'}** announcement using the OLAG SHS format.`,
      actionType: 'send_duty_announcement',
      planTitle: 'Send OLAG SHS Duty Announcement on WhatsApp',
      actionPayload: {}
    };
  }

  if (lower.includes('undo') && lower.includes('duty')) {
    return {
      replyText: `### Undo Duty Completion\nReady to return **${snapshot.featuredDuty?.weekLabel || 'this week'}** to **Pending** status.`,
      actionType: 'unmark_duty_done',
      planTitle: 'Undo Duty Done Status',
      actionPayload: {}
    };
  }

  if (lower.includes('mark') && lower.includes('duty')) {
    return {
      replyText: `### Confirm Duty Completion\nReady to mark **${snapshot.featuredDuty?.weekLabel || 'this week'}** duty as done and silence active alarms.`,
      actionType: 'mark_duty_done',
      planTitle: 'Mark Weekly Duty Done & Silence Alarms',
      actionPayload: {}
    };
  }

  if (lower.includes('export') || lower.includes('download')) {
    const exportFormat =
      lower.includes('excel') || lower.includes('xlsx') || lower.includes('spreadsheet')
        ? 'excel'
        : lower.includes('word') || lower.includes('docx')
          ? 'word'
          : 'pdf';
    const exportScope = lower.includes('duty') || lower.includes('roster') ? 'duty' : 'attendance';
    const formatLabel = exportFormat === 'excel' ? 'Excel (.xlsx)' : exportFormat === 'word' ? 'Word (.docx)' : 'PDF (.pdf)';
    return {
      replyText: `### Exporting ${exportScope === 'duty' ? 'Duty Schedule' : 'Attendance & Graphs'} to ${formatLabel}\nGenerating downloadable **${formatLabel}** file now.`,
      actionType: 'export_report',
      planTitle: `Export ${exportScope === 'duty' ? 'Duty' : 'Attendance'} (${formatLabel})`,
      actionPayload: { exportFormat, exportScope }
    };
  }

  if (lower.includes('quota') || lower.includes('settings')) {
    const section = lower.includes('quota') ? 'general' : lower.includes('persona') ? 'ai' : lower.includes('template') ? 'duty' : 'terms';
    return {
      replyText: `Opening **Settings** (${section}).`,
      actionType: 'navigate_tab',
      planTitle: 'Open Settings',
      actionPayload: { tabName: 'settings', settingsSection: section }
    };
  }

  if (lower.includes('duty')) {
    const dutyInfo = snapshot.featuredDuty
      ? `**${snapshot.featuredDuty.weekLabel}** (${snapshot.featuredDuty.startDate} to ${snapshot.featuredDuty.endDate})\n- **Teachers**: ${snapshot.featuredDuty.teachers.join(', ') || 'TBD'}\n- **Status**: ${snapshot.featuredDuty.isPending ? 'Pending' : 'Done'}`
      : 'No active duty week configured yet.';
    return {
      replyText: `### Weekly Duty Overview\n${dutyInfo}`,
      actionType: 'navigate_tab',
      planTitle: 'Open Duty Tab',
      actionPayload: { tabName: 'duty' }
    };
  }

  const lines = snapshot.houseBreakdown
    .filter((h: any) => h.active)
    .map((h: any) => `- **${h.name}**: **${h.reported}/${h.expected}** (${h.pct}%) ${!h.hasReport ? '— Missing' : h.notReported > 0 ? `— ${h.notReported} pending` : '— Full'}`);

  return {
    replyText: `### Attendance Summary (${snapshot.selectedDate})\n**Reported:** **${s.totalReported}/${s.totalExpected}** (**${s.overallPct}%**) · **Houses In:** **${s.housesReportedCount}/${s.totalHousesCount}**\n\n- **Boys**: **${s.boysReported}/${s.boysExpected}** (${s.boysPct}%)\n- **Girls**: **${s.girlsReported}/${s.girlsExpected}** (${s.girlsPct}%)\n\n${lines.join('\n')}`,
    actionType: 'none',
    chartData: snapshot.houseBreakdown.filter((h: any) => h.active).map((h: any) => ({ label: h.name, value: h.reported, max: h.expected }))
  };
}

export async function handleAiControllerRequest(body: AiControllerRequestBody) {
  const { prompt, aiPersona = 'concise', history = [], context = {} } = body;
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt is required');
  }

  let houses: any[] = Array.isArray(context.houses) && context.houses.length > 0 ? context.houses : [];
  let reports: any[] = Array.isArray(context.reports) && context.reports.length > 0 ? context.reports : [];

  if (houses.length === 0 || reports.length === 0) {
    try {
      if (houses.length === 0) {
        const hSnap = await getDocs(collection(db, 'houses'));
        hSnap.forEach(d => houses.push(d.data()));
      }
      if (reports.length === 0) {
        const rSnap = await getDocs(collection(db, 'houseReports'));
        rSnap.forEach(d => {
          const rep = d.data();
          if (rep?.id && !rep.id.includes('sample') && !rep.id.includes('demo')) {
            reports.push(rep);
          }
        });
      }
    } catch {}
  }

  const todayStr = getLocalIsoDate();
  const selectedDate = context.selectedDate || todayStr;
  const snapshot = buildDeterministicSnapshot(houses, reports, selectedDate, context);

  const systemInstruction = buildSystemInstruction(
    snapshot,
    aiPersona,
    context.activeTab || 'houseReports'
  );

  try {
    let result: { parsed: any; modelUsed: string } | null = null;
    try {
      result = await callGeminiCheapestWithFallback(systemInstruction, prompt, history);
    } catch (geminiErr: any) {
      console.warn('Gemini cheapest chain failed, trying optional DeepSeek fallback:', geminiErr?.message || geminiErr);
      result = await callDeepSeekCheapest(systemInstruction, prompt, history);
    }

    if (!result) {
      throw new Error('No AI provider response available.');
    }

    const parsed = result.parsed || {};
    const actionsList = Array.isArray(parsed.actions)
      ? parsed.actions.filter((a: any) => a && a.actionType && a.actionType !== 'none')
      : undefined;

    return {
      success: true,
      modelUsed: result.modelUsed,
      replyText: parsed.replyText || 'Done.',
      planTitle: parsed.planTitle || actionsList?.[0]?.planTitle || '',
      actionType: parsed.actionType || actionsList?.[0]?.actionType || 'none',
      actionPayload: parsed.actionPayload || actionsList?.[0]?.actionPayload || {},
      actions: actionsList,
      chartData: Array.isArray(parsed.chartData) ? parsed.chartData : undefined
    };
  } catch (err: any) {
    console.error('AI Controller error, serving deterministic intelligent fallback:', err?.message || err);
    const fallback = deterministicLocalFallback(prompt, snapshot);
    return {
      success: true,
      modelUsed: 'deterministic-fallback',
      ...fallback
    };
  }
}
