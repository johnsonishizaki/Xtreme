// src/db/users.ts
import { db } from './index.ts';
import { users, settings } from './schema.ts';
import { eq } from 'drizzle-orm';
import { DEFAULT_TEMPLATE } from '../services/firebase.ts';

export async function getOrCreateUser(uid: string, email: string) {
  try {
    // Use upsert to handle concurrent inserts of the same user ID safely.
    // Updates email if the user already exists, or inserts a new record.
    const result = await db.insert(users)
      .values({
        uid,
        email,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
        },
      })
      .returning();

    const user = result[0];

    // Ensure they have associated settings
    const existingSettings = await db.select().from(settings).where(eq(settings.userId, user.id));
    if (existingSettings.length === 0) {
      await db.insert(settings)
        .values({
          userId: user.id,
          reminderEnabled: true,
          reminderDay: 0,
          reminderTime: '08:00',
          messageTemplate: DEFAULT_TEMPLATE,
          whatsAppBehavior: 'app',
          targetGroupHint: 'Teachers Staff Group',
        })
        .onConflictDoNothing();
    }

    return user;
  } catch (error) {
    console.error("Database user registration failed:", error);
    throw new Error("Database user registration failed. Please try again later.", { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  try {
    const result = await db.select().from(users).where(eq(users.uid, uid));
    return result[0] || null;
  } catch (error) {
    console.error("Failed to fetch user by UID:", error);
    throw new Error("Failed to fetch user profiles.", { cause: error });
  }
}
