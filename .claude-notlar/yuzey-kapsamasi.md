---
name: yuzey-kapsamasi
description: "Backend biter yüzey kalır deseni ÖLÇÜLDÜ ve mandallandı; gerçek borç 19, docs:check büyümesine izin vermiyor"
metadata:
  node_type: memory
  type: project
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-08-02T14:34:15.473Z
---

**Bu projede en sık tekrarlayan hata: backend biter, yüzey eksik kalır.**
2026-08-02'ye kadar **yedi kez** oldu. Her seferinde özellik "bitti" sayıldı
ama kullanılamaz durumdaydı.

## ÇÖZÜLDÜ — ölçüldü, kapatıldı, mandallandı (2026-08-02)

`docs/reference/api-surface-coverage.md` — her ucu bir ekrana eşleyen tablo
(**206 uç**), `scripts/check-docs.ts` §7'de CI kapısı.

Kapatılanlar: kuruluş başvurusunda belge akışı · kulüp yönetim paneli ·
okul geneli duyuru (öğrenci + yönetim) · platform paneli · etkinlik yönetimi ·
kişi moderasyon sekmesi.

### Ölçümün asıl bulgusu: sayı yanlıştı

"43 yüzeysiz uç" dedim; yeniden ölçümde **11'i dolaylı** (başka ekranın
parçası — yoklama, devir teslim, kulüp paneli), **2'si iç akış** (mail linki).
**Hiçbir uç ölü değil.** Gerçek borç **19**.

**Ders: "—" tek anlam taşımıyordu.** Dört etiket ayrıldı:

| Etiket | Anlam | Kapı |
| --- | --- | --- |
| `/rota` | doğrudan ekran | geçer |
| `(eksik)` | yüzey gerekli, bağlanmadı | **kırar** |
| `(dolaylı)` | başka ekranın parçası | geçer |
| `(iç)` / `(karar bekliyor)` | akış içi / ürün kararı bende | geçer |

### MANDAL (ratchet) — kapının kırmızı kalmasına izin verme

İlk denemede ajan 24 eksiği kapıya alarm verdirdi ve `docs:check` **kalıcı
kırmızı** oldu, "kasıtlı" diyerek. **Bu daha kötü:** sürekli kırmızı kapı,
gürültülü kapıdan daha hızlı görmezden gelinir.

Kurulan düzen — `docs/reference/api-surface-baseline.json`:
- Tabanda olmayan **yeni** eksik → kırmızı (asıl yakalanmak istenen)
- Taban **büyüdü** → kırmızı
- Taban **küçüldü** → kırmızı ama "borç azaldı, tabandan çıkar" mesajıyla
- `docs:check` temiz durumda **exit 0**

Kanıt yeşilden değil kırmızıdan alındı: sahte uç eklenip kapının kırdığı
gösterildi, sonra geri alındı.

**How to apply:** Yeni uç eklenirken yüzeyi de yaz ya da tabana gerekçeyle
ekle. "Backend bitti" ≠ "özellik bitti". Dalgaları eşle: BE bir şeyi
bitirirken FE önceki turun yüzeyini yapsın.
İlgili: [[ajan-prompt-desenleri]] · [[urun-yol-haritasi-ve-durum]] ·
[[dogrulama-refleksleri]]
