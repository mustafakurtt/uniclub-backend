import { AdminPermission } from "../admin/admin.permissions";

/**
 * moderation feature'ının kullandığı RBAC izin anahtarları. Kullanıcı yönetimi
 * yetkilerini YENİDEN ÜRETMEZ: mevcut `user.view`/`user.manage` anahtarlarını
 * kullanır (roller bunları zaten seed'de taşır — ek seed/migration gerekmez).
 *
 * MODERATE (ban/unban/şifre sıfırlama) yazma; VIEW (aktivite/geçmiş) salt-okunur.
 * İleride şifre sıfırlama gibi hassas işlemler için granüler bir anahtar
 * (örn. "user.password.reset") eklenip role bundle'larına dağıtılabilir.
 */
export const ModerationPermission = {
  MODERATE: AdminPermission.USER_MANAGE,
  VIEW: AdminPermission.USER_VIEW,
} as const;

export type ModerationPermission = (typeof ModerationPermission)[keyof typeof ModerationPermission];
