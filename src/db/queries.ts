// src/db/queries.ts
import { db } from './index.ts';
import { users, settings, rosters, dutyAssignments, sendHistory } from './schema.ts';
import { eq, desc, and } from 'drizzle-orm';
import { AppSettings, DutyAssignment, Roster, SendHistory } from '../types';

// --- SETTINGS ---
export async function getUserSettings(userId: number): Promise<AppSettings | null> {
  try {
    const result = await db.select().from(settings).where(eq(settings.userId, userId));
    if (result.length === 0) return null;
    
    const row = result[0];
    return {
      reminderEnabled: row.reminderEnabled,
      reminderDay: row.reminderDay,
      reminderTime: row.reminderTime,
      messageTemplate: row.messageTemplate,
      whatsAppBehavior: row.whatsAppBehavior as any,
      targetGroupHint: row.targetGroupHint,
      googleSheetUrl: row.googleSheetUrl || undefined,
      lastSyncHash: row.lastSyncHash || undefined,
      updatedAt: row.updatedAt?.toISOString() || new Date().toISOString()
    };
  } catch (error) {
    console.error("Failed to get user settings from DB:", error);
    throw new Error("Failed to load user settings.", { cause: error });
  }
}

export async function saveUserSettings(userId: number, input: AppSettings): Promise<void> {
  try {
    await db.insert(settings)
      .values({
        userId,
        reminderEnabled: input.reminderEnabled,
        reminderDay: input.reminderDay,
        reminderTime: input.reminderTime,
        messageTemplate: input.messageTemplate,
        whatsAppBehavior: input.whatsAppBehavior,
        targetGroupHint: input.targetGroupHint,
        googleSheetUrl: input.googleSheetUrl,
        lastSyncHash: input.lastSyncHash,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
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
          updatedAt: new Date(),
        }
      });
  } catch (error) {
    console.error("Failed to save user settings in DB:", error);
    throw new Error("Failed to save user settings.", { cause: error });
  }
}

// --- ROSTERS & ASSIGNMENTS ---
export async function getUserRosters(userId: number): Promise<Roster[]> {
  try {
    const result = await db.select().from(rosters).where(eq(rosters.userId, userId)).orderBy(desc(rosters.uploadedAt));
    return result.map(r => ({
      id: r.id,
      name: r.name,
      sourceType: r.sourceType as any,
      totalWeeks: r.totalWeeks,
      uploadedAt: r.uploadedAt,
      isActive: r.isActive
    }));
  } catch (error) {
    console.error("Failed to get user rosters from DB:", error);
    throw new Error("Failed to load rosters.", { cause: error });
  }
}

export async function saveRosterWithAssignmentsInDb(
  userId: number,
  roster: Roster,
  assignments: DutyAssignment[]
): Promise<void> {
  try {
    // 1. Deactivate other active rosters for this user
    await db.update(rosters)
      .set({ isActive: false })
      .where(eq(rosters.userId, userId));

    // 2. Insert or update the new roster
    await db.insert(rosters)
      .values({
        id: roster.id,
        name: roster.name,
        sourceType: roster.sourceType,
        totalWeeks: roster.totalWeeks,
        uploadedAt: roster.uploadedAt,
        isActive: true, // Activated by default on upload
        userId: userId,
      })
      .onConflictDoUpdate({
        target: rosters.id,
        set: {
          name: roster.name,
          sourceType: roster.sourceType,
          totalWeeks: roster.totalWeeks,
          uploadedAt: roster.uploadedAt,
          isActive: true,
        }
      });

    // 3. Insert or update assignments
    for (const a of assignments) {
      await db.insert(dutyAssignments)
        .values({
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
          updatedAt: a.updatedAt,
        })
        .onConflictDoUpdate({
          target: dutyAssignments.id,
          set: {
            weekLabel: a.weekLabel,
            startDate: a.startDate,
            endDate: a.endDate,
            teachers: a.teachers,
            dutyTitle: a.dutyTitle,
            status: a.status,
            confidence: a.confidence,
            updatedAt: a.updatedAt,
          }
        });
    }
  } catch (error) {
    console.error("Failed to save roster and assignments in DB:", error);
    throw new Error("Failed to save roster to DB.", { cause: error });
  }
}

export async function deleteUserRoster(userId: number, rosterId: string): Promise<void> {
  try {
    // First, verify ownership of the roster
    const rosterList = await db.select().from(rosters).where(and(eq(rosters.id, rosterId), eq(rosters.userId, userId)));
    if (rosterList.length === 0) {
      throw new Error("Unauthorized roster deletion or roster not found.");
    }

    const wasActive = rosterList[0].isActive;

    // Delete roster (foreign keys cascading will delete assignments!)
    await db.delete(rosters).where(eq(rosters.id, rosterId));

    // If deleted roster was active, find another roster for this user to make active
    if (wasActive) {
      const remaining = await db.select().from(rosters).where(eq(rosters.userId, userId)).orderBy(desc(rosters.uploadedAt));
      if (remaining.length > 0) {
        await db.update(rosters).set({ isActive: true }).where(eq(rosters.id, remaining[0].id));
      }
    }
  } catch (error) {
    console.error("Failed to delete roster from DB:", error);
    throw new Error("Failed to delete roster.", { cause: error });
  }
}

export async function setActiveUserRoster(userId: number, rosterId: string): Promise<void> {
  try {
    // 1. Verify ownership of the target roster
    const check = await db.select().from(rosters).where(and(eq(rosters.id, rosterId), eq(rosters.userId, userId)));
    if (check.length === 0) {
      throw new Error("Roster not found or unauthorized.");
    }

    // 2. Deactivate all for user
    await db.update(rosters).set({ isActive: false }).where(eq(rosters.userId, userId));

    // 3. Activate target roster
    await db.update(rosters).set({ isActive: true }).where(eq(rosters.id, rosterId));
  } catch (error) {
    console.error("Failed to set active roster in DB:", error);
    throw new Error("Failed to activate roster.", { cause: error });
  }
}

// --- DUTY ASSIGNMENTS ---
export async function getUserDutyAssignments(userId: number): Promise<DutyAssignment[]> {
  try {
    // Find all assignments belonging to any rosters owned by this user
    const userRosters = await db.select({ id: rosters.id }).from(rosters).where(eq(rosters.userId, userId));
    if (userRosters.length === 0) return [];
    
    const ids = userRosters.map(r => r.id);
    const results: any[] = [];
    for (const rid of ids) {
      const r = await db.select().from(dutyAssignments).where(eq(dutyAssignments.rosterId, rid));
      results.push(...r);
    }

    return results.map(a => ({
      id: a.id,
      rosterId: a.rosterId,
      weekLabel: a.weekLabel,
      startDate: a.startDate,
      endDate: a.endDate,
      teachers: a.teachers as any,
      dutyTitle: a.dutyTitle,
      status: a.status as any,
      confidence: a.confidence as any,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt
    }));
  } catch (error) {
    console.error("Failed to get duty assignments from DB:", error);
    throw new Error("Failed to load duty assignments.", { cause: error });
  }
}

export async function updateSpecificDutyAssignment(userId: number, assignment: DutyAssignment): Promise<void> {
  try {
    // Verify assignment belongs to a roster owned by this user
    const rosterCheck = await db.select().from(rosters).where(and(eq(rosters.id, assignment.rosterId), eq(rosters.userId, userId)));
    if (rosterCheck.length === 0) {
      throw new Error("Unauthorized assignment edit or roster not found.");
    }

    await db.insert(dutyAssignments)
      .values({
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
        updatedAt: assignment.updatedAt,
      })
      .onConflictDoUpdate({
        target: dutyAssignments.id,
        set: {
          weekLabel: assignment.weekLabel,
          startDate: assignment.startDate,
          endDate: assignment.endDate,
          teachers: assignment.teachers,
          dutyTitle: assignment.dutyTitle,
          status: assignment.status,
          confidence: assignment.confidence,
          updatedAt: new Date().toISOString(),
        }
      });
  } catch (error) {
    console.error("Failed to update duty assignment in DB:", error);
    throw new Error("Failed to save duty assignment.", { cause: error });
  }
}

// --- SEND HISTORY ---
export async function getUserSendHistory(userId: number): Promise<SendHistory[]> {
  try {
    const result = await db.select().from(sendHistory).where(eq(sendHistory.userId, userId)).orderBy(desc(sendHistory.timestamp));
    return result.map(h => ({
      id: h.id,
      assignmentId: h.assignmentId,
      weekLabel: h.weekLabel,
      dutyPeriod: h.dutyPeriod,
      message: h.message,
      timestamp: h.timestamp,
      status: h.status as any
    }));
  } catch (error) {
    console.error("Failed to get send history from DB:", error);
    throw new Error("Failed to load send history.", { cause: error });
  }
}

export async function saveUserSendHistory(userId: number, h: SendHistory): Promise<void> {
  try {
    await db.insert(sendHistory)
      .values({
        id: h.id,
        assignmentId: h.assignmentId,
        weekLabel: h.weekLabel,
        dutyPeriod: h.dutyPeriod,
        message: h.message,
        timestamp: h.timestamp,
        status: h.status,
        userId: userId,
      });
  } catch (error) {
    console.error("Failed to save send history in DB:", error);
    throw new Error("Failed to record send history.", { cause: error });
  }
}
