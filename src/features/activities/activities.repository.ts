import { and, eq, gte, lt, sql, getTableColumns, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { activities, activityClubs, activityAttendees, clubs, clubMembers } from "../../db/schema";
import { BaseRepository } from "../../core/db";
import { CreateActivityPayload, RsvpStatus } from "./activities.types";

/**
 * Etkinlik veri erişimi. Birincil tablo `activities` — BaseRepository'yi extend
 * eder, mekanik CRUD'u tabandan alır. `activity_clubs` ve `activity_attendees`
 * BİLEŞİK anahtarlı (id yok) olduğu için BaseRepository kapsamı dışındadır;
 * onların işleri ham Drizzle ile yazılır. Çok-adımlı işlemler (oluşturma +
 * host bağı, kapasiteli RSVP) transaction içinde.
 *
 * Kulüp↔etkinlik M:N (activity_clubs) → "tenant" bir kolon değil, host/co_host
 * kulüplerden türetilir; keşif sorgusu bu yüzden clubs üzerinden JOIN'le filtreler.
 */
class ActivitiesRepository extends BaseRepository<typeof activities, typeof db.query.activities> {
  constructor() {
    super(db, activities, { query: db.query.activities });
  }

  // ── Oluşturma / güncelleme / iptal ───────────────────────────────────────
  /**
   * Etkinliği ve onun tekil host kulüp bağını tek transaction'da oluşturur
   * (yarım kalırsa host'suz etkinlik olmasın). `status` ile "published"
   * (anında yayın) veya "draft" (taslak) doğar.
   */
  createWithHost(
    hostClubId: string,
    createdBy: string,
    data: CreateActivityPayload,
    status: "draft" | "published"
  ) {
    return this.transaction(async (_repo, tx) => {
      const [activity] = await tx.insert(activities).values({
        title: data.title,
        description: data.description,
        location: data.location,
        coverUrl: data.coverUrl,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        capacity: data.capacity,
        visibility: data.visibility,
        status,
        createdBy,
      }).returning();

      await tx.insert(activityClubs).values({
        activityId: activity.id,
        clubId: hostClubId,
        role: "host",
      });

      return activity;
    });
  }

  updateActivity(activityId: string, data: Partial<CreateActivityPayload>) {
    return this.updateById(activityId, data);
  }

  cancelActivity(activityId: string) {
    return this.updateById(activityId, { status: "cancelled" });
  }

  publishActivity(activityId: string) {
    return this.updateById(activityId, { status: "published" });
  }

  /** Etkinlik bu üniversiteye ait mi? (accepted bir kulüp bağı o tenant'ta) — moderasyon tenant kontrolü. */
  async isActivityInUniversity(activityId: string, universityId: string): Promise<boolean> {
    const [row] = await db
      .select({ one: sql<number>`1` })
      .from(activityClubs)
      .innerJoin(clubs, eq(clubs.id, activityClubs.clubId))
      .where(
        and(
          eq(activityClubs.activityId, activityId),
          eq(activityClubs.status, "accepted"),
          eq(clubs.universityId, universityId)
        )
      )
      .limit(1);
    return !!row;
  }

  // ── Okuma (tekil / ilişkili) ─────────────────────────────────────────────
  /** Detay: katılan kulüpler (rol+kulüp) + oluşturan. Katılımcı sayısı ayrı çekilir. */
  findDetailById(activityId: string) {
    return this.query!.findFirst({
      where: { id: activityId },
      with: {
        creator: true,
        activityClubs: { with: { club: true } },
      },
    });
  }

  /** Etkinliğin host kulübünün id'si (yetki/tenant çözümünde kullanılır). */
  async getHostClubId(activityId: string): Promise<string | undefined> {
    const row = await db.query.activityClubs.findFirst({
      where: { activityId, role: "host" },
      columns: { clubId: true },
    });
    return row?.clubId;
  }

  /** Bu kulüp bu etkinliğin host'u mu? (staff yönetim rotalarının sahiplik kontrolü) */
  async isHostClub(activityId: string, clubId: string): Promise<boolean> {
    const row = await db.query.activityClubs.findFirst({
      where: { activityId, clubId, role: "host" },
      columns: { clubId: true },
    });
    return !!row;
  }

  /** Etkinliğin KABUL EDİLMİŞ kulüplerinin benzersiz üniversite id'leri — cache invalidasyonu. */
  async getAcceptedUniversityIds(activityId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ universityId: clubs.universityId })
      .from(activityClubs)
      .innerJoin(clubs, eq(clubs.id, activityClubs.clubId))
      .where(and(eq(activityClubs.activityId, activityId), eq(activityClubs.status, "accepted")));
    return rows.map((r) => r.universityId);
  }

  /** Bir kulübün onaylı üye id'leri (yayın bildirimini üyelere göndermek için). */
  async getApprovedMemberIds(clubId: string): Promise<string[]> {
    const rows = await db.query.clubMembers.findMany({
      where: { clubId, status: "approved" },
      columns: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  /** Verilen kulüplerin herhangi birinde kullanıcının ONAYLI üyeliği var mı? (members görünürlüğü) */
  async isApprovedMemberOfAny(userId: string, clubIds: string[]): Promise<boolean> {
    if (clubIds.length === 0) return false;
    const row = await db.query.clubMembers.findFirst({
      where: { userId, clubId: { in: clubIds }, status: "approved" },
      columns: { userId: true },
    });
    return !!row;
  }

  /**
   * Kullanıcı bu kulübün STAFF'ı mı? (officer/president onaylı üyeliği VEYA danışman)
   * — club.middleware.requireClubStaff ile aynı tanım; taslak görünürlüğünde kullanılır.
   */
  async isClubStaff(clubId: string, userId: string): Promise<boolean> {
    const membership = await db.query.clubMembers.findFirst({
      where: { clubId, userId, status: "approved" },
      columns: { role: true },
    });
    if (membership && (membership.role === "officer" || membership.role === "president")) return true;
    const advisor = await db.query.clubAdvisors.findFirst({
      where: { clubId, userId },
      columns: { userId: true },
    });
    return !!advisor;
  }

  // ── Co-host davet/kabul (activity_clubs.status) ──────────────────────────
  async clubExists(clubId: string): Promise<boolean> {
    const row = await db.query.clubs.findFirst({ where: { id: clubId }, columns: { id: true } });
    return !!row;
  }

  /** Bir kulübün bu etkinlikteki bağı (host/co_host, invited/accepted) — yoksa undefined. */
  findActivityClub(activityId: string, clubId: string) {
    return db.query.activityClubs.findFirst({ where: { activityId, clubId } });
  }

  /** Etkinliğin tüm kulüp bağları (rol+status), kulüp gömülü — co-host yönetim listesi. */
  listActivityClubs(activityId: string) {
    return db.query.activityClubs.findMany({
      where: { activityId },
      with: { club: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async addCoHostInvite(activityId: string, clubId: string) {
    const [row] = await db
      .insert(activityClubs)
      .values({ activityId, clubId, role: "co_host", status: "invited" })
      .returning();
    return row;
  }

  async setCoHostAccepted(activityId: string, clubId: string) {
    const [row] = await db
      .update(activityClubs)
      .set({ status: "accepted" })
      .where(and(eq(activityClubs.activityId, activityId), eq(activityClubs.clubId, clubId)))
      .returning();
    return row;
  }

  async removeActivityClub(activityId: string, clubId: string): Promise<boolean> {
    const rows = await db
      .delete(activityClubs)
      .where(and(eq(activityClubs.activityId, activityId), eq(activityClubs.clubId, clubId)))
      .returning();
    return rows.length > 0;
  }

  /** Bir kulübün STAFF id'leri (officer/president + danışman) — co-host daveti bildirimi. */
  async getStaffIds(clubId: string): Promise<string[]> {
    const officers = await db.query.clubMembers.findMany({
      where: { clubId, status: "approved", role: { in: ["officer", "president"] } },
      columns: { userId: true },
    });
    const advisors = await db.query.clubAdvisors.findMany({
      where: { clubId },
      columns: { userId: true },
    });
    return [...new Set([...officers.map((o) => o.userId), ...advisors.map((a) => a.userId)])];
  }

  // ── Keşif (üniversite geneli) ────────────────────────────────────────────
  /**
   * Bir üniversitedeki YAYINLANMIŞ + `university` görünürlüğündeki etkinlikler.
   * activity_clubs → clubs JOIN'iyle tenant'a göre filtreler (tenant kolonu yok).
   * DISTINCT: co-hosted etkinlik iki kulüple eşleşse de tek satır döner.
   * members görünürlüğündekiler genel keşifte GÖSTERİLMEZ (kulüp içi akışa aittir).
   */
  listForUniversity(universityId: string, scope: "upcoming" | "past" | "all", search?: string) {
    const now = new Date();
    const filters: SQL[] = [
      eq(clubs.universityId, universityId),
      eq(activityClubs.status, "accepted"), // invited (bekleyen) co-host tenant'a etkinlik SAYMAZ
      eq(activities.status, "published"),
      eq(activities.visibility, "university"),
    ];
    if (scope === "upcoming") filters.push(gte(activities.startsAt, now));
    if (scope === "past") filters.push(lt(activities.startsAt, now));
    if (search) filters.push(sql`${activities.title} ilike ${`%${search}%`}`);

    return db
      .selectDistinct(getTableColumns(activities))
      .from(activities)
      .innerJoin(activityClubs, eq(activityClubs.activityId, activities.id))
      .innerJoin(clubs, eq(clubs.id, activityClubs.clubId))
      .where(and(...filters))
      .orderBy(scope === "past" ? sql`${activities.startsAt} desc` : sql`${activities.startsAt} asc`);
  }

  /**
   * Bir kulübün etkinlikleri (kulüp sayfası; görünürlük serviste süzülür).
   * `includeDrafts` yalnızca kulüp STAFF'ı için true geçilir — taslaklar dışarı sızmaz.
   * Bağ `accepted` olmalı: davet edilmiş (invited) ama kabul etmemiş co-host,
   * etkinliği kabul edene kadar kendi listesinde GÖRMEZ.
   */
  listByClub(clubId: string, includeDrafts: boolean) {
    const statusFilter = includeDrafts ? sql`true` : sql`${activities.status} <> 'draft'`;
    return db
      .select(getTableColumns(activities))
      .from(activities)
      .innerJoin(activityClubs, eq(activityClubs.activityId, activities.id))
      .where(and(eq(activityClubs.clubId, clubId), eq(activityClubs.status, "accepted"), statusFilter))
      .orderBy(sql`${activities.startsAt} desc`);
  }

  // ── Katılım (RSVP + yoklama) ─────────────────────────────────────────────
  findAttendee(activityId: string, userId: string) {
    return db.query.activityAttendees.findFirst({ where: { activityId, userId } });
  }

  /** 'going' katılımcı sayısı — kapasite kontrolünde kullanılır ('interested' saymaz). */
  async countGoing(activityId: string, tx = db): Promise<number> {
    const [row] = await tx
      .select({ value: sql<number>`cast(count(*) as int)` })
      .from(activityAttendees)
      .where(and(eq(activityAttendees.activityId, activityId), eq(activityAttendees.status, "going")));
    return row?.value ?? 0;
  }

  listAttendees(activityId: string) {
    return db.query.activityAttendees.findMany({
      where: { activityId },
      with: { user: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /** "Etkinliklerim": kullanıcının RSVP'leri + etkinlik ve host kulübü gömülü. */
  listByUser(userId: string) {
    return db.query.activityAttendees.findMany({
      where: { userId },
      with: {
        activity: {
          with: { activityClubs: { with: { club: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Kapasiteli RSVP: kontenjan doluysa 'going' eklemeyi reddet. Sayım+yazma tek
   * transaction'da — yüksek eşzamanlılıkta kontenjanı 1-2 aşabilecek teorik yarış
   * için ileride satır kilidi/serializable gerekir; v1 için bu düzey yeterli.
   * `interested` kapasiteye TABİ DEĞİLDİR. capacity null = sınırsız.
   * Dönüş: upsert edilen katılım satırı, VEYA kontenjan doluysa null.
   */
  upsertAttendeeWithCapacity(
    activityId: string,
    userId: string,
    status: RsvpStatus,
    capacity: number | null
  ) {
    return this.transaction(async (_repo, tx) => {
      if (status === "going" && capacity !== null) {
        // Ham select (tx.query değil): tx gevşek tipli olduğundan ilişkisel where
        // tip güvenli değil; countGoing ile aynı ham-Drizzle yaklaşımı.
        const existing = await tx
          .select({ status: activityAttendees.status })
          .from(activityAttendees)
          .where(and(eq(activityAttendees.activityId, activityId), eq(activityAttendees.userId, userId)))
          .limit(1);
        const alreadyGoing = existing[0]?.status === "going";
        // Zaten 'going' olan biri tekrar 'going' derse kontenjan tüketmez (idempotent).
        if (!alreadyGoing) {
          const going = await this.countGoing(activityId, tx as unknown as typeof db);
          if (going >= capacity) return null;
        }
      }

      const [row] = await tx
        .insert(activityAttendees)
        .values({ activityId, userId, status })
        .onConflictDoUpdate({
          target: [activityAttendees.activityId, activityAttendees.userId],
          set: { status },
        })
        .returning();
      return row;
    });
  }

  async removeAttendee(activityId: string, userId: string): Promise<boolean> {
    const rows = await db
      .delete(activityAttendees)
      .where(and(eq(activityAttendees.activityId, activityId), eq(activityAttendees.userId, userId)))
      .returning();
    return rows.length > 0;
  }

  /** Yoklama: checked_in_at = now (işaretle) veya null (geri al). Etkilenen satır döner. */
  async setCheckIn(activityId: string, userId: string, at: Date | null) {
    const [row] = await db
      .update(activityAttendees)
      .set({ checkedInAt: at })
      .where(and(eq(activityAttendees.activityId, activityId), eq(activityAttendees.userId, userId)))
      .returning();
    return row;
  }
}

export const activitiesRepository = new ActivitiesRepository();
