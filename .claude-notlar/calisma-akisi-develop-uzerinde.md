---
name: calisma-akisi-develop-uzerinde
description: "Uniclub'da her tur PR açılmaz — develop üzerinde çalışılır, PR ve etiket Claude'da"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-08-01T11:55:38.251Z
---

Kullanıcı **her tur PR açılmasını istemiyor** (2026-08-01) — vakit kaybı buluyor. Yeni akış:

- Doğrulanan iş doğrudan **`develop`'a commit edilip push edilir**.
- PR yalnızca **birkaç özellik biriktiğinde** açılır.
- **Etiketleme ve GitHub release Claude'da** — `gh release create` ile. Kullanıcıyı uğraştırma.
- Dal temizliği, merge sonrası senkron, birleşmiş dalların silinmesi de Claude'da.

**Why:** Kullanıcı tek başına çalışıyor; her tur için PR açıp merge etmek onun tarafında sürtünme yaratıyordu. Doğrulamayı Claude zaten yapıyor (üç kapı + iddiaların koda karşı kontrolü), yani PR bir kalite kapısı işlevi görmüyordu.

**How to apply:** Turu doğrula → `develop`'a commit + push → biriktiğinde `develop → main` PR'ı aç ve merge sonrası etiketi kendin at. Sürüm notunu `gh release create` ile yaz; deploy ajanı en son release'i görüp kendini çeker. İlgili: [[pm-rolu-ve-denetim-duzeni]] · [[iki-agent-paralel-model]]
