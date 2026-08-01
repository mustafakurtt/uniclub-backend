# KVKK — Kişisel Veri Envanteri ve Saklama

Bu doküman sistemin **kişisel veri açısından ne yaptığını** kayda geçirir:
hangi tabloda ne duruyor, ne kadar duruyor, silme talebi geldiğinde ne oluyor.

> ⚠️ Bu bir **mühendislik dokümanıdır, hukuki görüş değildir.** Aydınlatma metni,
> açık rıza tasarımı, VERBİS bildirimi ve saklama sürelerinin nihai tespiti hukuk
> tarafının işidir. Buradaki süreler **öneri/varsayılan**dır ve hukuk onayından
> geçmeden politika sayılmaz. Bu dosyanın işlevi, o değerlendirmeyi yapacak kişiye
> sistemin gerçeğini eksiksiz vermektir.

İlgili: [data-model.md](../reference/data-model.md) · [runbook.md](../operations/runbook.md) ·
[error-and-audit.md](../reference/error-and-audit.md)

---

## 1. Kişisel veri envanteri

Hangi tabloda kişisel veri var, hangisinde yok:

| Tablo | Kişisel veri | Ne |
|---|:---:|---|
| `users` | ✅ **doğrudan kimlik** | ad, soyad, e-posta, öğrenci numarası, fotoğraf URL'i, şifre özeti, bölüm |
| `email_verifications` | ⚠️ dolaylı | `user_id` + token özeti; içerikte kimlik yok |
| `tenant_admin_invitations` | ⚠️ dolaylı | hedef e-posta, ad/soyad, token özeti; **operatör şifreyi bilmez** |
| `notifications` | ⚠️ dolaylı | `user_id`, başlık/gövde metni (kişiye özel ifadeler içerebilir) |
| `push_subscriptions` | ✅ **cihaz** | endpoint + şifreleme anahtarları = cihaz tanımlayıcı |
| `club_members`, `club_advisors` | ⚠️ dolaylı | kişinin bir kulüple ilişkisi (üyelik bilgisi) |
| `club_applications` | ⚠️ dolaylı | başvuran kimliği + serbest metin açıklama |
| `club_formation_proposals` | ⚠️ dolaylı | öneri sahibi kimliği + serbest metin (destek toplama aşaması) |
| `club_formation_supports` | ⚠️ dolaylı | destekleyen öğrenci kimliği (kuruluş önerisine bağlı) |
| `club_application_approvals` | ⚠️ dolaylı | onaylayan kimliği + karar gerekçesi (serbest metin) |
| `announcements`, `club_gallery` | ⚠️ dolaylı | yazar/yükleyen kimliği; **içerikte** kişisel veri olabilir (fotoğraf!) |
| `audit_logs` | ✅ **davranış + IP** | aktör, işlem, yol, IP, maskelenmiş gövde |
| `user_moderation_actions` | ✅ **hassas bağlam** | ban gerekçesi gibi kişi hakkında yargı içeren serbest metin |
| `universities`, `faculties`, `departments`, `roles`, `permissions`, bağ tabloları | ❌ | kurumsal/yapısal veri |

**Özel nitelikli veri:** Sistem bugün TC kimlik, sağlık, din, biyometri gibi özel
nitelikli veri **toplamıyor**. Toplanmaya başlarsa alan bazlı şifreleme gerekir
(bkz. [security-core.md](../planning/security-core.md) Tier 3).

**Sızıntı riski en yüksek üç yer:** `users` (kimlik), `audit_logs` (IP + davranış),
`club_gallery` (yüz içeren fotoğraflar — bugün dosyanın kendisi harici URL'de,
sahipliği ve silinmesi izlenmiyor; yol haritası 3.4).

### Kuruluş önerisi destekçi görünürlüği (T1.1)

| Aktör | Görebilir | Gerekçe |
|---|---|---|
| Öneri sahibi (öğrenci) | Yalnızca **destek sayısı** ve eşik | Destekçi listesi KVKK riskini artırır; sayı yeterli motivasyon |
| Diğer öğrenciler (keşif) | Öneri adı/açıklama + **sayı** (kimlik yok) | Destek kararı için içerik gerekli; destekçi listesi gereksiz |
| SKS (`application.view`) | **Destekçi listesi** (ad/soyad, destek zamanı) | Kurumsal doğrulama ve denetim — meşru menfaat; yalnızca yetkili personel |

Destek **geri çekilebilir** (satır silinir, sayı düşer). Eşik henüz aşılmadıysa
öneri onay zincirine düşmez; geri çekme sonrası eşik altına inmiş olsa bile
zaten gönderilmemiş başvuru etkilenmez.

---

## 2. Silme talebi → anonimleştirme

**Sistemde kullanıcı kaydı fiziksel olarak SİLİNMEZ.** Bunun sebebi teknik bir
kısıt değil, bilinçli bir karar: `audit_logs`, `announcements`, `club_gallery` ve
`user_moderation_actions` kullanıcıyı **aktör** olarak referanslar. Denetim izi,
ilgilisinin talebiyle yok edilebiliyorsa denetim izi değildir — bir kulübü kimin
onayladığı, bir hesabı kimin askıya aldığı kaydı kurumun sorumluluğundadır.

Bunun yerine **anonimleştirme** yapılır: kişiyi tanımlayan alanlar geri
döndürülemez biçimde maskelenir, kayıtların bütünlüğü korunur.

### Akış

```
POST /api/moderation/universities/:universityId/users/:userId/anonymize
  yetki : user.manage (tenant-scoped)
  gövde : { reason: "<en az 10 karakter>", confirm: "ANONIMLESTIR" }
```

| Alan | Sonrası |
|---|---|
| `email` | `silinmis-<userId>@anonim.invalid` |
| `first_name` / `last_name` | `Silinmiş` / `Kullanıcı` |
| `student_number`, `photo_url`, `department_id` | `NULL` |
| `password_hash` | rastgele (hiçbir parola ile girilemez) |
| `status` | `suspended` |
| `deleted_at` | `now()` |

**Sonuçlar:** hesap giriş yapamaz; elindeki JWT bir sonraki istekte yetkisiz olur
(yetki cache'i anında temizlenir); tüm rolleri düşer. İşlem
`user_moderation_actions`'a gerekçesiyle yazılır — **geri alınamaz**.

`.invalid` uzantısı RFC 2606 gereği hiçbir zaman gerçek bir alan adı olamaz;
maskelenmiş adresin kazara birine ait olma ihtimalini kapatır.

**Tenant yönetici daveti:** Platform operatörü tenant yöneticisinin şifresini
belirleyemez ve öğrenemez. Davet akışında yalnızca e-posta ve ad bilgisi girilir;
şifre davetlinin kabul adımında kendi belirler. Operatör panelinde veya API yanıtında
geçici şifre **hiçbir zaman** dönmez.

### Anonimleştirme sonrası geriye ne kalır

| Kalan | Neden |
|---|---|
| `audit_logs` satırları (aktör id'si + **IP**) | Denetim izi. **Not:** IP başlı başına kişisel veridir; kimlik maskelense de IP kalır → saklama süresiyle sınırlanmalı (§3) |
| `user_moderation_actions` | Kurumsal karar kaydı |
| `announcements` / `club_gallery` içeriği | **İçerik kişisel veri taşıyabilir** (isim geçen duyuru, yüz içeren fotoğraf). Anonimleştirme bunları TARAMAZ — ayrıca ele alınmalı |
| `club_members` satırları | Artık anonim bir kişinin üyelik geçmişi |

> **Bilinen açık:** İçerik taraması yok. "Beni tamamen silin" talebinde, kişinin
> yazdığı duyurular ve yüklediği fotoğraflar elle gözden geçirilmelidir. Bunu
> otomatikleştirmek medya varlıkları tablosunu (3.4) gerektiriyor.

---

## 3. Saklama süreleri (öneri — hukuk onayı bekliyor)

Bugün sistemde **otomatik silme yok**; hiçbir veri kendiliğinden düşmüyor. Aşağıdaki
süreler önerilir ve uygulanmadan önce hem hukuk onayı hem bir temizlik işi
(scheduled job) gerektirir.

| Veri | Önerilen süre | Gerekçe |
|---|---|---|
| `audit_logs` | 2 yıl | Denetim ihtiyacı ile IP saklamanın orantılılığı arasında denge |
| `audit_logs.ip` | 6 ay (kayıt kalır, IP `NULL`lanır) | En hızlı eskiyen alan; işlem kaydı IP'siz de anlamlı |
| `notifications` | 1 yıl | Okunmuş bildirimin taşıdığı değer hızla düşer |
| `email_verifications` | 30 gün | Token 24 saatte ölüyor; kayıt yalnızca teşhis için |
| `push_subscriptions` | Geçersizleşince hemen | Push sağlayıcısı 410 dönerse satır silinmeli |
| `user_moderation_actions` | Hesap yaşadığı sürece + 2 yıl | Kurumsal karar kaydı |
| Anonimleştirilmiş `users` satırı | Süresiz | Zaten kişisel veri taşımıyor; FK bütünlüğü için gerekli |
| Yedekler (`pg_dump`) | 7 gün (mevcut `RETENTION_DAYS`) | Silme talebi yedeklerde **hemen** yansımaz — süre dolunca kapanır |

> **Yedek gerçeği:** Anonimleştirdiğiniz kişi, en fazla `RETENTION_DAYS` kadar
> yedeklerde kimlikli olarak durmaya devam eder. Bu normal ve kabul edilebilir bir
> durumdur ama **aydınlatma metninde söylenmelidir**.

---

## 4. Veriyi kim görebilir

| Rol | Erişim |
|---|---|
| `student` | Yalnızca kendi verisi + kulüplerin herkese açık bilgileri |
| Kamuya açık yüzey (`/api/public`) | **Kimlik yok** — yalnızca public DTO (kulüp/etkinlik meta, iletişim linkleri). Üye/danışman/yönetici adı, katılımcı listesi **yok** (v1 kararı) |
| Kulüp `officer`/`president` | Kendi kulübünün üye listesi |
| `university_admin`, `student_affairs` | **Kendi üniversitesinin** kullanıcıları (tenant scope) |
| `auditor` | Kendi tenant'ının denetim izi (salt-okunur) |
| `super_admin`, `platform_support` | Tüm tenant'lar (tenant scope bypass) |

Erişim, çapraz-tenant sızıntısına karşı hem uygulama katmanında (`enforceTenantScope`)
hem veritabanında (bileşik FK) korunur. **Okuma tarafı için satır seviyesi güvenlik
(RLS) henüz yok** — yol haritası 1.1'in ertelenen adımı.

Her yetki gerektiren mutasyon `audit_logs`'a düşer, reddedilen denemeler dahil.
Yani "bu kullanıcının verisine kim baktı" sorusunun cevabı **mutasyonlar için** var;
salt-okuma erişimleri denetime düşmüyor.

---

## 5. Operasyonel kurallar

Bunlar [runbook.md](../operations/runbook.md)'de de yazılı, burada kişisel veri açısından tekrarlanıyor:

- **Üretim verisi geliştirme makinesine kopyalanmaz** — anonimleştirilmeden asla.
- **Üretim veritabanına "sadece bakmak için" bağlanılmaz**; gerekiyorsa salt-okunur erişim istenir.
- Yedekler (`backups/`) gerçek kişisel veri içerir, repoya girmez, `.gitignore`'dadır.
- Loglar `password`, `token`, `authorization` alanlarını **redakte eder**; ama
  serbest metin alanları (ban gerekçesi vb.) redakte edilmez — log'a kişisel veri
  yazmamaya dikkat edilmelidir.

---

## 6. Yapılacaklar

| İş | Durum |
|---|---|
| Anonimleştirme akışı | ✅ var |
| Kişisel veri envanteri (bu doküman) | ✅ var |
| Saklama sürelerinin hukuk onayı | ⬜ |
| Otomatik temizlik işi (retention job) | ⬜ |
| `audit_logs.ip` için ayrı, kısa süreli maskeleme | ⬜ |
| İçerik taraması (duyuru/fotoğraf) veya medya varlıkları tablosu | ⬜ (3.4) |
| Aydınlatma metni + açık rıza akışı | ⬜ (ürün/hukuk) |
| Veri ihlali müdahale planı | ⬜ |
