import { activitiesRepository } from "./activities.repository";
import { notFound, badRequest, forbidden } from "../../shared/utils/errors";
import { checkInQrCache } from "./check-in-qr.cache";
import {
  assertCanRsvp,
  assertCheckInWindow,
  requireHostedActivity,
} from "./activities-guards.util";

/** Yoklama (check-in) — staff işaretleme ve öğrenci QR self-check-in. */
export const activitiesCheckinService = {
  /**
   * Yoklama (check-in): host staff, katılım bildiren bir kullanıcıyı "geldi"
   * olarak işaretler (`checkedIn=false` → işareti geri alır). RSVP'si yoksa 404.
   */
  async setCheckIn(hostClubId: string, activityId: string, userId: string, checkedIn: boolean) {
    await requireHostedActivity(hostClubId, activityId);
    const attendee = await activitiesRepository.findAttendee(activityId, userId);
    if (!attendee) {
      throw notFound("attendee.notAttendee");
    }
    return await activitiesRepository.setCheckIn(activityId, userId, checkedIn ? new Date() : null);
  },

  /** Staff ekranında gösterilen dönen yoklama QR token'ı. */
  async getCheckInQr(hostClubId: string, activityId: string) {
    const activity = await requireHostedActivity(hostClubId, activityId);
    assertCheckInWindow(activity.startsAt, activity.endsAt);
    return await checkInQrCache.getOrRotate(activityId);
  },

  /**
   * Öğrenci kendi yoklamasını QR ile işaretler — RSVP + görünürlük kapısı,
   * kısa ömürlü token doğrulaması; zaten işaretliyse no-op.
   */
  async selfCheckIn(userId: string, universityId: string, activityId: string, token: string) {
    const detail = await assertCanRsvp(userId, universityId, activityId);
    assertCheckInWindow(detail.startsAt, detail.endsAt);

    const attendee = await activitiesRepository.findAttendee(activityId, userId);
    if (!attendee) {
      throw forbidden("attendee.notAttendee");
    }

    const valid = await checkInQrCache.validate(activityId, token);
    if (!valid) {
      throw badRequest("activity.checkInTokenInvalid");
    }

    if (attendee.checkedInAt) {
      return attendee;
    }

    return await activitiesRepository.setCheckIn(activityId, userId, new Date());
  },
};
