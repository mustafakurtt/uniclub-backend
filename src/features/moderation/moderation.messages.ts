import { defineCatalog } from "../../core/i18n/translator";

/**
 * moderation feature'ının kullanıcı-cephesi mesajları (hata + başarı), feature
 * içinde — aynı `*.permissions.ts` konvansiyonu. Kompozisyon kökü
 * shared/i18n/messages.ts bunu mergeCatalogs ile birleştirir.
 */
export const moderationMessages = defineCatalog({
  tr: {
    // hata
    "moderation.userNotFound": "Kullanıcı bulunamadı.",
    "moderation.cannotModerateSelf": "Kendi hesabınız üzerinde bu işlemi yapamazsınız.",
    "moderation.alreadyBanned": "Kullanıcı zaten askıya alınmış.",
    "moderation.notBanned": "Kullanıcı askıda değil.",
    // başarı
    "moderation.banned": "Kullanıcı askıya alındı.",
    "moderation.unbanned": "Kullanıcının askısı kaldırıldı.",
    "moderation.passwordReset": "Kullanıcının şifresi sıfırlandı.",
    "moderation.activityListed": "Kullanıcı aktivitesi listelendi.",
    "moderation.historyListed": "Moderasyon geçmişi listelendi.",
  },
  en: {
    // error
    "moderation.userNotFound": "User not found.",
    "moderation.cannotModerateSelf": "You cannot perform this action on your own account.",
    "moderation.alreadyBanned": "User is already suspended.",
    "moderation.notBanned": "User is not suspended.",
    // success
    "moderation.banned": "User has been suspended.",
    "moderation.unbanned": "User's suspension has been lifted.",
    "moderation.passwordReset": "User's password has been reset.",
    "moderation.activityListed": "User activity listed.",
    "moderation.historyListed": "Moderation history listed.",
  },
});

export type ModerationMessageKey = keyof (typeof moderationMessages)["tr"];
