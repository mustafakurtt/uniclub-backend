# Entegrasyon testleri

Testler `uniclub_test` veritabanında çalışır. `tests/provision.ts`, her `bun test`
koşusunun başında veritabanını sıfırlayıp seed'ler; **tüm test dosyaları aynı DB'yi
paylaşır** — dosya başına izolasyon yok.

## Kurulum

```sh
bun run test:setup   # bir kez veya her tam koşu öncesi
bun test
```

## Yazım kuralları (paylaşılan DB)

1. **Küresel/tenant durumu değiştiren test** (`tenant_settings`, kullanıcı durumu,
   kulüp durumu, roller) `afterAll` ile geri alır — ayarı `null` ile sıfırla veya
   önceki değere döndür.
2. **Sonlu seed fixture'ı** (tek bekleyen katılım isteği, boş kontenjan) tüketen test,
   fixture'ı kendisi yaratır; seed'deki tek kayda güvenme.
3. **Assertion'lar** ortam durumuna değil, testin kurduğu önkoşula dayanır. "Kota 3"
   gibi ambient varsayımlar yerine önkoşulu açıkça kur veya doğrula.
4. **Yarış / eşzamanlılık testleri** durum koduna bak; mesaj metnine kilitleme.

## Sıra bağımlılığı doğrulama

Dosya sırası değişince yeşil kalması için düzeltmelerden sonra en az iki koşu:

```sh
bun run test:setup && bun test
bun run test:setup && bun test $(ls tests/*.test.ts | tac)   # ters sıra (bash)
```

Windows (PowerShell):

```powershell
bun run test:setup; bun test (Get-ChildItem tests\*.test.ts | Sort-Object Name -Descending)
```

Her iki koşu da yeşil değilse başka bir dosyalar arası bağımlılık vardır.
