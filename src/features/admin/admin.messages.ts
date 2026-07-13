import { defineCatalog } from "../../core/i18n/translator";

/**
 * admin (tenant yönetim paneli) feature'ının kullanıcı-cephesi mesajları,
 * feature içinde — aynı `*.permissions.ts` konvansiyonu. Kompozisyon kökü
 * shared/i18n/messages.ts bunu mergeCatalogs ile birleştirir.
 *
 * Not: admin, clubs/announcements/gallery kaynaklarına üstten müdahale eder
 * ama kendi anahtar önekini ("admin.*") kullanır — o feature'ların kendi
 * kataloglarıyla (örn. "club.notFound") ÇAKIŞMAZ; mergeCatalogs bunu
 * yükleme anında zaten zorunlu kılar.
 */
export const adminMessages = defineCatalog({
  tr: {
    // hata
    "admin.userNotFound": "Kullanıcı bulunamadı.",
    "admin.departmentNotInUniversity": "Bölüm bu üniversiteye ait değil.",
    "admin.clubNotFound": "Kulüp bulunamadı.",
    "admin.applicationNotFound": "Başvuru bulunamadı.",
    "admin.applicationAlreadyDecided": "Bu başvuru zaten değerlendirilmiş.",
    "admin.slugGenerationFailed": "Kulüp için uygun bir slug bulunamadı, lütfen tekrar deneyin.",
    "admin.clubNotArchivedOrRejected":
      "Yalnızca arşivlenmiş veya reddedilmiş kulüpler silinebilir. Önce kulübü arşivleyin.",
    "admin.advisorNotEligible": "Danışman olarak yalnızca 'advisor' rolündeki personel atanabilir.",
    "admin.advisorAlreadyAssigned": "Bu kullanıcı zaten kulübün danışmanı.",
    "admin.advisorNotAssigned": "Bu kullanıcı kulübün danışmanı değil.",
    "admin.memberNotFound": "Bu kullanıcı kulübün üyesi değil.",
    "admin.announcementNotFound": "Duyuru bulunamadı.",
    "admin.galleryImageNotFound": "Görsel bulunamadı.",
    // başarı
    "admin.accessibleUniversitiesListed": "Erişilebilir üniversiteler listelendi.",
    "admin.usersListed": "Kullanıcılar listelendi.",
    "admin.userFound": "Kullanıcı bulundu.",
    "admin.userEffectivePermissionsListed": "Etkin yetkiler listelendi.",
    "admin.userDepartmentUpdated": "Kullanıcının bölümü güncellendi.",
    "admin.applicationsListed": "Başvurular listelendi.",
    "admin.applicationApproved": "Başvuru onaylandı ve kulüp oluşturuldu.",
    "admin.applicationRejected": "Başvuru reddedildi.",
    "admin.clubsListed": "Kulüpler listelendi.",
    "admin.clubStatusUpdated": "Kulüp durumu güncellendi.",
    "admin.clubUpdated": "Kulüp bilgileri güncellendi.",
    "admin.clubDeleted": "Kulüp silindi.",
    "admin.advisorsListed": "Danışmanlar listelendi.",
    "admin.advisorAssigned": "Danışman atandı.",
    "admin.advisorRemoved": "Danışman kaldırıldı.",
    "admin.membersListed": "Üyeler listelendi.",
    "admin.memberRemoved": "Üye kulüpten çıkarıldı.",
    "admin.announcementRemoved": "Duyuru kaldırıldı.",
    "admin.galleryImageRemoved": "Görsel kaldırıldı.",
  },
  en: {
    // error
    "admin.userNotFound": "User not found.",
    "admin.departmentNotInUniversity": "This department does not belong to this university.",
    "admin.clubNotFound": "Club not found.",
    "admin.applicationNotFound": "Application not found.",
    "admin.applicationAlreadyDecided": "This application has already been decided.",
    "admin.slugGenerationFailed": "Could not find a suitable slug for the club, please try again.",
    "admin.clubNotArchivedOrRejected":
      "Only archived or rejected clubs can be deleted. Archive the club first.",
    "admin.advisorNotEligible": "Only staff with the 'advisor' role can be assigned as advisors.",
    "admin.advisorAlreadyAssigned": "This user is already an advisor of this club.",
    "admin.advisorNotAssigned": "This user is not an advisor of this club.",
    "admin.memberNotFound": "This user is not a member of this club.",
    "admin.announcementNotFound": "Announcement not found.",
    "admin.galleryImageNotFound": "Image not found.",
    // success
    "admin.accessibleUniversitiesListed": "Accessible universities listed.",
    "admin.usersListed": "Users listed.",
    "admin.userFound": "User found.",
    "admin.userEffectivePermissionsListed": "Effective permissions listed.",
    "admin.userDepartmentUpdated": "User's department updated.",
    "admin.applicationsListed": "Applications listed.",
    "admin.applicationApproved": "Application approved and club created.",
    "admin.applicationRejected": "Application rejected.",
    "admin.clubsListed": "Clubs listed.",
    "admin.clubStatusUpdated": "Club status updated.",
    "admin.clubUpdated": "Club information updated.",
    "admin.clubDeleted": "Club deleted.",
    "admin.advisorsListed": "Advisors listed.",
    "admin.advisorAssigned": "Advisor assigned.",
    "admin.advisorRemoved": "Advisor removed.",
    "admin.membersListed": "Members listed.",
    "admin.memberRemoved": "Member removed from club.",
    "admin.announcementRemoved": "Announcement removed.",
    "admin.galleryImageRemoved": "Image removed.",
  },
});

export type AdminMessageKey = keyof (typeof adminMessages)["tr"];
