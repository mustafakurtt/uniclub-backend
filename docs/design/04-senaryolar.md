# 04 — Uçtan Uca Birleşik Senaryolar

Kullanıcı + rol + yetki + tenant + kulüp ilişkilerinin birlikte devreye girdiği
gerçekçi yönetim akışları. Her senaryo seed verisiyle (bkz. [README §7](README.md)
ve `seed.ts`) somutlaştırılmıştır. Adımlarda `[VAR]` = bugün çalışır,
`[EKSİK]` = önerilen endpoint gerektirir ([05](05-eksikler-ve-onerilen-endpointler.md)).

Seed'den kritik aktörler:
- `superadmin@antalya.edu.tr` → `super_admin` (tenant bypass, tüm yetkiler)
- `elif.demir@antalya.edu.tr` → Antalya `admin`
- `okan.yildiz@egebilim.edu.tr` → Ege `admin`
- `hulya.ozkan@kartek.edu.tr` → Karadeniz `admin`
- `ahmet.hoca@antalya.edu.tr` → `advisor` (2 kulüp danışmanı)
- `murat.tekin@antalya.edu.tr` → `advisor` (kulüpsüz — havuz)
- `mustafa.kurt@std.antalya.edu.tr` → `student`, Yazılım Kulübü **president**
- `merve.acar@std.kartek.edu.tr` → `student`, bir kulüpte officer + diğerinde president

---

## S-A — Yeni bir okul yöneticisi (admin) atama

**Amaç:** super_admin, Ege'de bir öğretim üyesini admin yapsın.

1. `[VAR]` super_admin giriş yapar (`role.manage` var).
2. `[EKSİK/VAR]` Hedef kullanıcıyı bulmak: Ege kullanıcılarını listele →
   `GET /api/admin/universities/<Ege>/users` **çalışır** (super_admin tenant
   bypass). Ancak "advisor'ları filtrele" yoktur → tüm listeden seçilir.
3. `[VAR]` `PATCH /api/auth/users/<kemal.hoca>/promote-admin` →
   `"Kullanıcı yönetici yapıldı."`. `userRoles`'a `admin` eklenir; kullanıcının
   `advisor` rolü **durur** (union). Cache anında temizlenir.
4. **Sonuç:** kemal.hoca artık Ege admini. `/api/admin/universities/<Ege>/...`
   çağırabilir; **başka tenant'ı çağırırsa `403`** (super_admin değil, admin).

**İlişki notu:** admin olması, onu kayıt anında aldığı `advisor` rolünden
etmez; hâlâ kulüp danışmanı **atanabilir** (advisor rolü şartı sağlanır).

---

## S-B — Onay makamı (SKS) rolü kurmak ve atamak

**Amaç:** Kulüp başvurularını onaylayan ama kullanıcı yönetemeyen yeni bir rol.

1. `[VAR]` `POST /api/auth/roles` `{ "name": "sks_officer", "description": "SKS Görevlisi" }`
   → rol oluşur (boş, yetkisiz).
2. `[VAR]` Katalogdan `club.approve`'un `permissionId`'si (`GET /api/auth/permissions`).
3. `[VAR]` `POST /api/auth/roles/<sks_officer>/permissions` `{ permissionId }`
   → role yalnızca `club.approve` eklenir.
4. `[EKSİK]` Bir kullanıcıya `sks_officer` **atama** → genel rol atama endpoint'i
   yok (`promote-*` yalnızca admin/super_admin). Bugün yapılamaz.
   → Öneri: `POST /api/auth/users/:userId/roles { roleId }` ([05](05-eksikler-ve-onerilen-endpointler.md)).
5. **Şema bağlantısı:** Bu rol, `clubApplicationApprovals.step: 2` (ör. "SKS
   onayı") gibi genişletilebilir onay zincirinin insan tarafını temsil eder —
   şema zaten hazır, yalnızca atama akışı eksik.

---

## S-C — Tek bir admin'e ekstra yetki (rolü bozmadan)

**Amaç:** Sadece Antalya admini `elif.demir` fakülte ekleyebilsin; diğer
adminler ekleyemesin.

- **Yanlış yol** `[VAR ama yan etkili]`: `admin` rolüne
  `university.faculty.create` eklemek → **tüm tenant'lardaki tüm adminler**
  kazanır (okan.yildiz, hulya.ozkan da). İstenen bu değil.
- **Doğru yol** `[EKSİK]`: kişi bazlı override →
  `POST /api/auth/users/<elif>/permissions { key: "university.faculty.create", granted: true }`.
  Effective sette elif'in rol yetkileri + bu tek yetki birleşir; diğer adminler
  etkilenmez. Endpoint henüz yok — [05](05-eksikler-ve-onerilen-endpointler.md) #2.

> **Ek engel:** `university.faculty.create` rotaları da tenant-scoped
> olabileceği için (üniversite feature'ının yazma rotaları) elif yalnızca kendi
> üniversitesinde iş görür — bu istenen davranış.

---

## S-D — Bir admin'den yıkıcı yetkiyi kişisel geri çekme

**Amaç:** Karadeniz admini `hulya.ozkan` kulüp **silemesin**, ama diğer adminler
silebilsin ve hulya'nın öbür admin yetkileri kalsın.

- `[EKSİK]` `POST /api/auth/users/<hulya>/permissions { key: "club.delete", granted: false }`.
- **Effective hesap:** `admin` rolünden gelen `club.delete`, `userPermissions`
  döngüsünde `granted:false` ile **çıkarılır** (kişisel override rolü ezer, bkz.
  [03 §3.3](03-yetki-ve-claim-yonetimi.md)). hulya `DELETE .../clubs/:id`
  denerse `403`; `elif`/`okan` silmeye devam eder.
- `[VAR]` Alternatif (kaba): `admin` rolünden `club.delete`'i tümden kaldırmak →
  ama bu **herkesi** etkiler (S-C'nin tersi problem).

---

## S-E — Kulüp başkanı olan bir öğrenciyi askıya alma

**Amaç:** `mustafa.kurt` (Yazılım Kulübü başkanı) disiplin nedeniyle askıya
alınsın.

1. `[VAR]` `PATCH /api/admin/universities/<Antalya>/users/<mustafa>/status
   { "status": "suspended" }` (admin `elif` veya super_admin).
2. **Sonuç (KATMAN A):** mustafa'nın bir sonraki login'i `401`
   `"Hesabınız askıya alınmıştır..."`. Mevcut JWT'si süresi dolana dek çalışır
   (stateless) — anlık kesme yok (bkz. [01 §S3.2](01-kullanici-yonetimi.md)).
3. **Sonuç (KATMAN B — kritik):** `clubMembers(Yazılım, mustafa, president,
   approved)` satırı **DEĞİŞMEZ**. Kulüp hâlâ mustafa'yı başkan olarak taşır.
   Global askı, kulüp içi rolü düşürmez (iki katman bağımsız).
4. **Panelde gösterilmesi gereken uyarı:** "Bu kullanıcı 1 kulüpte başkan.
   Askıya almak başkanlığı devretmez." Başkanlık devri KATMAN B (kulüp yönetimi)
   işidir, bu panelin değil.

---

## S-F — Danışman atama ve rol bağı

**Amaç:** Danışmansız Tiyatro Kulübü'ne (Antalya, pending) danışman atansın.

1. `[VAR]` `GET /api/admin/universities/<Antalya>/clubs?status=pending` → Tiyatro.
2. `[VAR]` `POST /api/admin/universities/<Antalya>/clubs/<tiyatro>/advisors
   { userId: <murat.tekin> }` (murat kulüpsüz advisor — havuz).
   - Servis şartları: kulüp bu tenant'ta olmalı; kullanıcı bu tenant'ta olmalı;
     kullanıcı **`advisor` global rolüne sahip olmalı** (`userHasRole`), yoksa
     `"Danışman olarak yalnızca 'advisor' rolündeki personel atanabilir."`;
     zaten danışmansa `"Bu kullanıcı zaten kulübün danışmanı."`
3. **İlişki tuzağı:** Bir öğrenciyi (rolü `advisor` olmayan) danışman yapmak
   istenirse önce ona `advisor` rolü verilmeli — ama **genel rol atama yok**
   (S-B #4). Yani danışman havuzu, `staff` e-postasıyla kaydolmuş kişilerle
   sınırlı kalır. Bu bağ, genel rol atama endpoint'i eklenince çözülür.

---

## S-G — Tenant izolasyonu ihlali denemeleri (hepsi reddedilmeli)

1. **Admin, başka tenant'ın kullanıcısını yönetmeye çalışır:**
   `elif` (Antalya) → `GET /api/admin/universities/<Ege>/users` → `403`
   `"Bu üniversiteye ait kaynaklara erişim yetkiniz bulunmamaktadır."`
   (`enforceTenantScope`).
2. **Admin, path'i kendi tenant'ı yapıp başka tenant'ın userId'sini dener:**
   `elif` → `.../universities/<Antalya>/users/<cem@Ege>` → `404`
   `"Kullanıcı bulunamadı."` (kullanıcı Antalya'da aranır, bulunmaz — sızıntı yok).
3. **Çapraz tenant bölüm ataması:** super_admin, Antalya kullanıcısına Ege'nin
   bölümünü atar → `400` `"Bölüm bu üniversiteye ait değil."` (faculty zinciri
   doğrulaması, super_admin için de çalışır).
4. **super_admin bypass:** super_admin 1. ve 2. adımların meşru versiyonlarını
   **yapabilir** (her tenant). Fark: `enforceTenantScope` `super_admin` rolünü
   görünce path'teki üniversiteyi olduğu gibi kabul eder.

---

## S-H — "Kendi ayağına sıkma" senaryoları (backend engellemez)

Aşağıdakiler bugün **başarılı olur**; korumalar UI/öneri seviyesindedir
([05](05-eksikler-ve-onerilen-endpointler.md) #6):

- **S-H1 — Son super_admin kendini düşürür:** `superadmin@antalya` →
  `demote-super-admin` kendi `userId`'sine → başarılı. Sistemde `role.manage`
  taşıyan kimse kalmayabilir → rol/yetki yönetimi kilitlenir (yalnızca DB'den
  elle düzeltilir). "Son super_admin korunmalı."
- **S-H2 — admin kendini askıya alır:** `elif` → kendi status'unu `suspended`
  → bir sonraki login'de kilitlenir.
- **S-H3 — Çekirdek rol adını değiştirme:** `PATCH /roles/<super_admin>
  { name: "root" }` → başarılı, ama `enforceTenantScope`/`assignGlobalRole`
  `"super_admin"` literaline bakar → **tenant bypass ve promote sessizce
  kırılır.** Çekirdek rol adları UI'da kilitlenmeli (bkz. [02 §3](02-rol-yonetimi.md)).

---

## S-I — Rol/yetki değişikliğinin anlık yayılımı (cache)

**Amaç:** Değişikliğin ne zaman etkili olduğunu doğrulamak.

1. `[VAR]` `admin` rolünden `club.delete` kaldırılır (`DELETE .../roles/<admin>/permissions/<club.delete>`).
2. Servis `findUserIdsByRole(admin)` ile **tüm adminleri** bulur ve
   `invalidateUsersPermissions` ile cache'lerini siler.
3. **Sonuç:** O anda "Kulübü Sil" ekranı açık olan `elif` bile bir sonraki
   istekte `403` alır — 5 dakikalık TTL beklenmez. Ancak elif'in **React
   state'i** kendiliğinden güncellenmez; buton görünmeye devam edebilir →
   backend zaten reddeder (altın kural: guard yalnızca UX içindir).

---

## Senaryo → dosya çapraz referansı

| Senaryo | Ağırlıklı konu | Detay dosyası |
|---|---|---|
| S-A | admin atama | [02](02-rol-yonetimi.md) §4a |
| S-B | özel rol + atama eksiği | [02](02-rol-yonetimi.md) §2,§4b · [05](05-eksikler-ve-onerilen-endpointler.md) |
| S-C, S-D | kişi bazlı override | [03](03-yetki-ve-claim-yonetimi.md) §3 · [05](05-eksikler-ve-onerilen-endpointler.md) |
| S-E | askı × kulüp başkanlığı | [01](01-kullanici-yonetimi.md) §3 |
| S-F | danışman × advisor rolü | [02](02-rol-yonetimi.md) §4b |
| S-G | tenant izolasyonu | [README](README.md) §5 · [01](01-kullanici-yonetimi.md) |
| S-H | güvenlik önlemleri | [05](05-eksikler-ve-onerilen-endpointler.md) #6 |
| S-I | cache invalidation | [README](README.md) §4 |
