# ADR 0007 — Tenant'ın e-posta domain'inden çıkarılması

**Durum:** Kabul edildi  
**Tarih:** 2026 (kayıt akışı tasarımı)

## Bağlam

Kayıt sırasında kullanıcı hangi üniversiteye ait? Seçenekler: (a) kullanıcı
üniversite seçer, (b) sistem e-posta domain'inden çıkarır, (c) davet kodu.
Yanlış tenant ataması veri sızıntısına ve destek yüküne yol açar.

## Karar

1. Kayıt **`POST /api/auth/register`** — body'de `universityId` **yok**.
2. `user@<domain>` adresindeki `<domain>`, `university_domains` tablosunda aranır.
3. Eşleşme yoksa kayıt **reddedilir** (`auth.emailDomainNotRegistered`).
4. Eşleşen satırın `domainType` alanı rolü belirler: `staff` → `advisor`,
   `student` → `student` (`auth.service.ts` `register`).
5. `users.universityId` kayıt anında denormalize yazılır.
6. Domainler onboarding sırasında operatör tarafından tanımlanır (`POST /api/universities`
   veya `.../domains`).

Platform hesapları (`universityId: NULL`) bu akışla **oluşturulamaz** — yalnızca
`db:bootstrap` / seed / ileride ayrı platform endpoint'i (`07 §D` ertelenmiş).

## Gerekçe

- Üniversite e-postası tenant kanıtı sayılır — kampüs IT'sinin kontrol ettiği
  domainler (`student` / `staff` ayrımı) kayıt anında rol de verir.
- Kullanıcı yanlış üniversite seçemez (UI hatası / kötü niyet).
- Kayıt formu basit kalır; public `GET /api/universities` yalnızca fakülte/bölüm
  seçimi için (tenant zaten e-postadan belli).

## Elenen alternatifler

| Alternatif | Neden elendi |
|---|---|
| **Kayıt formunda üniversite dropdown + e-posta doğrulama** | Kullanıcı başka okul seçip kendi mailini yazabilir; ek doğrulama gerekir. |
| **Davet kodu / tenant slug ile kayıt** | B2B onboarding için uygun ama öğrenci self-servis için sürtünme; ileride eklenebilir. |
| **E-posta + manuel admin onayı tenant ataması** | Operasyonel yük; `pending` status kısmen var ama tenant yine domain'den gelmeli. |
| **Alt domain wildcard (`*.edu.tr`)** | Tablo satır başına tam domain (`std.antalya.edu.tr`) — wildcard eşleme karmaşıklığı ve güvenlik riski. |

## Sonuçlar

**İyi:**
- Tenant izolasyonu kayıt anında doğru.
- `domainType` otomatik rol atar; SKS manuel rol vermeden danışman/öğrenci ayrımı.
- `university_domains.domain` lowercase CHECK + zod normalizasyonu tutarlı eşleşme.

**Kötü:**
- Her üniversite için domain onboarding zorunlu — runbook gerekir (`ONBOARDING_TENANT.md`).
- Öğrenci kişisel e-posta (`gmail.com`) ile kayıt olamaz (kasıtlı).
- Domain değişikliği (üniversite IT migrasyonu) operasyonel müdahale gerektirir.
- Çoklu üniversite aynı domain'i paylaşırsa model desteklemez (1 domain → 1 tenant).

## Ne zaman yeniden değerlendirilir

- Kurumsal SSO (üniversite IdP) ile kayıt gelirse domain tablosu yanında claim
  eşlemesi gerekebilir.
- `POST /admin/platform-users` gibi platform hesabı API'si eklendiğinde (07 §D).
- Aynı domain altında alt-tenant (kampüs) ihtiyacı doğarsa.
