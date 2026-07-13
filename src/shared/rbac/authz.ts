import type { AuthzContext } from "../../core/rbac/rbac.types";

/**
 * Bu projenin authz bağlamına eklediği PROJE-ÖZEL alanlar. core/rbac'taki minimal
 * `AuthzContext` arayüzünü declaration merging ile genişletiriz (AuthClaims deseni)
 * — böylece `c.get("authz")` tüm projede (feature'lar + middleware'ler) bu alanları
 * da tipli görür, ama core kaynağı onları İSMEN bilmez.
 * (core/rbac/rbac.types.ts'deki nota bakınız.)
 */
declare module "../../core/rbac/rbac.types" {
  interface AuthzContext {
    /**
     * Hesap durumu — askıya alınan kullanıcının erişimini bir sonraki istekte
     * ANINDA kesmek için authz'a gömülür (politika: shared/rbac/authz-policy.ts).
     * Kullanıcı bulunamazsa undefined.
     */
    status?: "pending" | "active" | "suspended";
    /**
     * Kullanıcının rollerindeki EN YÜKSEK rütbe (roles.rank). Rolü yoksa 0.
     * "Kendinden düşük rütbe" kuralının girdisi (bkz. auth.service assertActorOutranks*).
     */
    maxRank: number;
  }
}

/** JS tarafında hiçbir şey export etmez; yalnızca tip birleştirme için import edilir. */
export type {};
