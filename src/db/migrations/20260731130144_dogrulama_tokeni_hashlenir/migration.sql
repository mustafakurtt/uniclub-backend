-- Doğrulama token'ı artık düz değil, SHA-256 özeti olarak saklanır
-- (bkz. core/auth/token.ts, docs/planning/schema-product.md §0.8).
--
-- Bir önceki migration düz `token` kolonunu düşürdü; kalan satırların özeti
-- geriye dönük ÜRETİLEMEZ (hash tek yönlüdür) ve token'ları zaten kayıp
-- olduğu için kullanılamaz durumdalar. Bu yüzden temizleniyorlar: dolaşımdaki
-- doğrulama linkleri geçersiz olur, kullanıcılar `POST /api/auth/resend-verification`
-- ile yenisini alır. (Linklerin ömrü zaten 24 saat.)
DELETE FROM "email_verifications";--> statement-breakpoint
ALTER TABLE "email_verifications" ADD COLUMN "token_hash" varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_token_hash_key" UNIQUE("token_hash");