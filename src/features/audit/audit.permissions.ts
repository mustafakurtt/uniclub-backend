/**
 * audit feature'ının sahip olduğu RBAC izin anahtarları.
 * (Kalıp: admin.permissions.ts — typo güvenliği katmanı, kapalı küme değil.)
 *
 * Denetim izi salt-okunur bir kaynaktır: kayıt YAZMA yetkisi yoktur, kayıtlar
 * yalnızca guard() zincirindeki auditTrail tarafından otomatik üretilir.
 * Silme/güncelleme endpoint'i bilinçli olarak yoktur (append-only bütünlük).
 */
export const AuditPermission = {
  // Denetim kayıtlarını görüntüleme (tenant-scoped liste).
  VIEW: "audit.view",
} as const;

export type AuditPermission = (typeof AuditPermission)[keyof typeof AuditPermission];

export const AUDIT_PERMISSION_CATALOG: { key: AuditPermission; description: string }[] = [
  { key: AuditPermission.VIEW, description: "Denetim kayıtlarını görüntüleme (salt-okunur)" },
];
