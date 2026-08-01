import { and, eq, inArray, or, sql, desc } from "drizzle-orm";
import { db } from "../../db";
import {
  posterQrCodes,
  posterQrScans,
  clubs,
  activities,
  activityClubs,
  universities,
} from "../../db/schema";
import type { CreatePosterQrPayload, UpdatePosterQrPayload } from "./poster-qr.types";

export const posterQrRepository = {
  findByCode(code: string) {
    return db.query.posterQrCodes.findFirst({
      where: { code },
    });
  },

  findById(id: string) {
    return db.query.posterQrCodes.findFirst({
      where: { id },
    });
  },

  async create(
    universityId: string,
    code: string,
    createdBy: string,
    payload: CreatePosterQrPayload
  ) {
    const [row] = await db
      .insert(posterQrCodes)
      .values({
        universityId,
        code,
        sourceLabel: payload.sourceLabel,
        targetType: payload.targetType,
        targetClubId: payload.targetType === "club" ? payload.targetClubId : null,
        targetActivityId: payload.targetType === "activity" ? payload.targetActivityId : null,
        validFrom: payload.validFrom ?? null,
        validUntil: payload.validUntil ?? null,
        createdBy,
      })
      .returning();
    return row;
  },

  async update(id: string, payload: UpdatePosterQrPayload) {
    const patch: Partial<typeof posterQrCodes.$inferInsert> = {};
    if (payload.sourceLabel !== undefined) patch.sourceLabel = payload.sourceLabel;
    if (payload.validFrom !== undefined) patch.validFrom = payload.validFrom;
    if (payload.validUntil !== undefined) patch.validUntil = payload.validUntil;
    if (payload.targetType !== undefined) {
      patch.targetType = payload.targetType;
      if (payload.targetType === "club") {
        patch.targetClubId = payload.targetClubId ?? undefined;
        patch.targetActivityId = null;
      } else {
        patch.targetActivityId = payload.targetActivityId ?? undefined;
        patch.targetClubId = null;
      }
    } else {
      if (payload.targetClubId !== undefined) patch.targetClubId = payload.targetClubId;
      if (payload.targetActivityId !== undefined) patch.targetActivityId = payload.targetActivityId;
    }

    const [row] = await db
      .update(posterQrCodes)
      .set(patch)
      .where(eq(posterQrCodes.id, id))
      .returning();
    return row;
  },

  async cancel(id: string) {
    const [row] = await db
      .update(posterQrCodes)
      .set({ status: "cancelled" })
      .where(eq(posterQrCodes.id, id))
      .returning();
    return row;
  },

  listByUniversity(universityId: string) {
    return db.query.posterQrCodes.findMany({
      where: { universityId },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Kulüp sayfasına veya kulübün host etkinliklerine hedeflenen kodlar. */
  async listForClub(clubId: string) {
    const hosted = await db
      .select({ activityId: activityClubs.activityId })
      .from(activityClubs)
      .where(and(eq(activityClubs.clubId, clubId), eq(activityClubs.role, "host")));
    const hostedIds = hosted.map((h) => h.activityId);

    const targetFilter =
      hostedIds.length > 0
        ? or(eq(posterQrCodes.targetClubId, clubId), inArray(posterQrCodes.targetActivityId, hostedIds))
        : eq(posterQrCodes.targetClubId, clubId);

    return db
      .select()
      .from(posterQrCodes)
      .where(targetFilter)
      .orderBy(desc(posterQrCodes.createdAt));
  },

  async recordScan(qrCodeId: string) {
    await db.transaction(async (tx) => {
      await tx.insert(posterQrScans).values({ qrCodeId });
      await tx
        .update(posterQrCodes)
        .set({ scanCount: sql`${posterQrCodes.scanCount} + 1` })
        .where(eq(posterQrCodes.id, qrCodeId));
    });
  },

  findApprovedClubInUniversity(universityId: string, clubId: string) {
    return db.query.clubs.findFirst({
      where: { id: clubId, universityId, status: "approved" },
      columns: { id: true, slug: true, universityId: true },
      with: {
        university: { columns: { slug: true } },
      },
    });
  },

  findPublicActivityInUniversity(universityId: string, activityId: string) {
    return db.query.activities.findFirst({
      where: {
        id: activityId,
        status: "published",
        visibility: "university",
      },
      columns: { id: true },
      with: {
        activityClubs: {
          where: { status: "accepted", role: "host" },
          with: {
            club: {
              columns: { id: true, universityId: true, slug: true },
              with: { university: { columns: { slug: true } } },
            },
          },
        },
      },
    });
  },

  isActivityHostedByClub(activityId: string, clubId: string) {
    return db.query.activityClubs.findFirst({
      where: {
        activityId,
        clubId,
        role: "host",
        status: "accepted",
      },
      columns: { activityId: true },
    });
  },

  findUniversitySlug(universityId: string) {
    return db.query.universities.findFirst({
      where: { id: universityId },
      columns: { slug: true },
    });
  },
};
