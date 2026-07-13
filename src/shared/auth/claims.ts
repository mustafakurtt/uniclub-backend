import type { AuthClaims } from "../../core/auth/auth.middleware";

/**
 * Bu projenin JWT claim şekli. core/auth'taki BOŞ `AuthClaims` arayüzünü
 * declaration merging ile doldururuz — böylece `c.get("user")` tüm projede
 * (feature'lar + core) doğru tiplenir, ama core kaynağı bu alanları İSMEN bilmez.
 * (core/auth/auth.middleware.ts'deki nota bakınız.)
 */
declare module "../../core/auth/auth.middleware" {
  interface AuthClaims {
    userId: string;
    /** NULL = platform hesabı (hiçbir üniversiteye bağlı değil). Bkz. schema.users. */
    universityId: string | null;
    exp: number;
  }
}

/** JWT üretimi/doğrulaması için somut payload tipi (jwt.util kullanır). */
export type JwtPayload = Required<AuthClaims>;
