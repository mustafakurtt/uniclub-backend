---
name: dogrulama-refleksleri
description: "Uniclub'da ajan raporlarını ve kendi işini doğrularken işe yarayan somut kontroller"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-08-02T14:34:31.641Z
---

Rapor okumak doğrulama değil. Aşağıdakiler gerçek kusur yakaladı.

## Her turda

- **Kapıları kendim koşarım.** Ajan sayısı doğru olsa bile. Yeşil olduğunu
  görmediğime yeşil demem.
- **Şema değişen her dalgada `db:migrate`'i AYRICA ve FLAGSIZ koş.** Testler
  `--ignore-conflicts` ile yeşilken prod deploy düşmüştü.
- **Ajanın "gerekebilir"ini kesinlik oku** (bkz. [[ajan-prompt-desenleri]]).
- **Ajan çalışırken ağaca dokunma.** Bir kez yarım işin üstünde test koşup 42 hata
  gördüm; iş bitmemişti. Önce `git status` ile ağacı yokla.

## Yeşil kapı ≠ çalışan sistem

Üç/beş kapı yeşilken **tıklama provası beş ayrı sorun buldu**:

| Bulgu | Neden testler göremedi |
| --- | --- |
| Kurul yönetimi SKS'de kapalı | Testler `university_admin` ile koşuyor |
| Ret oyu sessizce iptal | Fonksiyon "başarıyla" dönüyor |
| `requiredApprovals` boş | Testler o alanı tüketmiyor |
| Kurul üyeliği yetki üretmiyor | Rol kombinasyonu denenmiyor |
| **`AdminLayout` çöküyor** | **Çalışma zamanı hatası — tsc/lint/build göremez** |

**Kural: rol bazlı yüzeyler ve layout değişiklikleri gerçek hesapla tıklanmadan
"bitti" sayılmaz.** Tıklama provası kullanıcıya ait; ajanlar tarayıcı açamıyor.

## Somut kontroller

- **Testler ayrı DB ve `CACHE_DRIVER=memory` ile koşar** (`tests/setup.ts`).
  Stale-Redis kaynaklı hiçbir hata testte görünmez. Cache şüphesinde **canlı prob**
  at: `app.request` ile scratchpad'de küçük betik.
- **Dosyanın kendisine bak**, content-type'a değil. xlsx → `50 4b 03 04` +
  `xl/workbook.xml`; PDF → `%PDF-` + `FontFile2`. Yeniden üretilebilirlik iddiası
  → iki üretimin SHA-256'sı.
- **Yeni hook bir layout'a girdiyse context sırasını kontrol et.** Bir bileşen
  kendi render ettiği provider'ı kendi gövdesinde tüketemez. `AdminLayout` tam
  bunu yaptı ve tüm yönetim paneli çöktü — ben birleştirdim, hook'un varlığını
  doğruladım ama **konumunu** doğrulamadım.
- **Depolar arası iddiayı iki tarafta da ara.** FE "şu başlığı işliyorum" dediyse
  backend onu üretiyor mu bak.
- **Ajanın "şunu taşımadım" itirafını ölç**, körü körüne kabul etme.
- **Kullanıcı "bozuk" derse sebebi koda dayandır.** Bir kez kusurun kaynağı
  sanılan katman yanlış çıktı (kötü etiket FE'de değil BE kataloğundaydı).
- **Web arama/fetch araçlarının PDF özetine güvenme** — bir kez tamamen uydurma
  cevap verdi ("5-10 kurucu"; gerçek 15). İndir, `pdfjs-dist` ile kendin çıkar.
- **SSS/tanıtım sayfaları yönergeden kayar.** Akdeniz SSS "30 öğrenci" diyor,
  yönerge "elli". Yönerge esastır.

## `git add -A` — ajan çalışırken KULLANMA

2026-08-02: doküman commit'ini `git add -A` ile attım ve ajanın o sırada
yazmakta olduğu **5 kod dosyasını da süpürdüm**. Kod doğruydu ama commit
başlığı ("docs:") kapsamını yanlış anlatır oldu; gönderilmiş geçmiş
yeniden yazılmadı, düzeltme ayrı commit'e kaydedildi.
**Ağacın tamamı senin değil** — ajan çalışırken dosyaları tek tek ekle.

## Kırmızı testi ajana yazmadan ÖNCE TABANI ÖLÇ

2026-08-02: BE-33 sonrası 3 test kırmızıydı, ajana "gerileme yaptın" yazmak
üzereydim. Önce `git stash -u` ile değişikliği çıkarıp tabanı koştum —
**taban da kırmızıydı** (6 fail). Sebep koddaki değişiklik değildi.
Restart sonrası taban 566/0, değişiklikle 570/0.

**Refleks: kırmızı test gördüğünde ilk hamle suçlamak değil, tabanı ölçmek.**

## Ortam tuzakları

- Postgres bağlantıları düzenli tükeniyor (`sorry, too many clients already`) —
  `docker compose restart postgres` + ~25 sn. **Kod hatası sanma.**
  Ayırt edici İMZA (üçü birden):
  1. **Koşan test SAYISI düşüyor** (566 → 559) — dosya kayıt olmadan çöküyor
  2. Kırmızıya dönenler birbiriyle **alakasız** (akademik dönem + üyelik
     tarihçesi + etkinlik co-host aynı anda)
  3. Tekrar koşunca **farklı** testler kırmızı
  Deterministik hata bunun tersi: aynı test, aynı satır, her koşuda.
- **`docker compose down -v` TÜM servisleri ve volume'ları siler** (Redis,
  Mailpit, Grafana, dev verisi). Temiz-DB kanıtı isterken prompt'a yazma.
- Prob betikleri seed verisini değiştirebilir → sonra `db:seed` ile geri yükle.

İlgili: [[pm-rolu-ve-denetim-duzeni]] · [[ajan-prompt-desenleri]] ·
[[komutlari-ben-calistiririm]]
