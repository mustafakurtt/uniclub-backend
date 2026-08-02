import { activitiesRepository } from "./activities.repository";
import { badRequest } from "../../shared/utils/errors";
import { RsvpDTO } from "./activities.schema";
import { assertCanRsvp } from "./activities-guards.util";

/** Katılım bildirme (RSVP) — kapasite ve görünürlük kapıları. */
export const activitiesRsvpService = {
  /**
   * Katılım bildirme (RSVP). Yayınlanmış + görünür + gelecek bir etkinlik olmalı;
   * 'going' için kapasite kontrol edilir (dolu → 400). Upsert: aynı kullanıcı
   * durumunu değiştirebilir (interested ↔ going).
   */
  async rsvp(userId: string, universityId: string, activityId: string, data: RsvpDTO) {
    const detail = await assertCanRsvp(userId, universityId, activityId);
    // `new Date(...)` sarmalaması ARTIK GEREKLİ DEĞİL: varsayılan cache codec'i
    // (core/cache richCodec) Date'i Date olarak geri getiriyor. Savunma amaçlı
    // bırakıldı — Date'i de string'i de kabul eder, maliyeti yok.
    if (new Date(detail.startsAt).getTime() < Date.now()) {
      throw badRequest("activity.pastCannotRsvp");
    }

    const row = await activitiesRepository.upsertAttendeeWithCapacity(
      activityId,
      userId,
      data.status,
      detail.capacity
    );
    if (!row) {
      throw badRequest("activity.full");
    }
    return { status: row.status };
  },

  /** Katılımı geri alma (idempotent — yoksa da başarı döner). */
  async cancelRsvp(userId: string, activityId: string) {
    await activitiesRepository.removeAttendee(activityId, userId);
  },
};
