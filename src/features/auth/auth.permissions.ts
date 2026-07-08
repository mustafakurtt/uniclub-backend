/**
 * auth feature'ının sahip olduğu RBAC izin anahtarları.
 *
 * Not: Bu obje KAPALI bir enum değildir — permissions tablosu runtime'da
 * role.manage/permission.manage endpoint'leri üzerinden genişletilebilir.
 * Bu sabitin tek amacı, bu feature'ın bugün bildiği anahtarları TEK bir yerde
 * tutup route/seed gibi çağrı noktalarında yazım hatasını (typo) önlemektir.
 */
export const AuthPermission = {
  ROLE_MANAGE: "role.manage",
  PERMISSION_MANAGE: "permission.manage",
} as const;

export type AuthPermission = (typeof AuthPermission)[keyof typeof AuthPermission];
