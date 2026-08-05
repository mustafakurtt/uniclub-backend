---
name: yonetim-bilgi-mimarisi
description: "Yönetim paneli dört ayrı EKSENDE bölünmüştü; menü nesneye göre, sıklık ana sayfada, bilgi detay sayfalarında"
metadata:
  node_type: memory
  type: project
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-08-02T14:35:21.273Z
---

**Tasarım: `docs/design/07-yonetim-bilgi-mimarisi.md`** (2026-08-02, Claude yazdı).
Kullanıcı tasarım işini ajanlara vermiyor — *"düşünemiyorlar"*.

## Teşhis — sorun girdi sayısı değildi

Kullanıcı: *"bir sürü alt kategori var, herkes farklı işleri farklı yerlerde,
bazıları eksik, her şey çok karmaşık."*

Menü **dört ayrı eksende** bölünmüştü:

| Grup | Eksen |
| --- | --- |
| Günlük iş | sıklık |
| Kurum yapısı | nesne |
| Sistem | teknik katman |
| Platform | kitle |

Eksenler karışınca her girdi mantıken 2-3 gruba ait olur → kimse bir şeyin
nerede olduğunu **tahmin edemez**. Bu, "çok girdi var" hissinin gerçek sebebi.

## Üç ilke

1. **Menü nesneye göre bölünür, sıklığa göre değil.** Sıklık ana sayfada
   ifade edilir. "Günlük iş" bir menü başlığı değil, ana sayfanın kendisidir.
2. **Her nesnenin tek evi vardır.** Menü girdisi çoğaltmak yerine detay
   sayfası zenginleşir.
3. **Ayar ile iş ayrılır.** "Kurum bunu nasıl yapıyor" (nadiren) ile
   "bugün ne yapılacak" (her gün) aynı listede olmaz.

Yeni yapı: **Çalışma alanı · Ayarlar · Platform** (üçü de aynı eksende:
ne yapıyorum / nasıl ayarlıyorum / kimim).

## Asıl fikir — dalga 5, henüz yapılmadı

> **Liste sayfaları dar olur, detay sayfaları her şeyi barındırır.**

Bugün tek bir kişi üç ekrana dağılmış: rolü `/admin/users`, yasağı
`/admin/moderation`, yetkisi `/admin/permissions`. Toplanacağı yer kişinin
detay sayfası. Aynısı kulüp için de geçerli.

Kullanıcının endişesi — *"sırf yönetici diye sadece yönetim koyamayız,
o da her şeyi görmek isteyebilir"* — bu yaklaşımla çözülüyor: **hiçbir
yetenek kaldırılmıyor, sadece doğru yere toplanıyor.**

## Yapılan / kalan

Dalga 1 (menü), 2 (ana sayfa bağımsız bloklar, `resolveAdminHomeVariant`
silindi), 4 (etkinlik ekranı) **bitti**. Dalga 3 başladı (moderasyon sekmesi).
**Dalga 5 açık.**

**Bilinen borç:** tenant geneli etkinlik listesi ucu sonradan yazıldı ama
frontend hâlâ kulüp kulüp topluyor — yeni uca geçirilmedi.

İlgili: [[frontend-bilgi-mimarisi]] · [[yuzey-kapsamasi]] ·
[[urun-yol-haritasi-ve-durum]]
