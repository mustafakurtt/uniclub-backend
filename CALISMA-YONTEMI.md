# Çalışma Yöntemi

Bu belge **proje ve teknoloji bağımsızdır.** Uniclub'da ~40 dalga boyunca
deneyle ölçüldü ama içindeki hiçbir kural Bun'a, Hono'ya veya React'e bağlı
değil. Yeni bir projeye başlarken bu dosyayı kopyala.

Konu: bir kişinin, bir yönetici asistanla (Claude) ve kod yazan ajanlarla
(Cursor vb.) nasıl verimli çalıştığı.

---

## 1. Rol dağılımı — en önemli karar

| Kim | Ne yapar | Ne YAPMAZ |
| --- | --- | --- |
| **Sen** | ürün kararı verir, gerçek hesapla tıklar, önceliği belirler | her satırı okumaz |
| **Claude** | prompt yazar, iddiaları koda karşı doğrular, kapıları koşar, git işlerini yapar, tasarım yapar | özellik kodu yazmaz |
| **Ajanlar** | özellik kodu yazar | karar vermez, tasarlamaz, kendi işini doğrulamaz |

Bu ayrım keyfi değil. Claude kod yazmaya başlarsa **doğrulayan kalmaz** —
kendi kodunu denetleyen kimse tarafsız değildir.

**Tasarım işi ajanlara verilmez.** Ajanlar bilgi mimarisi, ekran düzeni,
kategori yapısı gibi işlerde düşünemiyor; yamalı çözüm üretip savunuyorlar.
Tasarımı sen + Claude yapar, ajana **uygulanacak hâlde** verilir.

---

## 2. Doğrulama — bu yöntemin kalbi

**Ajan raporu bir iddiadır, kanıt değildir.** Her iddia koda karşı ölçülür.

### Değişmez refleksler

- **Kapıları kendin koş.** Ajan "geçti" dese bile. Görmediğine yeşil deme.
- **Yeşil test kanıt değildir; KIRMIZI kanıttır.** Yeni bir kural/kapı
  eklendiğinde ajandan şunu iste: *"kuralı ihlal eden geçici bir satır ekle,
  kapının kırmızı olduğunu göster, sonra geri al."* Yeşil kapı, kapının
  çalıştığını değil, ihlal olmadığını gösterir.
- **Kırmızı test gördüğünde önce TABANI ÖLÇ, sonra suçla.** Değişikliği
  `git stash` ile çıkar, tekrar koş. Bir kez ajana "gerileme yaptın" yazmak
  üzereydim; taban da kırmızıydı, sebep ortamdı.
- **Ölçmeden liste verme.** "Şurada 3 sorun var" dedim, yeniden ölçünce 2
  çıktı — diğeri yorum satırıydı. İçe aktarmaya değil **kullanıma** göre say.
- **Ajanın "gerekebilir"ini kesinlik oku.** Ajanlar kötü haberi yumuşatır.
  *"…gerekebilir"* cümlesi genelde kesin bir arızayı anlatır.
- **Ajanın "yapmadıklarım" bölümü raporun en değerli kısmıdır.** Her
  prompt'ta iste. Gerçek borçlar hep oradan çıktı.
- **Ajan çalışırken `git add -A` kullanma.** Ağacın tamamı senin değil; bir
  kez ajanın yazmakta olduğu kodu doküman commit'ine süpürdüm.

### Yeşil kapı ≠ çalışan sistem

Bir kez **530 test yeşilken**, gerçek hesapla tıklamak **beş ayrı sorun**
buldu — biri tüm yönetim panelini çökerten çalışma zamanı hatasıydı.
Tip denetimi, lint ve build bunu göremez.

**Kural: rol bazlı yüzeyler ve düzen (layout) değişiklikleri, gerçek hesapla
tıklanmadan "bitti" sayılmaz.** Bu iş sana ait; ajanlar tarayıcı açamıyor.

---

## 3. Prompt yazımı — deneyle ölçülmüş desenler

### İskelet

1. **Nerede çalışacağı en başta** (dal/klasör). Yazılmazsa şaşırıyorlar.
2. **Kısa bağlam bloğu** — mimari kuralları, dil, katmanlama.
3. **"Neden bu iş"** — ürün gerekçesi. Kapsam kararlarını doğru yerden
   verdiriyor.
4. **Sözleşme** — uçlar, alan adları, yetkiler. Yoksa ajan uydurur.
5. **"Yapmayacakların" listesi.** Yazılmayan yasak ihlal edilir.
6. **Bitti tanımı** — hangi komutlar, *"gerçek çıktıyı yapıştır"*.
7. **"Raporunda şunlar olsun"** — sorulmayan anlatılmıyor.

### En çok işe yarayan beş cümle

- **"Benim yazdığıma değil, GÖRDÜĞÜNE göre kod yaz."**
  Bu cümle sayesinde ajan beni iki kez düzeltti — prompt'uma yazdığım
  isimler kodda yoktu. **Senin sözleşme tablon yanılabilir.**
- **"Kolay ama yanlış yolu" açıkça yasakla.** "Testi değiştirerek geçirme",
  "bayrakla sorunu gizleme", "altyapıyı yeniden yazma". Yasaklanmayan
  kestirme seçilir.
- **"Kararının gerekçesini yaz."** Gerekçe istendiğinde ajan yamayı bırakıp
  doğru düzeni seçip savunuyor.
- **Şüphelendiğini soru olarak sor.** *"Şu kontrol ediliyor mu? Bak ve
  raporunda yaz."* Sormasaydım raporda geçmeyecekti.
- **"Aynı desen başka yerde var mı? Tara ve LİSTELE, bu turda değiştirme."**
  Tarama ucuz, kör düzeltme pahalı.

### Kapsam genişliği — ölçüldü

Aynı işi iki kez verdim, tek fark genişlikti:

| Genişlik | Sonuç |
| --- | --- |
| "şu sayfaya altı sekme ekle" | çok uzun sürdü, yarıda kesildi, **çıktı yok** |
| "şu sayfaya YALNIZCA bir sekme ekle, başka sekme ekleme" | temiz teslim |

**Bir turda bir ekran, bir sekme, bir uç.** Kapsamı daraltmak yavaşlatmak
değildir — geniş prompt teslim edilmiyor.

### İşe yaramayanlar

Uzun mimari anlatısı (okunmuyor) · "dikkatli ol" gibi soyut uyarılar ·
tek turda üç büyük iş · **ajan sayısını artırmak**.

---

## 4. Paralellik — sınırı doğrulama belirler

İki ajan (biri arka uç, biri ön yüz) iyi çalışıyor. **Üçe çıkarmak
denendi ve geri alındı.**

Teknik olarak sorunsuzdu — ayrı çalışma ağaçları (`git worktree`) ve
dosya sahipliği tablosuyla tek çakışma çıkmadı. Ama **hız kazandırmadı**,
çünkü darboğaz ajan sayısı değil **doğrulamaydı**: kapıları koşan,
iddiaları ölçen, PR bekleyen tek kişi var.

> **Ajan sayısını artırmadan önce doğrulama maliyetini düşür.**

Yine de gerekirse iki teknik hazır:
- Ayrı `git worktree` — aynı klasörde iki ajan birbirinin ağacını ezer.
- **Dosya sahipliği tablosu** — "bu dosya A'nın". Ortak dosyalarda yalnızca
  *satır ekleme* izni. Entegrasyon satırını (menü girdisi gibi) ajana bırakma.

**Sözleşmeyi serileştir, uygulamayı paralelleştir.** Ön yüz, henüz var
olmayan bir uca karşı kod yazmaz.

---

## 5. Kural koyma — tek kural

> **Zorlanmayan kural, kural değildir.**

Bu ders bir projede **dört kez** öğrenildi. Her seferinde belgede yazılı
ama makinece denetlenmeyen bir kural sessizce ihlal edildi.

Bir kural koyduğunda **aynı turda** onu denetleyen bir test/kapı yaz.
Denetlenemiyorsa kural değil temennidir.

### Kapı kırmızı kalmamalı — MANDAL (ratchet) kur

Bir kapıyı mevcut borca alarm verdirirsen **her koşuda kırmızı** olur ve
kısa sürede görmezden gelinir. Sürekli kırmızı kapı, hiç kapı olmamasından
kötüdür.

Doğru düzen:
- Bilinen borç bir **taban dosyasına** yazılır (insan okuyabilir olsun).
- Kapı yalnızca **borç büyürse** kırmızı.
- Borç azalırsa da kırmızı — ama *"tabanı güncelle"* mesajıyla. Bu mandalın
  dişlisidir; geri kaymayı engeller.

### İstisna listesi olan kural, kural değildir

Kapıya "şunlar hariç" listesi eklemek zorunda kalıyorsan kural yanlış
tanımlanmıştır. Önce ihlalleri temizle, sonra kapıyı istisnasız kur.

---

## 6. Refactor — kanıtı testlerin dokunulmamış olmasıdır

> **`git diff --stat tests/` boşsa refactor, boş değilse davranış değişikliği.**

Bu tek ölçüt üç büyük refactor'ü güvenle geçirdi (1206→17, 1892→650,
658+576→15+15 satır). Prompt'a mutlaka yaz:

> *"tests/ klasörüne DOKUNMA. Test değiştirmek zorunda kalıyorsan refactor
> değil davranış değişikliği yapıyorsun — DUR ve raporla."*

Bölünme gerekçesi **satır sayısı olamaz.** "Bu iki grup birbirinin durumunu
paylaşmıyor" gerekçedir. Ajandan gerekçeyi iste.

**Ölü kod "geriye dönük uyumluluk" değildir.** Kimsenin çağırmadığı bir
sarmalayıcı, tek depolu bir projede sadece ölü koddur. Silmeden önce
`grep` ile tara; test çağırıyorsa dur ve sor.

---

## 7. "Bitti" ne demek

Bu projede en sık tekrarlayan hata: **arka uç biter, arayüz kalır.**
Yedi kez oldu; her seferinde özellik "bitti" sayıldı ama kullanılamazdı.

Çözüm ölçmekti: her ucu bir ekrana eşleyen bir tablo + CI kapısı.
**Ama önce ölç, sonra liste ver** — "43 eksik" dediğim sayı yeniden
ölçümde 19 çıktı; gerisi *dolaylı kullanılan* (başka ekranın parçası) veya
*iç akış* (e-posta bağlantısı) uçlardı.

Genel kural: **"X yazıldı" ile "X kullanılabilir" farklı şeylerdir.**
Hangi işte olursan ol, bitmiş saymadan önce sor: *bunu kim, nereden
kullanacak?*

---

## 8. Git ekonomisi

Seremoni token ve zaman yakar. Oturduğu düzen:

- **Korumasız depo/dal:** doğrudan commit, dal açma.
- **Korumalı dal:** PR şart — ama **dalga başına değil, OTURUM BAŞINA**
  tek PR. Birden fazla iş tek dalda birikir.
- **Dalı Claude açsın.** Ajanlar dört kez dal şaşırdı; prompt'un ilk
  satırına kalın yazmak yetmedi. "Şu dalda çalış, yeni dal açma" en sağlamı.
- **Uzun süre birleştirilmemiş dal zararlıdır.** Bir dal beş commit
  bekletildi; kullanıcı ana dala bakıp iki kez "değişiklikler geri alınmış"
  dedi. **İnceleme için bekletmek incelemeyi zorlaştırıyorsa bekletme.**
- **Commit mesajı NEDEN'i anlatır.** Ne yapıldığı diff'te zaten var.
  Alınan kararı, reddedilen alternatifi ve bilinen sınırı yaz.

---

## 9. Onay ve iletişim

- **Her turda onay bekleme.** Değerlendir, karar ver, gerekçeyi anlat,
  devam et. "Devam edeyim mi?" diye sormak akışı kesiyor.
- **Ama yıkıcı işlerde sor.** Silme, sıfırlama, dışa gönderme, geri
  alınamaz komutlar. (`docker compose down -v` bir kez tüm geliştirme
  verisini sildi — prompt'lara asla yazma.)
- **Beğenilen şeye izinsiz dokunma.** Bir görsel öğeyi "geliştirmek" için
  değiştirdim; geri alındı ve güven zedelendi. Önce göster, sonra uygula.
- **Hata yaptığında düz söyle, bir cümlede düzelt, devam et.** Uzun özür
  ve öz eleştiri zaman kaybı.

---

## 10. Oturum hijyeni — makine değiştirirken

**Claude'un hafıza dosyaları makineye özeldir** (`~/.claude/projects/…`),
git'te değildir, başka bilgisayara gitmez.

Kalıcı olmasını istediğin her şey **depoda** durmalı:
- bu belge (`CALISMA-YONTEMI.md`)
- ürün yol haritası (`docs/planning/…`)
- tasarım kararları (`docs/design/…`)
- mimari kayıtları (`docs/architecture/…`)

Yeni makinede ilk tur: Claude'a bu dosyaları okut, sonra *"notlarını
buna göre kur"* de.

**Yeni projeye başlarken:** bu dosyayı kopyala, `CLAUDE.md`'ye bir satır
ekle, ilk turda Claude'a okut. Kırk dalgalık öğrenmeyi sıfırdan tekrar
yaşamana gerek yok.
