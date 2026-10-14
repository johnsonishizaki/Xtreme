var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv2 from "dotenv";

// src/server/apiHandler.ts
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();
async function handleRosterParseApi(reqBody) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
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
  const parts = [];
  if (reqBody.imageBase64 && reqBody.imageMimeType) {
    parts.push({
      inlineData: {
        data: reqBody.imageBase64,
        mimeType: reqBody.imageMimeType
      }
    });
  }
  const promptText = `Please parse the following duty roster document or image into a structured list of weekly duty assignments:

Document name: ${reqBody.fileName || "duty_roster"}
Source format: ${reqBody.sourceType || "document"}

${reqBody.text ? `Document content / text:
---
${reqBody.text}
---` : "Please inspect the table visible in this roster image and extract each weekly teacher duty assignment."}

Return a JSON array of weekly assignments.`;
  parts.push({ text: promptText });
  const candidateModels = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-3.1-flash-lite"];
  let lastError = null;
  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
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
                    required: ["name"]
                  }
                },
                confidence: { type: Type.STRING, enum: ["high", "review_needed"] },
                reviewReason: { type: Type.STRING }
              },
              required: ["weekLabel", "startDate", "endDate", "teachers"]
            }
          }
        }
      });
      const outputText = response.text || "[]";
      const assignments = JSON.parse(outputText);
      return {
        success: true,
        assignments: Array.isArray(assignments) ? assignments : []
      };
    } catch (error) {
      console.warn(`Model ${modelName} attempt failed:`, error.message);
      lastError = error;
    }
  }
  console.error("All Gemini model candidates failed:", lastError);
  throw new Error(lastError?.message || "Failed to analyze roster with Gemini.");
}

// src/lib/firebase-admin.ts
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "quirky-outpost-t1b2m",
  appId: "1:874621350019:web:d79645e3e0468719396bb6",
  apiKey: "AIzaSyBZ6aSC3NfUjzNOEANpDBXzFICUa94uyqg",
  authDomain: "quirky-outpost-t1b2m.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-remixxtreme-7ed35f59-f392-4a39-ac0b-ed45d12abb41",
  storageBucket: "quirky-outpost-t1b2m.firebasestorage.app",
  messagingSenderId: "874621350019",
  measurementId: "",
  oAuthClientId: "874621350019-g87ui76ahb2qai7jub73106qe2fksfv4.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

// src/lib/firebase-admin.ts
if (!getApps().length) {
  initializeApp({
    projectId: firebase_applet_config_default.projectId
  });
}
var adminAuth = getAuth();

// src/middleware/auth.ts
var requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Error verifying Firebase ID token:", error);
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

// src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  dutyAssignments: () => dutyAssignments,
  dutyAssignmentsRelations: () => dutyAssignmentsRelations,
  rosters: () => rosters,
  rostersRelations: () => rostersRelations,
  sendHistory: () => sendHistory,
  sendHistoryRelations: () => sendHistoryRelations,
  settings: () => settings,
  settingsRelations: () => settingsRelations,
  users: () => users,
  usersRelations: () => usersRelations
});
import { relations } from "drizzle-orm";
import { integer, pgTable, serial, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(),
  // Firebase Auth UID
  email: text("email").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
var settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  reminderEnabled: boolean("reminder_enabled").default(true).notNull(),
  reminderDay: integer("reminder_day").default(0).notNull(),
  // 0 = Sunday
  reminderTime: text("reminder_time").default("08:00").notNull(),
  messageTemplate: text("message_template").notNull(),
  whatsAppBehavior: text("whatsapp_behavior").default("app").notNull(),
  targetGroupHint: text("target_group_hint").default("Teachers Staff Group").notNull(),
  googleSheetUrl: text("google_sheet_url"),
  lastSyncHash: text("last_sync_hash"),
  updatedAt: timestamp("updated_at").defaultNow()
});
var rosters = pgTable("rosters", {
  id: text("id").primaryKey(),
  // We use custom string IDs like roster-sync-*
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  // excel, csv, pdf, sheets, sample
  totalWeeks: integer("total_weeks").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  // Store ISO string for compatibility with frontend
  isActive: boolean("is_active").default(false).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull()
});
var dutyAssignments = pgTable("duty_assignments", {
  id: text("id").primaryKey(),
  // Custom ID
  rosterId: text("roster_id").references(() => rosters.id, { onDelete: "cascade" }).notNull(),
  weekLabel: text("week_label").notNull(),
  startDate: text("start_date").notNull(),
  // ISO YYYY-MM-DD
  endDate: text("end_date").notNull(),
  // ISO YYYY-MM-DD
  teachers: jsonb("teachers").notNull(),
  // Array of { name: string, role: string }
  dutyTitle: text("duty_title").notNull(),
  status: text("status").notNull(),
  // confirmed, needs_review
  confidence: text("confidence").notNull(),
  // high, review_needed
  createdAt: text("created_at").notNull(),
  // Store ISO string
  updatedAt: text("updated_at").notNull()
  // Store ISO string
});
var sendHistory = pgTable("send_history", {
  id: text("id").primaryKey(),
  // Custom ID
  assignmentId: text("assignment_id").notNull(),
  weekLabel: text("week_label").notNull(),
  dutyPeriod: text("duty_period").notNull(),
  message: text("message").notNull(),
  timestamp: text("timestamp").notNull(),
  // ISO string
  status: text("status").notNull(),
  // copied, sent_confirmed
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull()
});
var usersRelations = relations(users, ({ one, many }) => ({
  settings: one(settings, {
    fields: [users.id],
    references: [settings.userId]
  }),
  rosters: many(rosters),
  sendHistory: many(sendHistory)
}));
var settingsRelations = relations(settings, ({ one }) => ({
  user: one(users, {
    fields: [settings.userId],
    references: [users.id]
  })
}));
var rostersRelations = relations(rosters, ({ one, many }) => ({
  user: one(users, {
    fields: [rosters.userId],
    references: [users.id]
  }),
  assignments: many(dutyAssignments)
}));
var dutyAssignmentsRelations = relations(dutyAssignments, ({ one }) => ({
  roster: one(rosters, {
    fields: [dutyAssignments.rosterId],
    references: [rosters.id]
  })
}));
var sendHistoryRelations = relations(sendHistory, ({ one }) => ({
  user: one(users, {
    fields: [sendHistory.userId],
    references: [users.id]
  })
}));

// src/db/index.ts
var createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15e3
    });
    global._postgresPool.on("error", (err) => {
      console.error("Unexpected error on idle SQL pool client:", err);
    });
  }
  return global._postgresPool;
};
var pool = createPool();
var db = drizzle(pool, { schema: schema_exports });

// src/db/users.ts
import { eq } from "drizzle-orm";

// src/constants/template.ts
var DEFAULT_TEMPLATE = `Good evening, teachers.

Please be reminded that the following teacher(s) are on duty for the coming week:

{TEACHERS}

Duty period: {START_DATE} - {END_DATE}

Kindly ensure you are present and punctual for all assemblies, breaks, and dismissal duties. Let us know if you need any adjustments in advance.

Thank you for your dedication!`;

// src/db/users.ts
async function getOrCreateUser(uid, email) {
  try {
    const result = await db.insert(users).values({
      uid,
      email
    }).onConflictDoUpdate({
      target: users.uid,
      set: {
        email
      }
    }).returning();
    const user = result[0];
    const existingSettings = await db.select().from(settings).where(eq(settings.userId, user.id));
    if (existingSettings.length === 0) {
      await db.insert(settings).values({
        userId: user.id,
        reminderEnabled: true,
        reminderDay: 0,
        reminderTime: "08:00",
        messageTemplate: DEFAULT_TEMPLATE,
        whatsAppBehavior: "app",
        targetGroupHint: "Teachers Staff Group"
      }).onConflictDoNothing();
    }
    return user;
  } catch (error) {
    console.error("Database user registration failed:", error);
    throw new Error("Database user registration failed. Please try again later.", { cause: error });
  }
}

// src/db/queries.ts
import { eq as eq2, desc, and } from "drizzle-orm";
async function getUserSettings(userId) {
  try {
    const result = await db.select().from(settings).where(eq2(settings.userId, userId));
    if (result.length === 0) return null;
    const row = result[0];
    return {
      reminderEnabled: row.reminderEnabled,
      reminderDay: row.reminderDay,
      reminderTime: row.reminderTime,
      messageTemplate: row.messageTemplate,
      whatsAppBehavior: row.whatsAppBehavior,
      targetGroupHint: row.targetGroupHint,
      googleSheetUrl: row.googleSheetUrl || void 0,
      lastSyncHash: row.lastSyncHash || void 0,
      updatedAt: row.updatedAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (error) {
    console.error("Failed to get user settings from DB:", error);
    throw new Error("Failed to load user settings.", { cause: error });
  }
}
async function saveUserSettings(userId, input) {
  try {
    await db.insert(settings).values({
      userId,
      reminderEnabled: input.reminderEnabled,
      reminderDay: input.reminderDay,
      reminderTime: input.reminderTime,
      messageTemplate: input.messageTemplate,
      whatsAppBehavior: input.whatsAppBehavior,
      targetGroupHint: input.targetGroupHint,
      googleSheetUrl: input.googleSheetUrl,
      lastSyncHash: input.lastSyncHash,
      updatedAt: /* @__PURE__ */ new Date()
    }).onConflictDoUpdate({
      target: settings.userId,
      set: {
        reminderEnabled: input.reminderEnabled,
        reminderDay: input.reminderDay,
        reminderTime: input.reminderTime,
        messageTemplate: input.messageTemplate,
        whatsAppBehavior: input.whatsAppBehavior,
        targetGroupHint: input.targetGroupHint,
        googleSheetUrl: input.googleSheetUrl,
        lastSyncHash: input.lastSyncHash,
        updatedAt: /* @__PURE__ */ new Date()
      }
    });
  } catch (error) {
    console.error("Failed to save user settings in DB:", error);
    throw new Error("Failed to save user settings.", { cause: error });
  }
}
async function getUserRosters(userId) {
  try {
    const result = await db.select().from(rosters).where(eq2(rosters.userId, userId)).orderBy(desc(rosters.uploadedAt));
    return result.map((r) => ({
      id: r.id,
      name: r.name,
      sourceType: r.sourceType,
      totalWeeks: r.totalWeeks,
      uploadedAt: r.uploadedAt,
      isActive: r.isActive
    }));
  } catch (error) {
    console.error("Failed to get user rosters from DB:", error);
    throw new Error("Failed to load rosters.", { cause: error });
  }
}
async function saveRosterWithAssignmentsInDb(userId, roster, assignments) {
  try {
    await db.update(rosters).set({ isActive: false }).where(eq2(rosters.userId, userId));
    await db.insert(rosters).values({
      id: roster.id,
      name: roster.name,
      sourceType: roster.sourceType,
      totalWeeks: roster.totalWeeks,
      uploadedAt: roster.uploadedAt,
      isActive: true,
      // Activated by default on upload
      userId
    }).onConflictDoUpdate({
      target: rosters.id,
      set: {
        name: roster.name,
        sourceType: roster.sourceType,
        totalWeeks: roster.totalWeeks,
        uploadedAt: roster.uploadedAt,
        isActive: true
      }
    });
    for (const a of assignments) {
      await db.insert(dutyAssignments).values({
        id: a.id,
        rosterId: roster.id,
        weekLabel: a.weekLabel,
        startDate: a.startDate,
        endDate: a.endDate,
        teachers: a.teachers,
        dutyTitle: a.dutyTitle,
        status: a.status,
        confidence: a.confidence,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
      }).onConflictDoUpdate({
        target: dutyAssignments.id,
        set: {
          weekLabel: a.weekLabel,
          startDate: a.startDate,
          endDate: a.endDate,
          teachers: a.teachers,
          dutyTitle: a.dutyTitle,
          status: a.status,
          confidence: a.confidence,
          updatedAt: a.updatedAt
        }
      });
    }
  } catch (error) {
    console.error("Failed to save roster and assignments in DB:", error);
    throw new Error("Failed to save roster to DB.", { cause: error });
  }
}
async function deleteUserRoster(userId, rosterId) {
  try {
    const rosterList = await db.select().from(rosters).where(and(eq2(rosters.id, rosterId), eq2(rosters.userId, userId)));
    if (rosterList.length === 0) {
      throw new Error("Unauthorized roster deletion or roster not found.");
    }
    const wasActive = rosterList[0].isActive;
    await db.delete(rosters).where(eq2(rosters.id, rosterId));
    if (wasActive) {
      const remaining = await db.select().from(rosters).where(eq2(rosters.userId, userId)).orderBy(desc(rosters.uploadedAt));
      if (remaining.length > 0) {
        await db.update(rosters).set({ isActive: true }).where(eq2(rosters.id, remaining[0].id));
      }
    }
  } catch (error) {
    console.error("Failed to delete roster from DB:", error);
    throw new Error("Failed to delete roster.", { cause: error });
  }
}
async function setActiveUserRoster(userId, rosterId) {
  try {
    const check = await db.select().from(rosters).where(and(eq2(rosters.id, rosterId), eq2(rosters.userId, userId)));
    if (check.length === 0) {
      throw new Error("Roster not found or unauthorized.");
    }
    await db.update(rosters).set({ isActive: false }).where(eq2(rosters.userId, userId));
    await db.update(rosters).set({ isActive: true }).where(eq2(rosters.id, rosterId));
  } catch (error) {
    console.error("Failed to set active roster in DB:", error);
    throw new Error("Failed to activate roster.", { cause: error });
  }
}
async function getUserDutyAssignments(userId) {
  try {
    const userRosters = await db.select({ id: rosters.id }).from(rosters).where(eq2(rosters.userId, userId));
    if (userRosters.length === 0) return [];
    const ids = userRosters.map((r) => r.id);
    const results = [];
    for (const rid of ids) {
      const r = await db.select().from(dutyAssignments).where(eq2(dutyAssignments.rosterId, rid));
      results.push(...r);
    }
    return results.map((a) => ({
      id: a.id,
      rosterId: a.rosterId,
      weekLabel: a.weekLabel,
      startDate: a.startDate,
      endDate: a.endDate,
      teachers: a.teachers,
      dutyTitle: a.dutyTitle,
      status: a.status,
      confidence: a.confidence,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt
    }));
  } catch (error) {
    console.error("Failed to get duty assignments from DB:", error);
    throw new Error("Failed to load duty assignments.", { cause: error });
  }
}
async function updateSpecificDutyAssignment(userId, assignment) {
  try {
    const rosterCheck = await db.select().from(rosters).where(and(eq2(rosters.id, assignment.rosterId), eq2(rosters.userId, userId)));
    if (rosterCheck.length === 0) {
      throw new Error("Unauthorized assignment edit or roster not found.");
    }
    await db.insert(dutyAssignments).values({
      id: assignment.id,
      rosterId: assignment.rosterId,
      weekLabel: assignment.weekLabel,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
      teachers: assignment.teachers,
      dutyTitle: assignment.dutyTitle,
      status: assignment.status,
      confidence: assignment.confidence,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt
    }).onConflictDoUpdate({
      target: dutyAssignments.id,
      set: {
        weekLabel: assignment.weekLabel,
        startDate: assignment.startDate,
        endDate: assignment.endDate,
        teachers: assignment.teachers,
        dutyTitle: assignment.dutyTitle,
        status: assignment.status,
        confidence: assignment.confidence,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (error) {
    console.error("Failed to update duty assignment in DB:", error);
    throw new Error("Failed to save duty assignment.", { cause: error });
  }
}
async function getUserSendHistory(userId) {
  try {
    const result = await db.select().from(sendHistory).where(eq2(sendHistory.userId, userId)).orderBy(desc(sendHistory.timestamp));
    return result.map((h) => ({
      id: h.id,
      assignmentId: h.assignmentId,
      weekLabel: h.weekLabel,
      dutyPeriod: h.dutyPeriod,
      message: h.message,
      timestamp: h.timestamp,
      status: h.status
    }));
  } catch (error) {
    console.error("Failed to get send history from DB:", error);
    throw new Error("Failed to load send history.", { cause: error });
  }
}
async function saveUserSendHistory(userId, h) {
  try {
    await db.insert(sendHistory).values({
      id: h.id,
      assignmentId: h.assignmentId,
      weekLabel: h.weekLabel,
      dutyPeriod: h.dutyPeriod,
      message: h.message,
      timestamp: h.timestamp,
      status: h.status,
      userId
    });
  } catch (error) {
    console.error("Failed to save send history in DB:", error);
    throw new Error("Failed to record send history.", { cause: error });
  }
}

// server.ts
dotenv2.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3e3;
  const isProd = process.env.NODE_ENV === "production";
  app.use(express.json({ limit: "30mb" }));
  app.use(express.urlencoded({ extended: true, limit: "30mb" }));
  app.post("/api/roster-parse", async (req, res) => {
    try {
      const result = await handleRosterParseApi(req.body);
      res.json(result);
    } catch (err) {
      console.error("API /api/roster-parse error:", err);
      res.status(500).json({ success: false, error: err.message || "Internal server error" });
    }
  });
  app.post("/api/auth/sync", requireAuth, async (req, res) => {
    try {
      const decodedUser = req.user;
      const userRecord = await getOrCreateUser(decodedUser.uid, decodedUser.email || "");
      res.json({ success: true, user: userRecord });
    } catch (err) {
      console.error("API /api/auth/sync error:", err);
      res.status(500).json({ error: err.message || "Failed to sync user." });
    }
  });
  app.get("/api/settings", requireAuth, async (req, res) => {
    try {
      const decodedUser = req.user;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || "");
      const settingsData = await getUserSettings(dbUser.id);
      res.json(settingsData);
    } catch (err) {
      console.error("API GET /api/settings error:", err);
      res.status(500).json({ error: err.message || "Failed to fetch settings." });
    }
  });
  app.post("/api/settings", requireAuth, async (req, res) => {
    try {
      const decodedUser = req.user;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || "");
      await saveUserSettings(dbUser.id, req.body);
      res.json({ success: true });
    } catch (err) {
      console.error("API POST /api/settings error:", err);
      res.status(500).json({ error: err.message || "Failed to save settings." });
    }
  });
  app.get("/api/rosters", requireAuth, async (req, res) => {
    try {
      const decodedUser = req.user;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || "");
      const rosterList = await getUserRosters(dbUser.id);
      res.json(rosterList);
    } catch (err) {
      console.error("API GET /api/rosters error:", err);
      res.status(500).json({ error: err.message || "Failed to load rosters." });
    }
  });
  app.post("/api/rosters", requireAuth, async (req, res) => {
    try {
      const decodedUser = req.user;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || "");
      const { roster, assignments } = req.body;
      await saveRosterWithAssignmentsInDb(dbUser.id, roster, assignments);
      res.json({ success: true });
    } catch (err) {
      console.error("API POST /api/rosters error:", err);
      res.status(500).json({ error: err.message || "Failed to save roster." });
    }
  });
  app.delete("/api/rosters/:id", requireAuth, async (req, res) => {
    try {
      const decodedUser = req.user;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || "");
      await deleteUserRoster(dbUser.id, req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("API DELETE /api/rosters error:", err);
      res.status(500).json({ error: err.message || "Failed to delete roster." });
    }
  });
  app.post("/api/rosters/active", requireAuth, async (req, res) => {
    try {
      const decodedUser = req.user;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || "");
      await setActiveUserRoster(dbUser.id, req.body.rosterId);
      res.json({ success: true });
    } catch (err) {
      console.error("API POST /api/rosters/active error:", err);
      res.status(500).json({ error: err.message || "Failed to activate roster." });
    }
  });
  app.get("/api/assignments", requireAuth, async (req, res) => {
    try {
      const decodedUser = req.user;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || "");
      const list = await getUserDutyAssignments(dbUser.id);
      res.json(list);
    } catch (err) {
      console.error("API GET /api/assignments error:", err);
      res.status(500).json({ error: err.message || "Failed to load assignments." });
    }
  });
  app.post("/api/assignments/update", requireAuth, async (req, res) => {
    try {
      const decodedUser = req.user;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || "");
      await updateSpecificDutyAssignment(dbUser.id, req.body.assignment);
      res.json({ success: true });
    } catch (err) {
      console.error("API POST /api/assignments/update error:", err);
      res.status(500).json({ error: err.message || "Failed to update assignment." });
    }
  });
  app.get("/api/send-history", requireAuth, async (req, res) => {
    try {
      const decodedUser = req.user;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || "");
      const list = await getUserSendHistory(dbUser.id);
      res.json(list);
    } catch (err) {
      console.error("API GET /api/send-history error:", err);
      res.status(500).json({ error: err.message || "Failed to fetch send history." });
    }
  });
  app.post("/api/send-history", requireAuth, async (req, res) => {
    try {
      const decodedUser = req.user;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || "");
      await saveUserSendHistory(dbUser.id, req.body);
      res.json({ success: true });
    } catch (err) {
      console.error("API POST /api/send-history error:", err);
      res.status(500).json({ error: err.message || "Failed to record history item." });
    }
  });
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Xtreme duty server running on port ${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
