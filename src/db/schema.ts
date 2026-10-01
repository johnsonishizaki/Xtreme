import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';

// 1. Users table (synced with Firebase Auth UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 2. Settings table
export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  reminderEnabled: boolean('reminder_enabled').default(true).notNull(),
  reminderDay: integer('reminder_day').default(0).notNull(), // 0 = Sunday
  reminderTime: text('reminder_time').default('08:00').notNull(),
  messageTemplate: text('message_template').notNull(),
  whatsAppBehavior: text('whatsapp_behavior').default('app').notNull(),
  targetGroupHint: text('target_group_hint').default('Teachers Staff Group').notNull(),
  googleSheetUrl: text('google_sheet_url'),
  lastSyncHash: text('last_sync_hash'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 3. Rosters table
export const rosters = pgTable('rosters', {
  id: text('id').primaryKey(), // We use custom string IDs like roster-sync-*
  name: text('name').notNull(),
  sourceType: text('source_type').notNull(), // excel, csv, pdf, sheets, sample
  totalWeeks: integer('total_weeks').notNull(),
  uploadedAt: text('uploaded_at').notNull(), // Store ISO string for compatibility with frontend
  isActive: boolean('is_active').default(false).notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
});

// 4. Duty Assignments table
export const dutyAssignments = pgTable('duty_assignments', {
  id: text('id').primaryKey(), // Custom ID
  rosterId: text('roster_id')
    .references(() => rosters.id, { onDelete: 'cascade' })
    .notNull(),
  weekLabel: text('week_label').notNull(),
  startDate: text('start_date').notNull(), // ISO YYYY-MM-DD
  endDate: text('end_date').notNull(), // ISO YYYY-MM-DD
  teachers: jsonb('teachers').notNull(), // Array of { name: string, role: string }
  dutyTitle: text('duty_title').notNull(),
  status: text('status').notNull(), // confirmed, needs_review
  confidence: text('confidence').notNull(), // high, review_needed
  createdAt: text('created_at').notNull(), // Store ISO string
  updatedAt: text('updated_at').notNull(), // Store ISO string
});

// 5. Send History table
export const sendHistory = pgTable('send_history', {
  id: text('id').primaryKey(), // Custom ID
  assignmentId: text('assignment_id').notNull(),
  weekLabel: text('week_label').notNull(),
  dutyPeriod: text('duty_period').notNull(),
  message: text('message').notNull(),
  timestamp: text('timestamp').notNull(), // ISO string
  status: text('status').notNull(), // copied, sent_confirmed
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
});

// Relationships
export const usersRelations = relations(users, ({ one, many }) => ({
  settings: one(settings, {
    fields: [users.id],
    references: [settings.userId],
  }),
  rosters: many(rosters),
  sendHistory: many(sendHistory),
}));

export const settingsRelations = relations(settings, ({ one }) => ({
  user: one(users, {
    fields: [settings.userId],
    references: [users.id],
  }),
}));

export const rostersRelations = relations(rosters, ({ one, many }) => ({
  user: one(users, {
    fields: [rosters.userId],
    references: [users.id],
  }),
  assignments: many(dutyAssignments),
}));

export const dutyAssignmentsRelations = relations(dutyAssignments, ({ one }) => ({
  roster: one(rosters, {
    fields: [dutyAssignments.rosterId],
    references: [rosters.id],
  }),
}));

export const sendHistoryRelations = relations(sendHistory, ({ one }) => ({
  user: one(users, {
    fields: [sendHistory.userId],
    references: [users.id],
  }),
}));
