---
name: tiklama-provasi
description: Her demo/sürüm öncesi kullanıcının gerçek hesaplarla tıklaması — 530 testin göremediği 5 sorunu buldu
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-08-01T23:10:26.977Z
---

**Kural:** Rol bazlı yüzeyler, layout değişiklikleri ve yeni ekranlar, **gerçek
hesapla tarayıcıda tıklanmadan** "bitti" sayılmaz.

**Kim yapar:** Kullanıcı. Ajanlar tarayıcı açamıyor (dürüstçe söyleyip API
doğrulamasıyla ikame ediyorlar). Ben de açamıyorum — `app.request` ile canlı prob
atabilirim, o da yalnızca API katmanını kapsar.

## Neden — kanıt

530 test + typecheck + lint + build + docs:check yeşilken tıklama provası
**beş sorun** buldu. Hiçbiri bir kapının yapısal olarak görebileceği türden değildi:

1. **Kurul yönetimi SKS'de kapalı** — yetki yanlış role bağlıydı. Testler
   `university_admin` ile koşuyor, o yüzden görünmedi.
2. **Ret oyu sessizce iptal** — istemci `return` ediyor, hiçbir geri bildirim yok.
   Fonksiyon "başarıyla" dönüyor.
3. **`requiredApprovals` boş** — arayüzün tükettiği alan, testlerin bakmadığı yer.
4. **Kurul üyeliği yetki üretmiyor** — `academic_affairs` rollü üye oy vereceği
   başvuruyu açamıyor. Rol kombinasyonu test edilmiyor.
5. **`AdminLayout` çöküyor** — bileşen kendi render ettiği context'i kendi
   gövdesinde tüketiyor. **Çalışma zamanı hatası; tsc/lint/build göremez.**

Beşincisini **ben birleştirdim**. Hook'un varlığını doğruladım, konumunu değil.

## Nasıl yapılır

Kullanıcıya **hesap + adım + beklenen sonuç** olarak ver, "bir bak" deme:

```
1. sks@antalya.edu.tr → Yönetim → Kulüpler → Robotik Otomasyon
   Beklenen: Koordinasyon Kurulu kademesi, 2/3 onay, 3 üye oy vermedi
2. Oy ver → F5 → oy duruyor mu   ← kalıcılık testi
3. ogrenci.isleri@antalya.edu.tr → "Kurul Görevlerim" sekmesi + 2 rozeti
4. mustafa.kurt@std.antalya.edu.tr → bireysel oy GÖRÜNMEMELİ  ← sızıntı testi
```

Şifre: `Password123!`

**"Kırılan yeri düzeltmeyin, bildirin"** de — düzeltilirse ne kırıldığı öğrenilemez.

**Rol çeşitliliği şart:** her rolden en az bir hesapla dene. Beş bulgunun dördü
"yanlış rolle giriş yapınca" ortaya çıktı.

**How to apply:** Sürüm etiketlemeden ve demo öncesi zorunlu adım. Prova
sonuçlarını ajan raporu gibi doğrula. İlgili: [[dogrulama-refleksleri]] ·
[[ajan-prompt-desenleri]]
