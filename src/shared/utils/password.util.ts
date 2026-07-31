/**
 * Şifre yardımcıları core'a taşındı (core/auth/password.ts — proje-bağımsız).
 * Bu dosya geriye dönük uyum için re-export eder; mevcut çağrı yerleri değişmez.
 */
export { hashPassword, verifyPassword, verifyPasswordOrDummy } from "../../core/auth/password";
