import { defineCatalog } from "../../core/i18n/translator";

/**
 * activities feature'ının kullanıcı-cephesi mesajları (hata + başarı), feature
 * içinde — aynı `*.permissions.ts`/`university.messages.ts` konvansiyonu.
 * Kompozisyon kökü shared/i18n/messages.ts bunu mergeCatalogs ile birleştirir.
 *
 * Anahtarlar `activity.durum`/`attendee.durum` biçiminde. `{param}` yerleri
 * HttpError.params ile doldurulur.
 */
export const activitiesMessages = defineCatalog({
  tr: {
    // activity — hata
    "activity.notFound": "Etkinlik bulunamadı.",
    "activity.notPublished": "Bu etkinlik henüz yayınlanmadı.",
    "activity.cancelled": "Bu etkinlik iptal edildi.",
    "activity.alreadyCancelled": "Etkinlik zaten iptal edilmiş.",
    "activity.startInPast": "Etkinlik başlangıcı geçmiş bir tarih olamaz.",
    "activity.endBeforeStart": "Etkinlik bitişi başlangıçtan önce olamaz.",
    "activity.full": "Etkinlik kontenjanı dolu.",
    "activity.notAHostClub": "Bu kulüp etkinliğin sahibi (host) değil.",
    "activity.membersOnly": "Bu etkinlik yalnızca kulüp üyelerine açıktır.",
    "activity.pastCannotRsvp": "Geçmiş bir etkinliğe katılım bildirilemez.",
    "activity.notDraft": "Yalnızca taslak bir etkinlik yayınlanabilir.",
    "activity.coHostSelf": "Bir kulüp kendi etkinliğine co-host olamaz.",
    "activity.coHostExists": "Bu kulüp zaten bu etkinliğe bağlı.",
    "activity.coHostInviteNotFound": "Bu kulüp için bekleyen bir co-host daveti yok.",
    // activity — başarı
    "activity.listed": "Etkinlikler listelendi.",
    "activity.found": "Etkinlik bulundu.",
    "activity.created": "Etkinlik oluşturuldu.",
    "activity.updated": "Etkinlik güncellendi.",
    "activity.cancelledOk": "Etkinlik iptal edildi.",
    "activity.publishedOk": "Etkinlik yayınlandı.",
    "activity.coHostInvitedOk": "Co-host daveti gönderildi.",
    "activity.coHostAccepted": "Co-host daveti kabul edildi.",
    "activity.coHostRemoved": "Co-host bağlantısı kaldırıldı.",
    "activity.coHostsListed": "Co-host kulüpler listelendi.",
    // attendee (RSVP + yoklama) — başarı
    "attendee.listed": "Katılımcılar listelendi.",
    "attendee.rsvpSaved": "Katılım durumunuz kaydedildi.",
    "attendee.rsvpRemoved": "Katılımınız geri alındı.",
    "attendee.myListed": "Etkinliklerim listelendi.",
    "attendee.notAttendee": "Bu kullanıcı etkinliğe katılım bildirmemiş.",
    "attendee.checkedIn": "Katılım (yoklama) işaretlendi.",
    "attendee.checkInUndone": "Yoklama işareti kaldırıldı.",
  },
  en: {
    // activity — error
    "activity.notFound": "Activity not found.",
    "activity.notPublished": "This activity has not been published yet.",
    "activity.cancelled": "This activity has been cancelled.",
    "activity.alreadyCancelled": "The activity is already cancelled.",
    "activity.startInPast": "The activity start cannot be in the past.",
    "activity.endBeforeStart": "The activity end cannot be before its start.",
    "activity.full": "The activity is at full capacity.",
    "activity.notAHostClub": "This club is not the host of the activity.",
    "activity.membersOnly": "This activity is open to club members only.",
    "activity.pastCannotRsvp": "You cannot RSVP to a past activity.",
    "activity.notDraft": "Only a draft activity can be published.",
    "activity.coHostSelf": "A club cannot co-host its own activity.",
    "activity.coHostExists": "This club is already linked to the activity.",
    "activity.coHostInviteNotFound": "There is no pending co-host invitation for this club.",
    // activity — success
    "activity.listed": "Activities listed.",
    "activity.found": "Activity found.",
    "activity.created": "Activity created.",
    "activity.updated": "Activity updated.",
    "activity.cancelledOk": "Activity cancelled.",
    "activity.publishedOk": "Activity published.",
    "activity.coHostInvitedOk": "Co-host invitation sent.",
    "activity.coHostAccepted": "Co-host invitation accepted.",
    "activity.coHostRemoved": "Co-host link removed.",
    "activity.coHostsListed": "Co-host clubs listed.",
    // attendee (RSVP + check-in) — success
    "attendee.listed": "Attendees listed.",
    "attendee.rsvpSaved": "Your RSVP has been saved.",
    "attendee.rsvpRemoved": "Your RSVP has been removed.",
    "attendee.myListed": "Your activities listed.",
    "attendee.notAttendee": "This user has not RSVP'd to the activity.",
    "attendee.checkedIn": "Attendance (check-in) marked.",
    "attendee.checkInUndone": "Check-in mark removed.",
  },
});

/** Bu feature'ın geçerli mesaj anahtarları — typo'ları derleme anında yakalar. */
export type ActivitiesMessageKey = keyof (typeof activitiesMessages)["tr"];
