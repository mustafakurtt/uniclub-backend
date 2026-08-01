export const PosterQrPermission = {
  /** Okul geneli afiş QR yönetimi (tenant staff). */
  UNIVERSITY_MANAGE: "poster_qr.university.manage",
} as const;

export type PosterQrPermission = (typeof PosterQrPermission)[keyof typeof PosterQrPermission];

export const POSTER_QR_PERMISSION_CATALOG: { key: PosterQrPermission; description: string }[] = [
  {
    key: PosterQrPermission.UNIVERSITY_MANAGE,
    description: "Okul geneli afiş QR oluşturma ve yönetimi",
  },
];
