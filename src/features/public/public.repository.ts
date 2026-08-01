import { and, eq, gte } from "drizzle-orm";
import { db } from "../../db";
import {
  universities,
  clubs,
  clubContactLinks,
  activities,
  activityClubs,
} from "../../db/schema";

/**
 * Kamuya açık okuma yüzeyi veri erişimi — yalnızca yayınlanmış + university görünürlüğü.
 */
export const publicRepository = {
  findActiveUniversityBySlug(slug: string) {
    return db.query.universities.findFirst({
      where: {
        slug,
        deletedAt: { isNull: true },
        status: { ne: "suspended" },
      },
      columns: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true },
    });
  },

  findApprovedClubBySlug(universityId: string, clubSlug: string) {
    return db.query.clubs.findFirst({
      where: { universityId, slug: clubSlug, status: "approved" },
      columns: {
        id: true,
        universityId: true,
        name: true,
        slug: true,
        description: true,
        logoUrl: true,
        coverUrl: true,
      },
    });
  },

  findClubContactLinks(clubId: string) {
    return db.query.clubContactLinks.findMany({
      where: { clubId },
      columns: { id: true, platform: true, url: true },
      orderBy: { platform: "asc" },
    });
  },

  /** Kulübün kamuya açık yaklaşan etkinlikleri (yalnızca published + university). */
  findUpcomingPublicActivitiesForClub(clubId: string) {
    const now = new Date();
    return db
      .select({
        id: activities.id,
        title: activities.title,
        description: activities.description,
        location: activities.location,
        coverUrl: activities.coverUrl,
        startsAt: activities.startsAt,
        endsAt: activities.endsAt,
        hostClubId: clubs.id,
        hostClubName: clubs.name,
        hostClubSlug: clubs.slug,
        hostClubLogoUrl: clubs.logoUrl,
      })
      .from(activities)
      .innerJoin(activityClubs, eq(activityClubs.activityId, activities.id))
      .innerJoin(clubs, eq(clubs.id, activityClubs.clubId))
      .where(
        and(
          eq(activityClubs.clubId, clubId),
          eq(activityClubs.status, "accepted"),
          eq(activities.status, "published"),
          eq(activities.visibility, "university"),
          gte(activities.startsAt, now)
        )
      )
      .orderBy(activities.startsAt);
  },

  findActivityDetail(activityId: string) {
    return db.query.activities.findFirst({
      where: { id: activityId },
      with: {
        activityClubs: {
          where: { status: "accepted" },
          with: {
            club: {
              columns: { id: true, name: true, slug: true, logoUrl: true, universityId: true },
            },
          },
        },
      },
    });
  },
};
