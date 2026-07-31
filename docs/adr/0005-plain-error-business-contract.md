# ADR 0005 — İş kuralı hataları: `HttpError` + i18n `MessageKey`

**Durum:** Kabul edildi  
**Tarih:** 2026 (hata zarfı birleştirmesi)

## Bağlam

API hem iş kuralı reddini (kullanıcı bulunamadı, son admin silinemez) hem altyapı
hatasını (PostgreSQL, Redis, beklenmeyen `TypeError`) aynı middleware zincirinden
geçirir. İstemciye SQL/stack sızmamalı; iş kuralı mesajları Türkçe ve gösterilebilir
olmalı. Frontend tek tip hata zarfı bekler (`docs/reference/error-and-audit.md`).

## Karar

- Servis katmanı iş kuralı ihlalinde **`HttpError`** fırlatır — `throw notFound("user.notFound")`,
  `throw badRequest("domain.alreadyRegistered", { params })` (`shared/utils/errors.ts`).
  Argüman bir **`MessageKey`**; Türkçe/İngilizce metin `Accept-Language` ile çözülür.
- `error.middleware.ts` (`core/http/error-handler` fabrikası): `HttpError` → kendi `status`'u;
  `DatabaseError`, `DrizzleQueryError`, `TypeError` → jenerik `500` + `requestId`.
- Ham `ZodError` istemciye **dönmez** — `VALIDATION_ERROR` + `details[]`.

## Gerekçe

- Özel exception sınıfı hiyerarşisi gereksiz ceremony; `HttpError` status + key taşır.

## Elenen alternatifler

| Alternatif | Neden elendi |
|---|---|
| **Her iş kuralı için `BusinessError` sınıfı** | Dosya ve import şişmesi; mesaj zaten Türkçe string. |
| **`instanceof HttpError` her yerde** | Servislerin HTTP katmanını bilmesi — katman ihlali. |
| **Result/Either tipi (`ok`/`err`)** | Mevcut Hono route stili `async` + throw ile uyumlu; tüm codebase refactor. |
| **Hata kodu zorunlu her iş kuralında** | İsteğe bağlı `code` yalnızca makine-okur senaryolarda (`VALIDATION_ERROR`, `EMAIL_NOT_VERIFIED`). |

## Sonuçlar

**İyi:**
- Tutarlı JSON zarfı; `requestId` ile log korelasyonu.
- i18n: `HttpError` anahtarları `Accept-Language` ile çevrilir.
- Güvenlik: 500'de stack/SQL sızmaz.

**Kötü:**
- `throw new Error("...")` ile `HttpError` karışık kullanım — yeni kodda yalnızca `HttpError` fabrikaları.

## Ne zaman yeniden değerlendirilir

- Çok sayıda yapılandırılmış iş hatası (`code` + `details`) servis katmanından
  gelmeye başlarsa ortak `AppError` tipi düşünülebilir.
- OpenAPI/typed client üretimi zorunlu hale gelirse.
