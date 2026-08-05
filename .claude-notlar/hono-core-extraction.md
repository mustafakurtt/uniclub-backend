---
name: hono-core-extraction
description: "src/core → bağımsız hono-core paketi + bun-hono-starter template'i — 2026-07-19'da İKİSİ DE TAMAMLANDI, yeni projeye hazır"
metadata:
  node_type: memory
  type: project
  originSessionId: 824467d4-623f-43a8-aae5-2e49cede5617
  modified: 2026-07-19T21:21:33.547Z
---

uniclub-backend'in mimarisini yeni projelerde yeniden kullanma çabası.
**2026-07-19: TAMAMLANDI** — iki repo da yayında, CI yeşil.

## Sonuç: iki repo

**1. https://github.com/mustafakurtt/hono-core** — **PUBLIC**, `v0.1.0`
Yerel: `Desktop/projects/hono-core`. Taşınabilir çekirdek (14 modül: auth, rbac,
http, i18n, cache, ratelimit, db, storage, logger, config, redis, mail, metrics,
notifications). Kaynak dağıtımı, build adımı YOK. Kök barrel YOK — modül başına
exports map (`/rbac`, `/http`…). 112 test CI'da yeşil (90 altyapısız + 22 Postgres).

**2. https://github.com/mustafakurtt/bun-hono-starter** — **PRIVATE + TEMPLATE**, `v0.1.0`
Yerel: `Desktop/projects/bun-hono-starter`. GitHub "Use this template" düğmesi
aktif. 46 entegrasyon testi + boot smoke CI'da yeşil.

## Kritik karar: hono-core PUBLIC olmak ZORUNDA kaldı

Bun private repo'dan git bağımlılığı kuramıyor: `github:` ve `git+https:` şemalarının
İKİSİ de GitHub API tarball endpoint'ine gidiyor ve private repo'da 404 veriyor.
`GITHUB_TOKEN`/`BUN_CONFIG_TOKEN` env'leri Bun tarafından KULLANILMIYOR (token API'de
elle 200 veriyor, git ls-remote de çalışıyor — sadece Bun okumuyor). Kullanıcının
SSH anahtarı da yoktu. Seçenekler sunuldu, kullanıcı **public yapmayı** seçti
(hono-core jenerik altyapı, sır/iş mantığı yok). starter private kaldı.
→ Gelecekte private paket gerekirse tek yol: SSH anahtarı + `git+ssh://`.

## Starter'ın içeriği ve tasarım kararları

- **Tenancy AÇIK gelir, runtime flag YOK.** Silme checklist'i `TENANCY.md`'de.
  Gerekçe: template düzenlenecek bir başlangıç noktasıdır, yapılandırılacak bir
  kütüphane değil — flag o karmaşıklığı projenin ömrü boyunca taşıtır.
  `universityId` → `tenantId` global rename yapıldı.
- **`features/organizations/` = REFERANS feature** (university'nin nötr hali).
  Guard'lı rotalar + tenant kapsamı + BaseRepository extend + soft-delete
  incelikleri + cache invalidasyonu + i18n + alt kaynak (üyelik).
- Diğer feature'lar: `auth` (kayıt/giriş/doğrulama, BullMQ kuyruklu mail),
  `users` (self-service), `audit` (guard sink'i).
- **db/**: sadece platform tabloları (tenants, tenantDomains, users,
  emailVerifications, roles/permissions/rolePermissions/userRoles/userPermissions,
  notifications, auditLogs) + organizations/organizationMembers. Seed deterministik:
  2 tenant, 5 rol, 9 kullanıcı (pending/suspended/pwtest/çapraz-tenant senaryoları).
- **SİLİNENLER** (ölü kod bırakmamak için): `club.middleware`, `shared/ws/`,
  `redis.subscriber`. `storage.client` KALDI (tesisat hazır, kullanan feature yok).
- **KAPSAM DIŞI** (CLAUDE.md'de listeli): WebSocket/WebPush, dosya yükleme
  feature'ı, çalışma-anı rol yönetimi uçları, prod deploy dosyaları.
- Dokümanlar: `CLAUDE.md` (mimari + "yeni feature ekleme reçetesi"), `TENANCY.md`,
  `README.md`.

## Çıkarım sırasında bulunan/düzeltilen 3 gerçek hata

1. **core `LogLevel`'de `Silent` yoktu** → eklendi. Bu, gizli bir tip hatasını
   ortaya çıkardı: `request-logger` seviyeyi YAZMAK için kullanıyor ama
   `logger.silent()` diye pino metodu yok → çalışma anında patlardı. Çözüm:
   `EmittableLogLevel = Exclude<LogLevel, "silent">` (eşik/emisyon ayrımı).
2. **Test izolasyon hatası (starter)**: `users.test.ts` paylaşılan hesabın şifresini
   kalıcı değiştiriyordu → `organizations.test.ts` login'i CI'da patladı. Yıkıcı
   testlere ayrı seed hesabı (`pwtest@acme.test`) verildi.
3. **active-user/verified-user middleware'leri** uniclub'da gömülü Türkçe metinle
   zarfı elle kuruyor ve hata yakalayıcıyı baypas ediyordu → starter'da `HttpError`
   fırlatıyorlar, tek hata çıkışından geçip isteğin diline çevriliyorlar.

## Notlar

- **uniclub-backend'e HİÇ DOKUNULMADI** (kullanıcı kararı) — dondurulmuş durumda,
  hâlâ kendi `src/core/` kopyasını taşıyor. İki kopya artık ayrışmaya başlar.
- **v0.x, API dondurulmadı, npm'e publish YOK.** Core tek projeye karşı doğrulandı;
  gerçek genellik testi bir sonraki projedir.
- Yerelde **Docker Desktop kapalıydı** → hem hono-core'un DB testleri hem
  starter'ın tamamı yalnızca CI'da koştu. Yerel çalıştırma hiç denenmedi.
- Sıradaki adım: kullanıcı yeni projeye geçecek ("Use this template" → README).

İlgili: [[project-status-shelved]] (uniclub rafta).
