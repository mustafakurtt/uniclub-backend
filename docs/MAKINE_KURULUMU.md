# Makine Kurulumu ve Devir Teslim

İki bilgisayarlı düzenin nasıl kurulduğu, masaüstünde ne yapman gerektiği ve
frontend tarafına notlar.

> Sistem tasarımı için [architecture.md](architecture.md), işletim kuralları
> (yedek, migration, olay müdahalesi) için [operations.md](operations.md).

## Genel resim

```
  MASAÜSTÜ (geliştirme)          GITHUB              LAPTOP (production)
    bun run dev :3000   ──push──▶  CI yeşil            deploy-agent.sh
                                   release kes ◀─poll─  (dışarı doğru okuma)
                                                              │
                                                     Caddy :443 (yerel CA)
                                                              │
                                                     https://uniclub.test
```

Masaüstü production'a **hiç dokunmaz**. GitHub'a push eder; laptop GitHub'dan
çeker. İki makinenin birbirine erişmesi gerekmez — bu yüzden laptop ev
router'ının arkasında, hiçbir port açık olmadan durabilir.

Prod'a bir şey çıkarmanın **tek yolu release kesmektir**. `develop`'a push
production'ı etkilemez.

---

## Şu ana kadar kurulanlar

| Ne | Nerede |
| --- | --- |
| Yedek + geri yükleme tatbikatı | `scripts/db-backup.sh`, `scripts/db-restore.sh` |
| CI (typecheck + gerçek Postgres/Redis ile entegrasyon) | `.github/workflows/ci.yml` |
| İmaj derleme + duman testi | `.github/workflows/deploy.yml` |
| Production stack (izole) | `docker-compose.prod.yml`, `.env.prod` |
| Migration imajı (prod imajında drizzle-kit yok) | `Dockerfile` → `migrator` stage |
| Pull-based deploy | `scripts/deploy-agent.sh` → `scripts/deploy-local.sh` |
| Reverse proxy + yerel TLS | `docker-compose.proxy.yml`, `deploy/Caddyfile` |
| hosts + kök sertifika kurulumu | `scripts/setup-local-dns.ps1` |

Yol boyunca bulunan ve düzeltilen gerçek hatalar: seed süreci hiç kapanmıyordu,
seed idempotent değildi, idempotent yapınca yıkıcı hale geldi, `/health`
bağımlılıklarını yoklamıyordu, restore scripti canlıyı ezerken "hiçbir şey
değişmedi" diyordu, dev servisleri `0.0.0.0`'a bind ediliyordu.

---

## MASAÜSTÜ — geliştirme makinesi kurulumu

Masaüstü **yalnızca geliştirme** yapar. Production'a ait hiçbir şey oraya gitmez.

### Gerekenler

- [Bun](https://bun.sh) `>= 1.1`
- Docker Desktop
- Git

### Adımlar

```sh
git clone https://github.com/mustafakurtt/uniclub-backend.git
cd uniclub-backend
git switch develop

bun install
cp .env.example .env
```

`.env` içindeki `JWT_SECRET`'ı doldur — laptop'takinden **farklı** olsun:

```sh
openssl rand -base64 48
```

Sonra altyapıyı kaldır, şemayı kur, örnek veriyi bas:

```sh
docker compose up -d          # Postgres 5432, Redis 6379, Mailpit 8025
bun run db:migrate
bun run db:seed              # 3 üniversite, 38 kullanıcı, 13 kulüp
bun run dev                  # http://localhost:3000
```

Doğrulama:

```sh
curl http://localhost:3000/health
# {"status":"ok","environment":"development","checks":{"database":"up","cache":"up"}}
```

Doğrulama mailleri http://localhost:8025 adresindeki Mailpit kutusuna düşer.
Tüm seed hesaplarının şifresi: `Password123!`

### Masaüstünde YAPMA

- **`.env.prod`'u kopyalama.** Production secret'ları o makineye ait.
- **`deploy-agent.sh` çalıştırma, scheduled task kurma.** Deploy laptop'un işi.
- **`docker-compose.prod.yml` ayağa kaldırma.** Prod tek yerde yaşar.

### Portlar neden `127.0.0.1`?

`docker-compose.yml` Postgres/Redis/Mailpit'i yalnızca kendi makinene açar.
`"5432:5432"` yazmak onları `0.0.0.0`'a bağlar — paylaşımlı bir ağda
veritabanın ağdaki herkese açık demektir. Bilinçli olarak değiştirmek istersen
`DEV_BIND_ADDR` var, ama ihtiyacın olmayacak.

---

## Eve gidince — laptop'u ağa açmak

Laptop şu an **yalnızca kendine** servis veriyor (`BIND_ADDR=127.0.0.1`), çünkü
okul ağındaydık. Evde masaüstünün de erişmesi için:

### 1. Router'da laptop'a sabit IP ver

IP'si DHCP'den geliyor. Router yeniden başlarsa değişir ve tüm `hosts`
kayıtların çöker. Router arayüzünde laptop'un MAC adresine **DHCP rezervasyonu**
yap. (Şu anki IP: `10.100.65.195` — evde farklı olacak.)

### 2. Laptop'ta `BIND_ADDR`'ı değiştir

`.env.prod` **ve** `~/uniclub-prod/.env.prod` dosyalarının ikisinde de:

```sh
BIND_ADDR=192.168.1.42        # router'da rezerve ettiğin IP
```

Sonra yeniden başlat:

```sh
IMAGE_TAG=$(docker inspect uniclub_prod_app -f '{{.Config.Image}}' | sed 's/.*://') \
  docker compose -p uniclub-prod -f docker-compose.prod.yml --profile localmail --env-file .env.prod up -d
bun run proxy:up
```

Windows Güvenlik Duvarı 443 için izin isteyebilir — **yalnızca özel ağ** (private
network) için ver, genel ağ için asla.

### 3. Masaüstünde isim çözümleme + sertifika

Laptop'tan kök sertifikayı al (USB, ağ paylaşımı, e-posta — fark etmez):

```powershell
# laptop'ta
docker cp uniclub_proxy:/data/caddy/pki/authorities/local/root.crt .\caddy-local-root.crt
```

Masaüstünde **yönetici PowerShell**'de:

```powershell
.\scripts\setup-local-dns.ps1 -IPAddress 192.168.1.42 -CertPath .\caddy-local-root.crt
```

Artık masaüstünden `https://uniclub.test` production'ı gösterir.

> `test.uniclub.test` laptop'un dev sunucusuna gider. Masaüstünde kendi dev
> sunucun `http://localhost:3000`'de. İkisini karıştırma.

### 4. Router'da port yönlendirme AÇMA

Yapının internete çıkmamasının tek sebebi bu. Açarsan, yerel CA ile imzalanmış
sertifikalar ve seed şifreleri internete bakar hale gelir.

---

## Günlük geliştirme akışı

```sh
git switch develop && git pull
# ... kod yaz ...
bun run typecheck            # push'tan önce, her zaman
git add -A && git commit -m "feat(clubs): kulüp aramasına filtre ekle"
git push
```

Yayınlamaya hazır olunca:

```sh
gh pr create --base main --head develop --title "release: v1.3.0"
gh pr merge --squash        # veya release PR'ları için --merge
git switch main && git pull
git tag -a v1.3.0 -m "v1.3.0" && git push origin v1.3.0
gh release create v1.3.0 --generate-notes
```

Laptop uyanıksa 5 dakika içinde `v1.3.0`'ı kendi kendine deploy eder. Uykudaysa
uyanınca yapar.

`main`'e doğrudan push **edemezsin** — koruma reddeder. Kurallar:
`Typecheck` + `Integration` yeşil olmadan merge yok.

---

## Push'tan production'a: ne oluyor, nereden izlenir

Masaüstünden bir değişiklik gönderdiğinde zincir şöyle işler. Her aşamanın
kendi gözlem noktası var.

### 1. `develop`'a push

```sh
git push                     # masaüstü
```

GitHub'da **CI** workflow'u tetiklenir: `Typecheck` ve `Integration`
(gerçek Postgres + Redis ile migration → seed → uygulama açılışı → `/health`).
Ayrıca **Release check** imajı derleyip duman testinden geçirir.

```sh
gh run list --branch develop --limit 3
gh run watch                          # canlı izle
gh run view --log-failed              # kırmızıysa yalnızca hatalı adım
```

**Production'a hiçbir şey olmaz.** `develop` prod'u tetiklemez.

### 2. `main`'e PR

```sh
gh pr create --base main --head develop --title "release: v1.3.0"
```

`main` korumalı: `Typecheck` + `Integration` yeşil olmadan merge düğmesi açılmaz.
Force-push kapalı, admin bile atlayamaz.

```sh
gh pr checks                          # PR'ın kontrol tablosu
```

Merge edildiğinde `main` üzerinde CI bir kez daha koşar. **Prod hâlâ eski
sürümde** — çünkü ajan commit'leri değil, **release'leri** izler.

### 3. Release kesmek — deploy'un insan kapısı

```sh
git switch main && git pull
git tag -a v1.3.0 -m "v1.3.0" && git push origin v1.3.0
gh release create v1.3.0 --generate-notes
```

Bu, prod'a çıkışın **tek tetikleyicisidir**. Buraya kadar hiçbir otomasyon
production'a dokunmadı.

### 4. Ajan devralır (laptop, 5 dakikada bir)

Zamanlanmış görev `~/uniclub-prod/run-agent.sh` çalıştırır. Ajan sırayla:

1. En son release'i sorar (`gh api .../releases/latest`)
2. Şu an çalışan imaj etiketiyle karşılaştırır (`docker inspect`)
3. Farklıysa **o commit'in CI'ı yeşil mi** diye bakar — değilse deploy etmez
4. Deploy klonunu (`~/uniclub-prod`) o commit'e alır
5. `deploy-local.sh`'a devreder

`deploy-local.sh` ise: **veritabanı yedeği** → imajı release tag'iyle derle →
migration'ları ayrı container'da uygula → uygulamayı yeniden başlat →
`/health` yeşil yanana kadar bekle → yanmazsa **önceki imaja geri dön**.

```sh
bun run deploy:logs                   # ajanın canlı akışı
bun run deploy:agent                  # elle tetikle, beklemeden gör
```

Ajan idempotenttir: güncel sürüm zaten çalışıyorsa `Güncel: v1.3.0 zaten
çalışıyor.` yazıp çıkar.

### 5. Çalışan sistemi izlemek

```sh
bun run prod:ps                       # container'lar ve sağlık durumları
bun run prod:logs                     # uygulama logları (pino JSON)
docker logs -f uniclub_proxy          # Caddy erişim logları
docker inspect uniclub_prod_app -f '{{.Config.Image}}'   # hangi sürüm çalışıyor
```

Uygulama logu her istek için bir JSON satırı yazar:

```json
{"level":30,"module":"http","requestId":"2b27de2f-...","method":"GET","path":"/health","status":200,"durationMs":1}
```

`requestId`, Caddy'nin erişim logundaki `X-Request-Id` ile **aynıdır**. Bir
kullanıcı hata bildirdiğinde, yanıtındaki id ile hem proxy hem uygulama logunda
o isteği bulabilirsin. `level` 50 = hata, 40 = uyarı.

### Görev çalışıyor mu?

```powershell
Get-ScheduledTaskInfo -TaskName "uniclub-deploy-agent"
Start-ScheduledTask   -TaskName "uniclub-deploy-agent"   # elle tetikle
```

`LastTaskResult` `0` ise script başarıyla bitti. Ajanın kendi kararı (deploy
etti / etmedi) log dosyasındadır — görev sonucu değildir.

### Deploy başarısız olursa

`deploy-local.sh` sağlık kontrolü geçmezse otomatik olarak önceki imaja döner ve
`exit 1` verir. Logda görürsün:

```
✗ Sağlık kontrolü BAŞARISIZ. Son loglar:
▶ v1.2.0 imajına geri dönülüyor
  ⚠ Geri dönüldü. NOT: migration'lar geri ALINMAZ.
```

**Migration'lar geri alınmaz.** Kötü sürüm yıkıcı bir migration içeriyorsa
yedekten dönmen gerekir — deploy öncesi yedek `~/uniclub-prod/backups/` altında.
Bu yüzden yıkıcı şema değişiklikleri, o kolonu kullanmayı bırakan koddan **ayrı
bir sürümde** çıkar (bkz. [operations.md](operations.md)).

---

## Frontend notları

Frontend ayrı repo: `mustafakurtt/uniclub-frontend`. Endpoint sözleşmelerinin
kaynağı [docs/frontend/](frontend/) altındaki dosyalar — burası sadece
backend'in dış dünyaya verdiği garantilerin özeti.

### API adresi

| Ortam | Adres |
| --- | --- |
| Yerel geliştirme | `http://localhost:3000` |
| Laptop'taki production | `https://uniclub.test` |
| Laptop'taki dev (proxy üzerinden) | `https://test.uniclub.test` |

Frontend'de sabit yazma; `VITE_API_URL` gibi bir ortam değişkeninden oku.

### Yanıt sözleşmesi

Her başarılı yanıt aynı zarfı taşır:

```json
{ "success": true, "message": "Kulüpler listelendi.", "data": { } }
```

Hatalar:

| Durum | Anlamı | Ne yapmalı |
| --- | --- | --- |
| `400` / `404` | İş kuralı hatası. `message` **kullanıcıya gösterilebilir** (Türkçe). | Mesajı göster |
| `403` + `code: "EMAIL_NOT_VERIFIED"` | Doğrulanmamış hesap yazma denedi | "E-postanı doğrula" banner'ı + tekrar gönder akışı |
| `429` + `code: "RATE_LIMITED"` | Hız sınırı | `Retry-After` başlığını (saniye) oku, geri sayım göster, butonu kilitle |
| `500` | Beklenmeyen hata. `message` **jeneriktir**, gösterme. | "Bir şeyler ters gitti" + `requestId`'yi göster |

Her hata yanıtında `requestId` var. Kullanıcı "hata aldım" dediğinde sunucu
logunda o id ile satırı bulursun. Destek ekranında göstermeye değer.

**Asla `message` metnine göre dallanma.** Makine tarafından okunacak şey `code`
alanıdır; mesajlar değişebilir. Aynı sebeple `429`'da kalan süreyi mesajdan
ayrıştırma — `Retry-After` başlığı saniye cinsinden verilir.

Hız sınırı **IP'ye değil, korunan kaynağın kimliğine** göre işler: `login` ve
`resend-verification` e-postaya göre sayılır. Sebebi, bir kampüsteki tüm
öğrencilerin tek NAT IP'sini paylaşması — IP'ye göre sayılsa bir kişinin hatası
tüm üniversiteyi kilitlerdi. Yalnızca `register` (henüz kimlik yokken) cömert
bir IP tavanı kullanır.

### Kimlik doğrulama

- `POST /api/auth/register` → tenant **e-posta domaininden çıkarılır**. Domain
  tanınmıyorsa kayıt reddedilir; kullanıcıya "üniversite seç" diye sorma.
- `POST /api/auth/login` → JWT (7 gün). Her istekte `Authorization: Bearer <token>`.
- Doğrulanmamış kullanıcı **giriş yapabilir ve okuyabilir** — bu kasıtlı, çünkü
  "e-postanı doğrula" banner'ı ve tekrar gönder akışı bir oturum gerektirir.
  Yalnızca yazma (`POST`/`PUT`/`DELETE`) engellenir.
- Askıya alınmış (`suspended`) kullanıcı `403` alır. Yetki değişikliği 300 sn
  cache TTL'i olsa da anında etkilidir (cache invalidate ediliyor).
- `GET /api/users/me/permissions` → kullanıcının **efektif** yetki kümesi.
  Menüleri ve butonları buna göre göster; rol adına göre değil.

### Gerçek zamanlı bildirimler

WebSocket handshake'i `Authorization` başlığı taşıyamaz. Bu yüzden **tek
kullanımlık ticket** akışı var:

```ts
// 1. Ticket al (60 sn geçerli, tek kullanımlık)
const { data } = await api.post("/api/notifications/ws-ticket");
// data = { ticket: "...", expiresIn: 60 }

// 2. Bağlan
const ws = new WebSocket(`wss://uniclub.test/api/notifications/ws?ticket=${data.ticket}`);
```

- Ticket **bir kez** kullanılabilir (Redis `GETDEL`). Yeniden bağlanırken
  **yeni ticket al**; eskisini saklama.
- Kapanma kodu `4401` → ticket yok/geçersiz/kullanılmış. Yeni ticket alıp tekrar dene.
- Token'ı query string'e **koyma**; loglara ve tarayıcı geçmişine sızar.

### CORS

Backend `cors()` ile tüm origin'lere açık ve istenen başlıkları yansıtıyor,
yani `Authorization` başlığı sorunsuz geçiyor. Cookie kullanılmıyor.

### TLS uyarısı

`https://uniclub.test` sertifikası Caddy'nin **yerel CA**'sıyla imzalı. Tarayıcı
o kök sertifikayı tanımıyorsa `fetch` sessizce patlar ve konsolda anlaşılmaz bir
network hatası görürsün. Kök sertifikayı kurmadan frontend'i prod'a bağlamaya
çalışma.

Aynı sebeple `curl` ile test etme: ne Git Bash'in `curl`'ü ne de `curl.exe`
Windows sertifika deposuna bakar. PowerShell'de `Invoke-WebRequest` veya
doğrudan tarayıcı kullan.

### Production'da veri yok

Prod veritabanı **asla seed'lenmez** (seed `NODE_ENV=production`'da açık onay
olmadan çalışmayı reddeder). `https://uniclub.test` üzerinde kulüp listesi boş
görünecek. Bu bir hata değil. Geliştirme ve deneme için `localhost:3000` +
`db:seed` kullan.

---

## Sorun giderme

| Belirti | Sebep | Çözüm |
| --- | --- | --- |
| `test.uniclub.test` çözümlenmiyor | `hosts` satırı bozuk | Yönetici PowerShell'de `.\scripts\setup-local-dns.ps1` |
| Tarayıcı sertifika uyarısı | Kök sertifika kurulu değil | `setup-local-dns.ps1 -CertPath ...` |
| `curl` TLS hatası veriyor ama tarayıcı çalışıyor | curl kendi CA paketini kullanır | Normal. `Invoke-WebRequest` kullan |
| `bun run dev` "port in use" | Eski bir `bun` süreci ayakta | `tasklist \| findstr bun` → `taskkill /PID <pid> /F` |
| `db:seed` "duplicate key" | Eski sürüm | `git pull` — seed artık idempotent |
| `db:reset` takılıyor | `drizzle-kit drop` interaktif prompt açıyor | `db:migrate` + `db:seed` kullan |
| Deploy olmuyor | Release kesilmemiş, ya da CI yeşil değil | `gh release list`, `gh run list` |
| Prod `/health` 503 | Postgres veya Redis düşük | `docker compose -p uniclub-prod ps` |
