import { InferSelectModel } from "drizzle-orm";
import { userModerationActions } from "../../db/schema";

/**
 * Moderasyon işlem tipleri. pgEnum DEĞİL, varchar + `as const` katalog
 * (notifications.type ile aynı konvansiyon) — yeni tip migration istemesin.
 */
export const ModerationAction = {
  BAN: "ban",
  UNBAN: "unban",
  PASSWORD_RESET: "password_reset",
} as const;

export type ModerationAction = (typeof ModerationAction)[keyof typeof ModerationAction];

export type UserModerationActionRow = InferSelectModel<typeof userModerationActions>;

/** Geçmiş listesinde işlemi yapan yöneticinin özet bilgisi (leftJoin ile). */
export interface ModerationActor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export type ModerationHistoryItem = UserModerationActionRow & { actor: ModerationActor | null };
