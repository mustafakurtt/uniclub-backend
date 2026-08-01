import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { clubMembershipEvents } from "../../db/schema";

export type MembershipEventInsert = {
  clubId: string;
  userId: string;
  universityId: string;
  eventType: "joined" | "role_changed" | "removed" | "left" | "join_rejected";
  role?: "member" | "officer" | "president" | null;
  previousRole?: "member" | "officer" | "president" | null;
  academicTermId?: string | null;
  actorId?: string | null;
  occurredAt?: Date;
};

export const membershipHistoryRepository = {
  async insertEvent(data: MembershipEventInsert) {
    const [row] = await db
      .insert(clubMembershipEvents)
      .values({
        clubId: data.clubId,
        userId: data.userId,
        universityId: data.universityId,
        eventType: data.eventType,
        role: data.role ?? null,
        previousRole: data.previousRole ?? null,
        academicTermId: data.academicTermId ?? null,
        actorId: data.actorId ?? null,
        occurredAt: data.occurredAt ?? new Date(),
      })
      .returning();
    return row;
  },

  listByClub(clubId: string, limit: number, cursor?: Date, academicTermId?: string) {
    return db.query.clubMembershipEvents.findMany({
      where: {
        clubId,
        ...(academicTermId ? { academicTermId } : {}),
        ...(cursor ? { occurredAt: { lt: cursor } } : {}),
      },
      orderBy: { occurredAt: "desc" },
      limit,
      with: {
        user: true,
        actor: true,
        academicTerm: true,
      },
    });
  },

  async countByEventType(eventType: MembershipEventInsert["eventType"]) {
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(clubMembershipEvents)
      .where(eq(clubMembershipEvents.eventType, eventType));
    return row?.count ?? 0;
  },
};
