# ADR 0005 — İş kuralı hataları için düz `Error` sözleşmesi

**Durum:** Kabul edildi  
**Tarih:** 2026 (hata zarfı birleştirmesi)

## Bağlam

API hem iş kuralı reddini (kullanıcı bulunamadı, son admin silinemez) hem altyapı
hatasını (PostgreSQL, Redis, beklenmeyen `TypeError`) aynı middleware zincirinden
geçirir. İstemciye SQL/stack sızmamalı; iş kuralı mesajları Türkçe ve gösterilebilir
olmalı. Frontend tek tip hata zarfı bekler (`docs/DENETIM_VE_HATA.md`).

## Karar

- Servis katmanı iş kuralı ihlalinde **`throw new Error("Türkçe mesaj")`** veya
  `throw badRequest(...)` / `throw notFound(...)` (`shared/utils/errors.ts` →
  yine düz `Error` türevi değil, `HttpError` ile i18n anahtarı).
- `errorHandler` ve `respondWithBusinessError`: **`err.constructor === Error`**
  ise iş hatası → `400/404` + mesaj; alt sınıflar (`DatabaseError`,
  `DrizzleQueryError`, `TypeError`) → jenerik `500` + `requestId`.
- Ham `ZodError` istemciye **dönmez** — `VALIDATION_ERROR` + `details[]`.

## Gerekçe

- Özel exception sınıfı hiyerarşisi (onlarca `BusinessError` alt tipi) bu proje
  boyutu için gereksiz ceremony.
- `constructor === Error` kontrolü, yanlışlıkla `extends Error` edilmemiş altyapı
  hatalarının sızmasını engeller (pg/drizzle kendi sınıflarını kullanır).
- Route'larda `respondWithBusinessError(c, err)` tek satır; beklenmeyen hata
  `app.onError`'a bubble edilir.

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
- `throw new Error` ile `throw badRequest` karışık kullanım (ikisi de geçerli).
- Yanlışlıkla `class CustomError extends Error` yazılırsa iş kuralı 500 olur —
  code review disiplini gerekir.
- Gerekçe kayıtlı değil: erken dönemde bazı route'larda try/catch + manuel JSON
  vardı; tamamen temizlendi mi route başına bakılmalı.

## Ne zaman yeniden değerlendirilir

- Çok sayıda yapılandırılmış iş hatası (`code` + `details`) servis katmanından
  gelmeye başlarsa ortak `AppError` tipi düşünülebilir.
- OpenAPI/typed client üretimi zorunlu hale gelirse.
