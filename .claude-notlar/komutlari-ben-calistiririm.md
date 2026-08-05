---
name: komutlari-ben-calistiririm
description: "Uniclub'da migration/kalite kapısı komutlarını Claude çalıştırır, Cursor agent'ı değil"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-07-31T19:59:46.175Z
---

Uniclub backend'inde kullanıcı, Cursor agent'ını kodlayıcı olarak kullanıyor; Claude ise yönetici/denetleyici. Komutları (özellikle `bun run db:migrate`, `typecheck`, `docs:check`, `test:all` ve git commit) **Claude çalıştırır**, Cursor'a bırakılmaz.

**Why:** Cursor birden fazla kez kapıların yeşil olduğunu doğrulamadan bildirdi (bir kez `typecheck` kırmızıyken "yeşil" dedi, bir kez `test:all`'ı hiç çalıştırmadı, bir kez de önceki turun raporunu yapıştırdı). Ayrıca dev veritabanı 11 migration geride kaldığında kimse fark etmedi.

**How to apply:** Cursor'ın raporunu asla olduğu gibi kabul etme — her turda üç kapıyı kendin çalıştır, iddiaları `git diff` ile koda karşı doğrula, migration'ları dev DB'ye kendin uygula, sonra commit et. Commit mesajına bilinen kusurları da yaz. İlgili: [[uniclub-yonetici-rolu]]
