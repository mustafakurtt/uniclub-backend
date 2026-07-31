import { notificationMutesRepository } from "./notification-mutes.repository";
import {
  isOptOutableNotificationType,
  OPT_OUTABLE_NOTIFICATION_TYPES,
  NotificationTypeMeta,
  type NotificationTypeKey,
} from "./notifications.types";
import { clubsRepository } from "../clubs/clubs.repository";
import { badRequest, notFound } from "../../shared/utils/errors";

export type NotificationPreferenceMute = {
  type: string | null;
  clubId: string | null;
  createdAt: Date;
};

export type UpdateNotificationPreferenceDTO = {
  type?: string | null;
  clubId?: string | null;
  muted: boolean;
};

function normalizeMuteKey(type?: string | null, clubId?: string | null): {
  type: string | null;
  clubId: string | null;
} {
  const normalizedType = type === undefined || type === null ? null : type;
  const normalizedClubId = clubId === undefined || clubId === null ? null : clubId;
  return { type: normalizedType, clubId: normalizedClubId };
}

export const notificationPreferencesService = {
  async getPreferences(userId: string) {
    const rows = await notificationMutesRepository.listByUser(userId);
    const mutes: NotificationPreferenceMute[] = rows.map((row) => ({
      type: row.type,
      clubId: row.clubId,
      createdAt: row.createdAt,
    }));

    return {
      mutes,
      optOutableTypes: OPT_OUTABLE_NOTIFICATION_TYPES,
      typeCatalog: NotificationTypeMeta,
    };
  },

  async updatePreference(userId: string, dto: UpdateNotificationPreferenceDTO) {
    const { type, clubId } = normalizeMuteKey(dto.type, dto.clubId);

    if (type === null && clubId === null) {
      throw badRequest("user.notificationPreferenceInvalid");
    }

    if (type !== null && !isOptOutableNotificationType(type)) {
      throw badRequest("user.notificationPreferenceNotOptOutable");
    }

    if (clubId !== null) {
      const club = await clubsRepository.findById(clubId);
      if (!club) {
        throw notFound("club.notFound");
      }
    }

    if (dto.muted) {
      await notificationMutesRepository.addMute(userId, type, clubId);
    } else {
      await notificationMutesRepository.removeMute(userId, type, clubId);
    }

    return { type, clubId, muted: dto.muted };
  },
};
