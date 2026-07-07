export interface EffectivePermissions {
  roles: string[];
  permissions: string[];
  /**
   * Kullanıcının hesap durumu — askıya alınan bir kullanıcının erişimini
   * ANINDA kesmek için authz cache'ine gömülür (bkz. docs/yonetim/05 #7).
   * Kullanıcı bulunamazsa undefined kalır.
   */
  status?: "pending" | "active" | "suspended";
  /**
   * Kullanıcının rollerindeki EN YÜKSEK rütbe (roles.rank). Rolü yoksa 0.
   * Rol/kullanıcı yönetiminde "kendinden düşük rütbe" kuralının girdisidir
   * (bkz. auth.service.ts assertActorOutranks*). Cache'e gömülür.
   */
  maxRank: number;
}
