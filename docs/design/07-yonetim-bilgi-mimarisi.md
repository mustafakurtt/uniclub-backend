# 07 — Yönetim Paneli Bilgi Mimarisi

**Durum:** tasarım · 2026-08-02
**Kapsam:** `/admin/*` — tenant yöneticileri, SKS personeli, kurul üyeleri, platform operatörleri

---

## 1. Neden yeniden tasarlanıyor

Panel çalışıyor ama gezinilemiyor. Sebep girdi sayısı değil: **kategoriler
dört ayrı eksende bölünmüş.**

| Grup | Bölünme ekseni |
| --- | --- |
| Günlük iş | sıklık |
| Kurum yapısı | nesne |
| Sistem | teknik katman |
| Platform | kitle |

Eksenler karışınca her girdi mantıken 2–3 gruba ait olur, dolayısıyla kimse
bir şeyin nerede olduğunu **tahmin edemez**. "Onay Kurulları" neden Kurum
yapısı'nda ama "Kurul görevlerim" Günlük iş'te? İkisi de savunulabilir —
çünkü aynı soruyu iki farklı eksende cevaplıyorlar.

### Ölçülen kırılmalar

1. **Bir kişi üç ekrana dağılmış.** Rol değişimi `/admin/users`, yasaklama
   `/admin/moderation`, efektif yetki `/admin/permissions`.
2. **Etkinliklerin yönetim ekranı yok.** Backend'de iptal ve görünürlük
   uçları var (`admin-activities.routes.ts`), menüde karşılığı yok.
3. **Sıklık ekseni menüye sızmış.** "Günlük iş" bir menü başlığı değil,
   ana sayfanın kendisidir.

---

## 2. İlkeler

**İ1 — Menü nesneye göre bölünür, sıklığa göre değil.**
Ne sıklıkta dokunulduğu ana sayfada ifade edilir. Menü "nerede ne var"ı
söyler; ana sayfa "bugün ne yapılacak"ı.

**İ2 — Her nesnenin tek bir evi vardır.**
Bir kulüple ilgili her şey kulübün detayında, bir kişiyle ilgili her şey
kişinin detayında. Menü girdisi çoğaltmak yerine detay sayfası zenginleşir.

**İ3 — Ayar ile iş ayrılır.**
"Kurum bunu nasıl yapıyor" (nadiren) ile "bugün ne yapılacak" (her gün)
aynı listede olmaz.

**İ4 — Görünürlük izinle, rol adıyla değil.**
Her girdi kendi izin anahtarıyla korunur. Kaba "yönetici mi" kontrolü yok.
(Bu kural bugün altı ayrı hatanın kaynağıydı; bkz. `docs/design/06`.)

**İ5 — Hiçbir şey kaldırılmaz, yalnızca toplanır.**
Yetkisi olan yönetici bugün gördüğü her şeyi görmeye devam eder.

---

## 3. Yapı

```
/admin                          İŞ KUYRUĞU — menü girdisi değil, ana sayfa
    Sana düşen kararlar         bekleyen başvuru · oy bekleyen kurul · itiraz
    Kurum nabzı                 aktif kulüp · bu ay etkinlik · yeni üye

ÇALIŞMA ALANI
    Kulüpler                    kulüpler | başvurular | kuruluş önerileri
    Kişiler                     kullanıcılar + moderasyon (birleşik)
    Etkinlikler                 YENİ — iptal, görünürlük, yaklaşanlar
    Duyurular                   okul geneli

AYARLAR                         tek çatı, altta, nadiren açılır
    Kurum                       akademik yapı · dönemler
    Süreç                       politikalar · onay kurulları
    Erişim                      roller · yetkiler
    Kayıt                       denetim izi · dışa aktarma

PLATFORM                        yalnızca tenant'sız hesaplar (ayrı kabuk)
    Tenantlar · Operatörler
```

Dört grup yerine üç, ve üçü de aynı ekseni kullanıyor:
**ne yapıyorum / nasıl ayarlıyorum / kimim.**

---

## 4. Ekran ekran içerik

### 4.1 `/admin` — iş kuyruğu

Panelin tek amacı: **yöneticiye bugün kendi kararını bekleyen şeyi göstermek.**
Boş kutu gösterilmez; bir blok boşsa hiç render edilmez.

| Blok | Görünürlük |
| --- | --- |
| Bekleyen başvurular | `application.view` |
| Oy bekleyen kurul kararları | kurul üyeliğinden türer (rol adından değil) |
| Bekleyen itirazlar | `application.review` |
| Bekleyen danışman davetleri | `club.manage` |
| Kurum nabzı (sayılar) | `university.view` |

### 4.2 Kulüpler

Sekmeler (bugün de var, korunuyor): **kulüpler · başvurular · kuruluş önerileri**

`/admin/clubs/:clubId` — kulübün her şeyi tek yerde:

| Sekme | İçerik |
| --- | --- |
| Profil | ad, açıklama, durum, iletişim linkleri |
| Üyeler | liste, roller, çıkarma |
| Danışmanlar | atama, davet, davet iptali |
| Etkinlikler | kulübün etkinlikleri, iptal, görünürlük |
| Duyurular | kulüp duyuruları, moderasyon |
| Başvuru geçmişi | kuruluş başvurusu, belgeler, kontrol listesi, itiraz |
| Devir teslim | genel kurul kayıtları, kurul künyesi |

### 4.3 Kişiler ← **birleştirme**

Bugün `/admin/users` ve `/admin/moderation` ayrı. Birleşiyor.

`/admin/people/:userId`:

| Sekme | Bugün nerede |
| --- | --- |
| Kimlik + bölüm | `/admin/users/:id` |
| Roller | `/admin/users/:id` |
| Kulüp üyelikleri | dağınık |
| Moderasyon | `/admin/moderation` — yasak, yasak kaldırma, geçmiş, şifre sıfırlama |
| Efektif yetkiler | `/admin/permissions` |
| Denetim izi (bu kişi) | `/admin/audit` filtresi |

Her sekme kendi izniyle korunur: moderasyon sekmesi `user.moderate` yoksa
görünmez, ama sayfanın kalanı çalışır.

### 4.4 Etkinlikler ← **yeni yüzey**

Backend hazır, ekranı yok:
`POST .../activities/:activityId/cancel` · `PATCH .../clubs/:clubId/activities/:activityId`

Liste: yaklaşan / geçmiş / iptal edilmiş. Aksiyon: iptal (gerekçeli),
görünürlük değişimi (`inter_university`).

### 4.5 Duyurular

`/admin/university-announcements` — değişmiyor, yalnızca yeni grupta.

### 4.6 Ayarlar

Tek çatı, dört alt başlık. Rotalar korunuyor, yalnızca gruplama değişiyor:

| Alt başlık | Sayfalar |
| --- | --- |
| Kurum | akademik yapı, akademik dönemler |
| Süreç | politikalar (tenant settings), onay kurulları |
| Erişim | roller, yetkiler |
| Kayıt | denetim izi, dışa aktarma |

### 4.7 Platform

Ayrı kabuk, tenant'sız hesaplar. Değişmiyor.

---

## 5. Asıl taşınma: menüden detaya

Bugün bilgi **menüye** yayılmış; toplanması gereken yer **nesnenin detay
sayfası**.

> Liste sayfaları dar olur, detay sayfaları her şeyi barındırır.

Yönetici bir kişiyi arıyorsa tek yere gider ve her şeyi orada görür.
Menü küçülür, detay büyür.

---

## 6. Dalgalar

| Dalga | İş | Risk | Not |
| --- | --- | --- | --- |
| 1 | Menü yeniden gruplama | düşük | rota değişmiyor, yalnızca `AdminLayoutShell` grupları |
| 2 | `/admin` iş kuyruğu bloklarının bağımsız koşullanması | düşük | boş blok gizlenir |
| 3 | Kişiler birleşimi (`users` + `moderation`) | orta | eski rotalar yönlendirme bırakır |
| 4 | Etkinlikler ekranı | orta | yeni yüzey, 2 uç |
| 5 | Kulüp/kişi detay sekmelerinin zenginleştirilmesi | yüksek | asıl iş, en çok değer burada |

**Dalga 1 ve 2 gösterimden önce yapılabilir.** 3–5 sonrası.

---

## 7. Kırmızı çizgiler

- Eski rotalar **silinmez**, yönlendirme bırakır. Kimsenin yer imi kırılmaz.
- Hiçbir yetenek kaldırılmaz (İ5).
- Her menü girdisi kendi izin anahtarıyla korunur (İ4).
- Boş blok gösterilmez — özür metni yazmak yerine bloğu gizle.
