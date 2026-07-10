# Frontend — Rol Rütbesi ve Tenant'sız Platform Hesapları (Değişiklik Dokümanı)

**Kime:** Yönetim panelini geliştiren frontend ekibine.
**Ne:** Backend'de RBAC'a **rütbe (rank) hiyerarşisi** eklendi ve `universityId`
artık **null olabiliyor**. Bu, mevcut panelde **kırıcı (breaking)** değişikliklere
yol açıyor.

> Tüm örnekler çalışan sunucudan birebir doğrulanmıştır (Temmuz 2026).
> Tasarım gerekçesi: [yonetim/07-rutbe-ve-kapsam.md](yonetim/07-rutbe-ve-kapsam.md).
> Endpoint referansının tamamı: [FRONTEND_YONETIM.md](FRONTEND_YONETIM.md).

---

## 0. TL;DR — Yapılacaklar listesi

| # | Değişiklik | Frontend'de yapılacak | Kırıcı? |
|---|---|---|:---:|
| 1 | `universityId` artık `string \| null` | Tip güncelle, null-guard ekle | ✅ **Evet** |
| 2 | Yeni `GET /api/admin/universities` | Akademik/yönetim ekranlarını buna geçir | ✅ **Evet** |
| 3 | Rollere `rank` alanı eklendi | Rol listesi/formlarına ekle | ➖ Additive |
| 4 | `me/permissions` artık `maxRank` dönüyor | Aksiyon disable mantığında kullan | ➖ Additive |
| 5 | Yeni iş kuralı hataları **400** dönüyor (403 değil) | Hata gösterimini düzelt | ⚠️ Dikkat |
| 6 | Seed test hesapları değişti | Test/login fixture'larını güncelle | ✅ **Evet** |

---

## 1. `universityId` artık `null` olabilir

Şirketin kendi çalışanları (`super_admin`, `platform_support` ve ileride
`call_center`, sistem moderatörü gibi roller) **hiçbir üniversiteye bağlı değil**.
Veritabanında `users.university_id` nullable oldu.

**Etkilenen yerler:**

```jsonc
// POST /api/auth/login  → user objesi
{ "id": "...", "universityId": null, "departmentId": null, "email": "superadmin@platform.local", ... }

// GET /api/auth/me
{ "userId": "e2e4407d-...", "universityId": null }
```

JWT payload'ı da `{ userId, universityId: string | null, exp }`.

**Yapılacak:**

```ts
// ÖNCE
type AuthUser = { id: string; universityId: string };

// SONRA
type AuthUser = { id: string; universityId: string | null };

/** Platform çalışanı mı? (hiçbir okula bağlı değil) */
const isPlatformAccount = (u: AuthUser) => u.universityId === null;
```

⚠️ **`/api/admin/universities/${user.universityId}/...` şeklinde URL kuran her yer
kırılır** (`.../null/users`). Platform hesabı için hedef üniversite artık
kullanıcıdan değil, **seçilen üniversiteden** gelmeli (bkz. §2).

### Platform hesapları öğrenci akışlarına giremez

Tenant'ı olmayan bir hesap için "hangi okulun kulüpleri?" sorusu tanımsız.
`GET /api/clubs`, kulübe katılma, başvuru, duyuru oluşturma gibi **öğrenci
self-service** rotaları platform hesabına şunu döner:

```
400  { "success": false, "message": "Bu işlem bir üniversiteye bağlı hesap gerektirir." }
```

Platform hesabı ile giriş yapıldığında öğrenci sekmelerini **hiç render etme**.

---

## 2. Yeni endpoint: `GET /api/admin/universities`

**"Bu kullanıcı yönetim bağlamında hangi üniversiteleri görebilir?"** sorusunun tek
doğru cevabı. Sadece `Authorization` ister, ekstra permission istemez.

| Aktör | Döner |
|---|---|
| `super_admin` / `platform_support` | **Tüm** üniversiteler |
| `university_admin`, `student_affairs`, `auditor`, öğrenci … | **Yalnızca kendi** üniversitesi (1 kayıt) |
| Bypass rolü olmayan platform hesabı | Boş dizi |

```jsonc
// GET /api/admin/universities   (elif.demir@antalya.edu.tr → university_admin)
{ "success": true, "message": "Erişilebilir üniversiteler listelendi.",
  "data": [ { "id": "...", "name": "Antalya Bilim Üniversitesi", "slug": "antalya-bilim", ... } ] }
```

### ❗ Bunu neden kullanmalısın

Şu an panel, akademik yapı (fakülte/bölüm/domain) ekranlarında **public**
`GET /api/universities`'i çağırıyor. O endpoint kayıt formu için vardır ve
**bilinçli olarak global**'dir — herkese tüm üniversiteleri döner. Bu yüzden bir
`university_admin` panelde başka okulları da görüyor.

> Netleştirme: bu bir **yetki açığı değildi**. Akademik yapının *yazma* rotaları
> zaten tenant-scoped; bir tenant yöneticisi başka bir okulun fakültesini
> **hiçbir zaman** değiştiremiyordu (403 alıyordu). Sorun panelin **yanlış
> kaynaktan okuması**ydı.

**Yapılacak:** yönetim panelindeki üniversite seçici / akademik yapı ekranları
`GET /api/admin/universities`'e geçirilsin. Public `GET /api/universities` yalnızca
**kayıt formunda** (giriş yapmamış kullanıcı) kalsın.

- Dönen dizi **1 elemanlıysa** → seçici gösterme, doğrudan o üniversiteyi kullan.
- **Çok elemanlıysa** (platform hesabı) → üniversite seçici göster; seçilen
  `id`'yi `/api/admin/universities/:universityId/...` çağrılarında kullan.

---

## 3. Rollere `rank` (yetki derecesi) eklendi

`GET /api/auth/roles`, `GET /api/auth/users/:userId/roles` ve **artık kullanıcı
listesi/detayındaki `roles[]`** de `rank` içeriyor:

```jsonc
// GET /api/admin/universities/:uid/users → data[].roles[]
[{ "id": "18d35ca5-...", "name": "university_admin",
   "description": "Okul Yöneticisi — tenant'ın tamamı",
   "universityId": null, "rank": 60 }]
```

Seed rütbeleri (yüksek = daha yetkili):

| Rol | rank |
|---|--:|
| `super_admin` | 100 |
| `platform_support` | 90 |
| `university_admin` | 60 |
| `academic_affairs` | 45 |
| `student_affairs` | 45 |
| `content_moderator` | 30 |
| `auditor` | 30 |
| `advisor` | 20 |
| `student` | 10 |

**Rol formları:** `POST /api/auth/roles` ve `PATCH /api/auth/roles/:roleId` artık
opsiyonel `rank` (integer, 0–100) kabul ediyor. Verilmezse `0`.
Çekirdek rollerin adı **ve** rütbesi değiştirilemez.

---

## 4. `me/permissions` artık `maxRank` dönüyor

```jsonc
// GET /api/users/me/permissions
{ "success": true, "data": {
    "roles": ["university_admin"],
    "permissions": ["user.view", "user.manage", ..., "role.manage"],
    "status": "active",
    "maxRank": 60            // ⬅ YENİ: rollerindeki en yüksek rank
} }
```

### Aksiyonları önden disable etme

Backend'in uyguladığı kural: **aktör yalnızca kendinden DÜŞÜK rütbeli rolü
yönetebilir ve yalnızca kendinden DÜŞÜK rütbeli kullanıcıya dokunabilir.**
Eşitlik de reddedilir — bu yüzden kimse kendine dokunamaz.

```ts
const myRank = me.maxRank;                       // GET /api/users/me/permissions
const isSuperAdmin = me.roles.includes("super_admin"); // rütbe kurallarından muaf

const rankOf = (user: { roles: { rank: number }[] }) =>
  Math.max(0, ...user.roles.map(r => r.rank));

/** Bu kullanıcının rollerini yönetebilir miyim? */
const canManageUser = (target: User) =>
  isSuperAdmin || (target.id !== me.userId && rankOf(target) < myRank);

/** Bu rolü atayabilir/kaldırabilir miyim? */
const canAssignRole = (role: { rank: number }) =>
  isSuperAdmin || role.rank < myRank;

/** Kendi rolünü SÖKME hiçbir koşulda mümkün değil (super_admin dahil). */
const canRemoveRoleFrom = (target: User) =>
  target.id !== me.userId && canManageUser(target);
```

> Kendine rol **ekleme** serbesttir (rütbe kuralı yükseltmeyi zaten kapatır):
> bir yönetici kendine `student` ekleyebilir, `super_admin` ekleyemez.
> Kendinden rol **sökme** her koşulda yasaktır.

---

## 5. Yeni hata mesajları — **400 dönüyorlar, 403 değil**

⚠️ İş kuralı ihlalleri feature'ların yerleşik kalıbına uyar ve **400** döner.
`403` yalnızca *permission yok* veya *tenant scope ihlali* durumlarında gelir.
Merkezi interceptor'ında 403'ü "oturumu sonlandır / aksiyonu gizle" diye
işliyorsan, bu mesajlar oraya **düşmez** — 400 gövdesindeki `message`'ı göster.

| Status | `message` | Ne zaman |
|:---:|---|---|
| 400 | `Kendi rolünüzü kaldıramazsınız; bu işlemi sizden yetkili bir yönetici yapmalıdır.` | Kendi rolünü sökmeye çalışınca |
| 400 | `'university_admin' rolü sizin yetki seviyenizle aynı ya da daha yüksek; bu rol üzerinde işlem yapamazsınız.` | Eşit/üst rütbeli rolü atama-sökme |
| 400 | `Bu kullanıcı sizinle aynı ya da daha yüksek yetki seviyesinde; üzerinde işlem yapamazsınız.` | Eşit/üst rütbeli kullanıcıya dokunma |
| 400 | `Bu rol yalnızca sistem yöneticisi tarafından atanabilir.` | Platform rolü (super_admin/platform_support) atama |
| 400 | `Yalnızca kendi yetki seviyenizden düşük rütbede bir rol oluşturabilirsiniz.` | `rank >= maxRank` ile rol oluşturma |
| 400 | `Bir rolü kendi yetki seviyenize eşit ya da üstüne çıkaramazsınız.` | Rol rütbesini yükseltme |
| 400 | `Kendinizde bulunmayan bir yetkiyi bir role atayamazsınız.` | Sahip olmadığın permission'ı role bağlama |
| 400 | `Bu yetki platform seviyesidir; tenant rollerine atanamaz.` | `role.manage` vb. tenant rolüne bağlama |
| 400 | `Sistemdeki son sistem yöneticisi görevden alınamaz.` | Son `super_admin`'i düşürme |
| 400 | `Bu üniversitenin son yöneticisi görevden alınamaz.` | Bir tenant'ın son `university_admin`'ini düşürme |
| 400 | `Sistem rolünün yetki seviyesi değiştirilemez.` | Çekirdek rolün `rank`'ini değiştirme |
| 400 | `Bu işlem bir üniversiteye bağlı hesap gerektirir.` | Platform hesabı öğrenci akışına girince |
| **403** | `Bu işlem için yetkiniz bulunmamaktadır.` | Permission yok |
| **403** | `Bu üniversiteye ait kaynaklara erişim yetkiniz bulunmamaktadır.` | Tenant scope ihlali |
| **403** | `Hesabınız askıya alınmıştır...` | Askıya alınmış hesap |

Mesajların hepsi Türkçe ve **doğrudan kullanıcıya gösterilebilir**.

---

## 6. Test hesapları değişti

Platform hesapları artık tenant'sız olduğu için e-postaları da bir okul
domain'ine ait değil. Şifre yine `Password123!`.

| Eski | Yeni | Rol |
|---|---|---|
| `superadmin@antalya.edu.tr` | **`superadmin@platform.local`** | `super_admin` (universityId: `null`) |
| `destek@antalya.edu.tr` | **`destek@platform.local`** | `platform_support` (universityId: `null`) |
| — | **`superadmin2@platform.local`** | 2. `super_admin` ("son admin" testi için) |
| — | **`ahmet.yonetici@antalya.edu.tr`** | 2. `university_admin` (eşit-rütbe testi için) |

Değişmeyenler: `elif.demir@antalya.edu.tr` (university_admin),
`okan.yildiz@egebilim.edu.tr` (Ege university_admin — tek admin, düşürülemez),
`sks@antalya.edu.tr`, `moderator@antalya.edu.tr`, `denetci@antalya.edu.tr`,
öğrenciler ve danışmanlar.

---

## 7. Örnek: kullanıcı satırındaki aksiyonlar

```tsx
function UserRowActions({ target }: { target: AdminUser }) {
  const me = useEffectivePermissions();            // GET /api/users/me/permissions
  const isSelf = target.id === me.userId;
  const targetRank = Math.max(0, ...target.roles.map(r => r.rank));
  const isSuperAdmin = me.roles.includes("super_admin");

  const outranks = isSuperAdmin || targetRank < me.maxRank;

  return (
    <>
      <Button
        disabled={!me.permissions.includes("role.manage") || isSelf || !outranks}
        title={
          isSelf ? "Kendi rollerinizi kaldıramazsınız"
          : !outranks ? "Bu kullanıcı sizinle aynı ya da daha yüksek yetki seviyesinde"
          : undefined
        }
      >
        Rolleri düzenle
      </Button>

      <Button
        disabled={!me.permissions.includes("user.manage") || isSelf}
        title={isSelf ? "Kendi hesabınızı askıya alamazsınız" : undefined}
      >
        Askıya al
      </Button>
    </>
  );
}
```

> UI guard'ı **kolaylıktır, güvenlik değildir** — backend her koşulda kendi
> kontrolünü yapar. Yine de disable etmek, kullanıcının 400 hatasına çarpmasını
> önler.

---

## 8. Henüz olmayan (isterseniz açılır)

- **Runtime'da platform hesabı oluşturma.** Bugün `superadmin@platform.local` gibi
  hesaplar yalnızca seed ile kuruluyor. `super_admin` için bir
  `POST /api/admin/platform-users` endpoint'i eklenebilir — call center / sistem
  moderatörü gibi rolleri panelden açmak istiyorsanız gerekli.
- **Bölge (region) katmanı.** "Bir bölge sorumlusu birden çok üniversiteyi görsün"
  senaryosu bilinçli olarak ertelendi. Geldiğinde `GET /api/admin/universities`
  **kendiliğinden** birden çok üniversite dönmeye başlar — bu yüzden paneli
  şimdiden "N üniversite dönebilir" varsayımıyla yazın (§2).
