# ADR 0004 — 9 rollük RBAC + `roles.rank` rütbe hiyerarşisi

**Durum:** Kabul edildi (Temmuz 2026)  
**Tarih:** 2026-07

## Bağlam

İlk model dört düz rol (`student`, `advisor`, `admin`, `super_admin`) ile
yönetim paneli ihtiyaçlarını karşılamıyordu: salt-okunur denetçi yoktu, GET
route'ları yazma yetkisi arkasındaydı, tenant yöneticisi kendi akademik yapısını
yönetemiyordu. Ayrıca `university_admin` kendi rolünü söküp tenant'ı yönetimsiz
bırakabiliyordu — rütbe kavramı yoktu.

## Karar

1. **Dokuz kurumsal rol** (`super_admin`, `platform_support`, `university_admin`,
   `student_affairs`, `academic_affairs`, `content_moderator`, `auditor`,
   `advisor`, `student`) — yetki demetleri `ROLE_BUNDLES` (`db/rbac-catalog.ts`).
2. **`admin` → `university_admin`** yeniden adlandırması (kod sabitleri güncellendi).
3. **Salt-okunur `*.view` yetkileri** — denetçi/destek rolleri mümkün.
4. **`roles.rank` (integer)** — yüksek = daha yetkili; `auth.service.ts`
   `assertActorOutranksRole` / `assertNotLastAdminOfScope` kuralları.
5. **Tenant-scoped rol yönetimi** — `university_admin` kendi tenant rolünü yönetir;
   platform rolleri ve platform yetkileri atanamaz.

Ayrıntılı senaryolar: `docs/design/06-rol-mimarisi-yeniden-tasarim.md`,
`docs/design/07-rutbe-ve-kapsam.md`.

## Gerekçe

- Gerçek üniversite org yapısı (SKS, öğrenci işleri, içerik moderasyonu, denetim)
  tek "admin" rolüne sığmıyor.
- `resource.view` / `resource.manage` ayrımı panelde yanlış yetki göstermeyi önler.
- Rütbe, self-demotion ve escalation (düşük rütbeli özel rol + güçlü yetki) deliklerini
  kapatır — `provisionRbacCatalog` rank backfill (`rbac-catalog.ts` `ROLE_DEFS`).

## Elenen alternatifler

| Alternatif | Neden elendi |
|---|---|
| **4 rolde kalıp yetki sayısını artırmak** | Rol adı UI/operasyonel anlam taşır; her kullanıcıya onlarca doğrudan yetki atamak ölçeklenmez. |
| **Yalnızca `userPermissions` override, rol çeşitliliği yok** | Denetim ve destek için tekrarlanan override yönetimi; audit zorlaşır. |
| **ABAC / attribute-based (fakülte kapsamı şimdi)** | Fakülte-scope bilinçli ertelendi (`06 §B3`); önce tenant seviyesi oturtuldu. |
| **Rütbe yerine yalnızca "platform rolü mü?" bayrağı** | Eşit tenant adminlerinin birbirini sökmesi ve son-admin sorunu çözülmez. |

## Sonuçlar

**İyi:**
- `auditor`, `platform_support` gibi salt-okunur yüzeyler mümkün.
- Tenant moderasyonu (`announcement.moderate`, `club.member.manage`) ayrı rolle.
- Frontend `GET /api/users/me/permissions` ile permission-bazlı UI guard.

**Kötü:**
- Rol adı sabit referansları (`promote-admin`, `CORE_ROLE_NAMES`) migration riski.
- `rank` backfill edilmezse tüm rütbe kuralları kilitlenir (`07` uyarısı).
- Dokümantasyon ve seed senkron tutulmalı (`ROLE_BUNDLES` ↔ route guard'ları).

## Ne zaman yeniden değerlendirilir

- Fakülte/bölge (region) kapsamı RBAC'a eklenecekse (`07 §D`, `06 §B3`).
- Rol sayısı operasyonel olarak fazla bulunursa (birleştirme ADR'si gerekir).
- Harici IdP (SAML/OIDC) rol eşlemesi gelirse.
