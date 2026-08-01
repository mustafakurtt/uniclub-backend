import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { academicTerms, clubMembershipEvents } from "../../db/schema";
import type { CreateAcademicTermDTO, UpdateAcademicTermDTO } from "./academic-terms.schema";

export const academicTermsRepository = {
  listByUniversity(universityId: string) {
    return db.query.academicTerms.findMany({
      where: { universityId },
      orderBy: { startsAt: "desc" },
    });
  },

  findInUniversity(universityId: string, termId: string) {
    return db.query.academicTerms.findFirst({
      where: { id: termId, universityId },
    });
  },

  findActiveAt(universityId: string, at: Date) {
    return db.query.academicTerms.findFirst({
      where: {
        universityId,
        status: "open",
        startsAt: { lte: at },
        endsAt: { gte: at },
      },
    });
  },

  async create(universityId: string, data: CreateAcademicTermDTO) {
    const [row] = await db
      .insert(academicTerms)
      .values({
        universityId,
        name: data.name,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        status: data.status ?? "open",
      })
      .returning();
    return row;
  },

  async update(termId: string, data: UpdateAcademicTermDTO) {
    const patch: Partial<typeof academicTerms.$inferInsert> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.startsAt !== undefined) patch.startsAt = new Date(data.startsAt);
    if (data.endsAt !== undefined) patch.endsAt = new Date(data.endsAt);
    if (data.status !== undefined) patch.status = data.status;

    const [row] = await db
      .update(academicTerms)
      .set(patch)
      .where(eq(academicTerms.id, termId))
      .returning();
    return row;
  },

  async delete(termId: string) {
    await db.delete(academicTerms).where(eq(academicTerms.id, termId));
  },

  async countMembershipEvents(termId: string) {
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(clubMembershipEvents)
      .where(eq(clubMembershipEvents.academicTermId, termId));
    return row?.count ?? 0;
  },
};
