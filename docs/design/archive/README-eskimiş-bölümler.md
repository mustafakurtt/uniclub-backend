# Arşiv — README.md eski §2 / §3 / §5 / §7 (4-rollük model)

Bu dosya, `docs/design/README.md`'nin Temmuz 2026 öncesi §2, §3, §5 ve §7
bölümlerinin tarihsel kaydıdır. **Güncel model için ana README'ye bakın**;
otoritatif kaynaklar: [06-rol-mimarisi-yeniden-tasarim.md](../06-rol-mimarisi-yeniden-tasarim.md),
[07-rutbe-ve-kapsam.md](../07-rutbe-ve-kapsam.md).

Arşivlenme nedeni: kurumsal 9 rollük modele geçiş, `admin` → `university_admin`
yeniden adlandırması, `users.universityId` nullable platform hesapları, rütbe
(`roles.rank`) kuralları ve `/api/moderation` ban/unban yüzeyi.

---

## §2 (eski) — Rol hiyerarşisi ve kaynağı

Roller `roles` tablosunda tutulur ve **kapalı bir liste değildir** —
`role.manage` yetkisine sahip biri runtime'da yeni rol ekleyebilir. Seed ile
gelen 4 başlangıç rolü:

| Rol | `roles.universityId` | Nasıl atanır | Tenant kapsamı |
|---|---|---|---|
| `student` | `NULL` (global) | Kayıt anında `student` domainli e-posta ile **otomatik** | — |
| `advisor` | `NULL` (global) | Kayıt anında `staff` domainli e-posta ile **otomatik** | — |
| `admin` | `NULL` (global) | `POST promote-admin` ile **manuel** | Kendi üniversitesi (tenant scope) |
| `super_admin` | `NULL` (global) | `POST promote-super-admin` ile **manuel** | **Sınırsız** (tenant scope bypass) |

---

## §3 (eski) — Seed rol → yetki matrisi (4 rol)

| Yetki anahtarı | `student` | `advisor` | `admin` | `super_admin` |
|---|:---:|:---:|:---:|:---:|
| `user.manage` | — | — | ✅ | ✅ |
| `club.approve` | — | — | ✅ | ✅ |
| `club.update` | — | — | ✅ | ✅ |
| `club.advisor.manage` | — | — | ✅ | ✅ |
| `club.delete` | — | — | ✅ | ✅ |
| `university.create` | — | — | — | ✅ |
| `university.update` | — | — | — | ✅ |
| `university.delete` | — | — | — | ✅ |
| `university.domain.create` | — | — | — | ✅ |
| `university.domain.update` | — | — | — | ✅ |
| `university.domain.delete` | — | — | — | ✅ |
| `university.faculty.create` | — | — | — | ✅ |
| `university.faculty.update` | — | — | — | ✅ |
| `university.faculty.delete` | — | — | — | ✅ |
| `university.department.create` | — | — | — | ✅ |
| `university.department.update` | — | — | — | ✅ |
| `university.department.delete` | — | — | — | ✅ |
| `role.manage` | — | — | — | ✅ |
| `permission.manage` | — | — | — | ✅ |

---

## §5 (eski) — Tenant scope

- Her kullanıcı bir `universityId`'ye bağlıdır (`users.universityId`, denormalize).
- **Admin rotaları** (`/api/admin/universities/:universityId/...`) `enforceTenantScope`
  ile korunur: path'teki `:universityId` ≠ çağıranın kendi üniversitesi ise `403`.
  **`super_admin` bu kontrolü bypass eder**.
- **Auth/RBAC rotaları** tenant-scoped değildir — yalnızca `role.manage`/`permission.manage`
  arar (seed'de yalnızca `super_admin`).

---

## §7 (eski) — Mevcut vs Eksik özeti

| İşlev | Durum | Endpoint / Not |
|---|:---:|---|
| Kullanıcı durumu değiştir | ✅ | `PATCH .../users/:userId/status` |
| Askıya alma → anlık erişim kesme (JWT) | ❌ (#7) | Hâlâ eksik — token süresi dolana dek erişim sürer |

(Bu tablonun tamamı ana README §7'de güncellenmiştir.)
