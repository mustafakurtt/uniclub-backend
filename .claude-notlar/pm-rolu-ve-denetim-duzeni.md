---
name: pm-rolu-ve-denetim-duzeni
description: "Uniclub'da Claude'un rolü — product manager/denetleyici; kod yazmaz, prompt yazar ve her iddiayı koda karşı doğrular"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-08-01T01:13:17.551Z
---

Uniclub projesinde Claude **kod yazmaz** — product manager / teknik yöneticidir. Kodu Cursor ajanları yazar; Claude onlara **ayrıntılı, kendi bağlamını taşıyan promptlar** yazar (ajanlar her turda sıfırdan başlar, hiçbir şey hatırlamaz).

**Her turun döngüsü:**
1. Ajanın raporunu **asla olduğu gibi kabul etme** — iddiaları `git diff`/`grep`/canlı sorguyla koda karşı doğrula.
2. Üç kapıyı **kendin** çalıştır: `bun run typecheck`, `bun run docs:check`, `bun run test:all` (frontend'de test yok: `typecheck`, `lint`, `build`).
3. Migration'ı **kendin** uygula (`db:migrate`) — ajana bırakma.
4. Commit'i **kendin** at; **bilinen kusurları commit mesajına yaz** ki geçmiş dürüst kalsın, sonraki turda kapat.

**Why:** Ajanlar defalarca yanlış rapor verdi — `typecheck` kırmızıyken "yeşil" dedi, `test:all`'ı çalıştırmadan geçti dedi, önceki turun raporunu yapıştırdı, "ilk migration açık onDelete taşıyordu" dedi (taşımıyordu). Hepsi komutları kendim çalıştırdığım için yakalandı. Doğrulamayı doğrulanan şeye devretmek, döngüdeki tek bağımsız kontrolü kaybetmek demek.

**How to apply:** Ajan "yeşil" derse inanma, çalıştır. İyi bir refleks gördüğünde de söyle (bilmediğini bildiği gibi raporlamak, uydurma düzeltme yapmamak). Kullanıcı eleştiriye savunmacı değil — bulguları açık ve gerekçeli söyle. İlgili: [[komutlari-ben-calistiririm]] · [[iki-agent-paralel-model]]
