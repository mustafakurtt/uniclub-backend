import { defineCatalog } from "../../core/i18n/translator";

export const posterQrMessages = defineCatalog({
  tr: {
    "posterQr.notFound": "QR kodu bulunamadı.",
    "posterQr.createFailed": "QR kodu oluşturulamadı.",
    "posterQr.clubTargetRequired": "Kulüp hedefi için targetClubId gerekli.",
    "posterQr.activityTargetRequired": "Etkinlik hedefi için targetActivityId gerekli.",
    "posterQr.clubTargetMismatch": "Bu QR kodu bu kulüp kapsamında yönetilemez.",
    "posterQr.listed": "QR kodları listelendi.",
    "posterQr.created": "QR kodu oluşturuldu.",
    "posterQr.updated": "QR kodu güncellendi.",
    "posterQr.cancelled": "QR kodu iptal edildi.",
    "posterQr.resolved": "QR kodu çözümlendi.",
    "posterQr.expired": "Bu QR kampanyası sona erdi.",
    "posterQr.cancelledStatus": "Bu QR kodu iptal edildi.",
    "posterQr.notYetActive": "Bu QR kampanyası henüz başlamadı.",
  },
  en: {
    "posterQr.notFound": "QR code not found.",
    "posterQr.createFailed": "Could not create QR code.",
    "posterQr.clubTargetRequired": "targetClubId is required for a club target.",
    "posterQr.activityTargetRequired": "targetActivityId is required for an activity target.",
    "posterQr.clubTargetMismatch": "This QR code cannot be managed under this club.",
    "posterQr.listed": "QR codes listed.",
    "posterQr.created": "QR code created.",
    "posterQr.updated": "QR code updated.",
    "posterQr.cancelled": "QR code cancelled.",
    "posterQr.resolved": "QR code resolved.",
    "posterQr.expired": "This QR campaign has ended.",
    "posterQr.cancelledStatus": "This QR code has been cancelled.",
    "posterQr.notYetActive": "This QR campaign has not started yet.",
  },
});

export type PosterQrMessageKey = keyof (typeof posterQrMessages)["tr"];
