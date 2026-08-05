---
name: iki-agent-paralel-model
description: "TEK BE + TEK FE ajan; üçe çıkarmak denendi ve geri alındı — darboğaz ajan sayısı değil doğrulama"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-08-02T14:00:42.792Z
---

Proje **iki depodur ve yan yana dururlar**:
- `.../UniversityClub/uniclub-backend` (Bun + Hono + Drizzle + PostgreSQL)
- `.../UniversityClub/uniclub-frontend` (React 19 + Vite + TS + Tailwind + TanStack Query)

İki Cursor ajanı **paralel** çalışır (BE + FE). Claude ikisini de yönetir, raporları **sırayla** doğrular ve her deposuna ayrı commit atar.

**Temel kural: sözleşmeyi serileştir, uygulamayı paralelleştir.** FE, `develop`'ta henüz var olmayan bir uca karşı kod yazmaz. Dalga planlanırken kesişmeyen işler seçilir (ör. BE tenant profili yazarken FE mevcut sözleşmeyle etkinlik ekranı yazar).

**Sözleşme senkronu:** Backend `docs/integration/*` **tek kaynaktır**; frontend `docs/architecture/FRONTEND_*.md` altında **senkron kopya** tutar. Her kopyanın başında kaynak yolu + backend commit SHA'sı vardır. Ajan üç kez frontend dosyasını yanlışlıkla backend deposuna kopyaladı — promptta yön açıkça belirtilmeli.

**Why:** Ajanlar mid-flight'ken depoyu doğrulamak yanlış sonuç verir (yarım iş hata sanılır) ve dal değiştirmek çalışmalarını bozar. Bitiş sinyali **rapordur**.

**How to apply:** Rapor gelmeden ağaca dokunma, git işlemi yapma, dal değiştirme. Bir dalda iş bittikten sonra dalı bırakma — bir kez `feat/audit-log-error-contract`'ta bırakıldı ve FE ajanı yeni işi yanlış dala yazdı (cherry-pick ile taşındı).

## Üçe çıkarma DENENDİ ve GERİ ALINDI (2026-08-02)

Kullanıcı hızlanmak için ek FE ajanı istedi. Üç `git worktree` kuruldu
(`uniclub-fe-b`, `uniclub-fe-c`), dosya sahipliği tablosuyla ayrıldı.

**Teknik olarak çalıştı** — birleştirmede tek çakışma çıkmadı.
**Ama hız kazandırmadı.** Kullanıcı: *"neyse tek devam edelim çok karıştı"*.

Sebep: **darboğaz ajan sayısı değil, DOĞRULAMA.** Kapıları ben koşuyorum,
iddiaları koda karşı ben ölçüyorum, PR/CI'ı ben bekliyorum — dalga başına
~5 dk. Üç ajan aynı anda bitince sıraya giriyorlar, üstüne üç klasörün
zihinsel yükü biniyor. Bir ajan da fazla geniş prompt yüzünden yarıda kesildi.

**Kural: ajan sayısını artırmadan önce doğrulama maliyetini düşür.**

Yine de saklanacak iki teknik, ileride gerekirse:
- Ayrı `git worktree` (aynı klasörde iki ajan birbirinin ağacını ezer);
  her worktree'de ayrı `bun install`.
- **Dosya sahipliği tablosu**; ortak dosyalarda (App.tsx, barrel, rbac.ts)
  yalnızca *satır ekleme*. Entegrasyon satırını (menü girdisi) ajana bırakma.

## Dal seremonisi azaltıldı (2026-08-02)

*"dal oluşturma işini bırakıp develop üstünden gidelim, bu bize vakit ve
token kaybettiriyor"* — haklı.
- **Backend:** `develop`'a doğrudan commit, dal yok.
- **Frontend:** `main` korumalı, PR şart — ama dalga başına değil
  **OTURUM BAŞINA tek PR**; birden fazla iş tek dalda birikir.

İlgili: [[pm-rolu-ve-denetim-duzeni]] · [[depo-dal-kurallari]] ·
[[dogrulama-refleksleri]]
