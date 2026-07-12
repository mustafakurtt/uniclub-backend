import { defineCatalog } from "../../core/i18n/translator";

/**
 * users (self-service) feature'ının kullanıcı-cephesi mesajları, feature
 * içinde — aynı `*.permissions.ts` konvansiyonu. Kompozisyon kökü
 * shared/i18n/messages.ts bunu mergeCatalogs ile birleştirir.
 */
export const usersMessages = defineCatalog({
  tr: {
    // hata
    "user.notFound": "Kullanıcı bulunamadı.",
    "user.currentPasswordWrong": "Mevcut şifre yanlış.",
    // başarı
    "user.profileFound": "Profil bulundu.",
    "user.profileUpdated": "Profil güncellendi.",
    "user.passwordUpdated": "Şifre güncellendi.",
    "user.permissionsListed": "Etkin yetkiler listelendi.",
    "user.clubMembershipsListed": "Kulüp üyelikleri listelendi.",
    "user.applicationsListed": "Başvurularım listelendi.",
    "user.advisedClubsListed": "Danışmanı olduğunuz kulüpler listelendi.",
  },
  en: {
    // error
    "user.notFound": "User not found.",
    "user.currentPasswordWrong": "Current password is incorrect.",
    // success
    "user.profileFound": "Profile found.",
    "user.profileUpdated": "Profile updated.",
    "user.passwordUpdated": "Password updated.",
    "user.permissionsListed": "Effective permissions listed.",
    "user.clubMembershipsListed": "Club memberships listed.",
    "user.applicationsListed": "Applications listed.",
    "user.advisedClubsListed": "Advised clubs listed.",
  },
});

export type UsersMessageKey = keyof (typeof usersMessages)["tr"];
