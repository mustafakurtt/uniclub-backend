/**
 * clubs feature'ının GLOBAL (RBAC) izin anahtarları — yani okul yöneticisi
 * (admin) / sistem yöneticisi (super_admin) tarafından kullanılan, kulüpleri
 * TENANT genelinde yöneten yetkiler.
 *
 * ÖNEMLİ AYRIM — iki farklı yetki katmanı vardır (bkz. CLAUDE.md):
 *   1) Bu dosya = GLOBAL claim-based katman. Bir kulübü onaylama, silme,
 *      danışman atama gibi TENANT çapındaki yönetim işleri. `guard()` +
 *      `requirePermission()` ile korunur.
 *   2) Kulüp-içi rol katmanı (clubMembers.role: member/officer/president ve
 *      danışmanlık) = club.middleware ile korunur, permission KULLANMAZ.
 *      O katman kasıtlı olarak bu enum'un dışındadır.
 *
 * Not: Bu obje KAPALI bir enum değildir — permissions tablosu runtime'da
 * role.manage/permission.manage endpoint'leri üzerinden genişletilebilir.
 * Amaç, feature'ın bugün bildiği anahtarları TEK yerde tutup route/seed
 * çağrı noktalarında yazım hatasını (typo) önlemektir.
 *
 * TASARIM: Eski tek "club.manage" anahtarı, üniversite feature'ındaki gibi
 * kaynak+aksiyon bazlı anahtarlara bölündü. Böylece bir okul yöneticisine
 * "kulüp düzenleme" yetkisi verilip, "kulüp silme" (yıkıcı) yetkisi
 * verilmeyebilir; ya da yalnızca danışman atama yetkisi tanımlanabilir.
 */
export const ClubPermission = {
  // Kulüpleri yönetici gözüyle görüntüleme (salt-okunur): tüm durumlar
  // (pending/archived dahil) + danışman listesi. Yazma yetkisi gerektirmez.
  VIEW: "club.view",
  // Kulüp kurma başvurularını görüntüleme (salt-okunur — karar ayrı).
  APPLICATION_VIEW: "application.view",
  // Başvuru değerlendirme (approve / reject) — onaylanınca gerçek kulüp oluşur.
  APPROVE: "club.approve",
  // Kulüp durum (approve/reject/archive) + profil (ad/açıklama/logo/kapak/joinPolicy).
  UPDATE: "club.update",
  // Danışman ata / kaldır.
  ADVISOR_MANAGE: "club.advisor.manage",
  // Herhangi bir kulüpte üye çıkarma / rol düzeltme (tenant moderasyon override'ı).
  MEMBER_MANAGE: "club.member.manage",
  // Kulübü kalıcı olarak silme (yıkıcı — önce archived/rejected olmalı).
  DELETE: "club.delete",
} as const;

export type ClubPermission = (typeof ClubPermission)[keyof typeof ClubPermission];

/**
 * Seed ve "tüm club yetkileri" gerektiren yerler için anahtarların düz listesi +
 * insan-okur açıklamaları. permissions tablosuna satır eklerken bu katalog
 * kullanılır ki seed ile route guard'ları asla birbirinden kaymasın.
 */
export const CLUB_PERMISSION_CATALOG: { key: ClubPermission; description: string }[] = [
  { key: ClubPermission.VIEW, description: "Kulüpleri görüntüleme (salt-okunur, tüm durumlar)" },
  { key: ClubPermission.APPLICATION_VIEW, description: "Kulüp başvurularını görüntüleme (salt-okunur)" },
  { key: ClubPermission.APPROVE, description: "Kulüp başvurularını onaylama/reddetme" },
  { key: ClubPermission.UPDATE, description: "Kulüpleri yönetme (durum + profil güncelleme)" },
  { key: ClubPermission.ADVISOR_MANAGE, description: "Kulüplere danışman atama/kaldırma" },
  { key: ClubPermission.MEMBER_MANAGE, description: "Kulüp üyelerini yönetme (çıkarma/rol düzeltme)" },
  { key: ClubPermission.DELETE, description: "Kulüp silme" },
];
