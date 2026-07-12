import { defineCatalog } from "../../core/i18n/translator";

/**
 * clubs feature'ının kullanıcı-cephesi mesajları (browse/applications/
 * membership/management + club.middleware'in kulüp-içi yetki reddi), feature
 * içinde — aynı `*.permissions.ts` konvansiyonu. Kompozisyon kökü
 * shared/i18n/messages.ts bunu mergeCatalogs ile birleştirir.
 */
export const clubsMessages = defineCatalog({
  tr: {
    // hata
    "club.notFound": "Kulüp bulunamadı.",
    "club.pendingApplicationExists": "Zaten bekleyen bir kulüp başvurunuz var.",
    "club.applicationNotFound": "Başvuru bulunamadı.",
    "club.applicationNotWithdrawable": "Yalnızca bekleyen bir başvuru geri çekilebilir.",
    "club.notOpenForMembership": "Bu kulüp şu anda üyeliğe kapalı.",
    "club.alreadyMemberOrPending": "Bu kulübe zaten üyesiniz veya üyelik isteğiniz beklemede.",
    "club.notAMember": "Bu kulübün üyesi değilsiniz.",
    "club.presidentCannotLeave": "Başkan, başkanlığı devretmeden kulüpten ayrılamaz.",
    "club.pendingJoinRequestNotFound": "Bekleyen bir üyelik isteği bulunamadı.",
    "club.memberNotFound": "Üye bulunamadı.",
    "club.presidentCannotBeRemoved": "Başkan bu şekilde kulüpten çıkarılamaz.",
    "club.presidentRoleCannotChange": "Başkanın rolü bu şekilde değiştirilemez.",
    "club.cannotTransferToSelf": "Başkanlığı kendinize devredemezsiniz.",
    "club.newPresidentMustBeApprovedMember": "Yeni başkan, kulübün onaylı bir üyesi olmalıdır.",
    "club.contactLinkPlatformExists": "Bu platform için zaten bir bağlantı eklenmiş.",
    "club.contactLinkNotFound": "Bağlantı bulunamadı.",
    // hata — club.middleware (kulüp-içi yetki reddi, 403)
    "club.notStaff": "Bu işlem için kulüp yöneticisi (başkan/officer) veya danışmanı olmalısınız.",
    "club.notOfficer": "Bu işlem için kulüp yöneticisi (başkan/officer) olmalısınız.",
    "club.notPresident": "Bu işlem için kulüp başkanı olmalısınız.",
    // başarı
    "club.applicationSubmitted": "Kulüp başvurunuz alındı.",
    "club.applicationFound": "Başvuru bulundu.",
    "club.applicationWithdrawn": "Başvurunuz geri çekildi.",
    "club.listed": "Kulüpler listelendi.",
    "club.found": "Kulüp bulundu.",
    "club.membersListed": "Üyeler listelendi.",
    "club.joinProcessed": "Kulübe katılma isteğiniz işlendi.",
    "club.left": "Kulüpten ayrıldınız.",
    "club.infoUpdated": "Kulüp bilgileri güncellendi.",
    "club.contactLinkAdded": "İletişim linki eklendi.",
    "club.contactLinkUpdated": "İletişim linki güncellendi.",
    "club.contactLinkRemoved": "İletişim linki kaldırıldı.",
    "club.joinRequestsListed": "Bekleyen istekler listelendi.",
    "club.joinRequestDecided": "Üyelik isteği güncellendi.",
    "club.memberRemoved": "Üye kulüpten çıkarıldı.",
    "club.memberRoleUpdated": "Üye rolü güncellendi.",
    "club.presidencyTransferred": "Başkanlık devredildi.",
  },
  en: {
    // error
    "club.notFound": "Club not found.",
    "club.pendingApplicationExists": "You already have a pending club application.",
    "club.applicationNotFound": "Application not found.",
    "club.applicationNotWithdrawable": "Only a pending application can be withdrawn.",
    "club.notOpenForMembership": "This club is not currently open for membership.",
    "club.alreadyMemberOrPending": "You are already a member of this club or your join request is pending.",
    "club.notAMember": "You are not a member of this club.",
    "club.presidentCannotLeave": "The president cannot leave the club without transferring the presidency first.",
    "club.pendingJoinRequestNotFound": "No pending join request found.",
    "club.memberNotFound": "Member not found.",
    "club.presidentCannotBeRemoved": "The president cannot be removed this way.",
    "club.presidentRoleCannotChange": "The president's role cannot be changed this way.",
    "club.cannotTransferToSelf": "You cannot transfer the presidency to yourself.",
    "club.newPresidentMustBeApprovedMember": "The new president must be an approved member of the club.",
    "club.contactLinkPlatformExists": "A link for this platform has already been added.",
    "club.contactLinkNotFound": "Link not found.",
    // error — club.middleware (in-club authorization denial, 403)
    "club.notStaff": "You must be a club officer/president or advisor for this action.",
    "club.notOfficer": "You must be a club officer/president for this action.",
    "club.notPresident": "You must be the club president for this action.",
    // success
    "club.applicationSubmitted": "Your club application has been received.",
    "club.applicationFound": "Application found.",
    "club.applicationWithdrawn": "Your application has been withdrawn.",
    "club.listed": "Clubs listed.",
    "club.found": "Club found.",
    "club.membersListed": "Members listed.",
    "club.joinProcessed": "Your club join request has been processed.",
    "club.left": "You have left the club.",
    "club.infoUpdated": "Club information updated.",
    "club.contactLinkAdded": "Contact link added.",
    "club.contactLinkUpdated": "Contact link updated.",
    "club.contactLinkRemoved": "Contact link removed.",
    "club.joinRequestsListed": "Pending requests listed.",
    "club.joinRequestDecided": "Join request updated.",
    "club.memberRemoved": "Member removed from club.",
    "club.memberRoleUpdated": "Member role updated.",
    "club.presidencyTransferred": "Presidency transferred.",
  },
});

export type ClubsMessageKey = keyof (typeof clubsMessages)["tr"];
