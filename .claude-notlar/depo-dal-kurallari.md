---
name: depo-dal-kurallari
description: "Dal/commit/PR işleri TAMAMEN Claude'da; FE main korumalı, ajanlar dalı sürekli şaşırıyor — dalı Claude açsın"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-08-02T10:41:00.992Z
---

**Kullanıcı tüm dal/commit/PR işlerini Claude'a devretti** (2026-08-02):
*"sen yapar mısın bu dal commit branch işlerini hep sana bırakıyorum"*.

**Backend (`uniclub-backend`):** `develop` serbest — doğrudan commit + push.
`main` korumalı; birikince `develop → main` PR'ı, etiket/release `gh` ile.

**Frontend (`uniclub-frontend`):** `main` **korumalı**, doğrudan push reddedilir
(`GH006`). Her iş: özellik dalı → PR → CI (`Quality` + `Docker`, ~1 dk) →
`gh pr merge --merge --delete-branch`. `--auto` bu depoda **kapalı**, önce
`gh pr checks <no> --watch`. `dev` dalı da korumalı, silinemiyor.

## Ajanlar dalı dört kez şaşırdı

Yanlış dala yazdı · doğrudan `main`'de çalıştı · `main` yerine başka bir özellik
dalından dallandı (iki işi karıştırdı). Prompt'un ilk satırına kalın harfle
yazmak **yetmiyor**.

**Çözüm: dalı ARTIK CLAUDE AÇSIN** ve prompt'ta "şu dalda çalış, yeni dal açma"
densin. Ajanın dal açmasına güvenme.

**Karışmış dalı ayıklama:** iş commit'lenip `main`'den açılmış temiz bir dala
`git cherry-pick` edilir. Barrel dosyaları (`types/index.ts`) tipik çakışma
noktası — iki dal da sona satır ekler; çözümde **ikisini de koru**, tekrarı at.

## Uzun süre birleştirilmemiş dal ZARARLI

Dashboard yeniden tasarımı beş commit boyunca dalda bekletildi ("tasarımı
görmeden birleştirmem" diye). Sonuç: kullanıcı `main`'e bakıp **iki kez**
"değişiklikler geri alınmış, kodlar karışıyor mu?" dedi. Dal, görülmesini
engelledi.

**Ders:** İnceleme için bekletmek, incelemeyi zorlaştırıyorsa bekletme. Ya hemen
birleştir ya her turda "şu dala geç" diye açıkça yaz — arada bırakma.
Frontend'in dağıtımı yok, `main`'de yineleme ucuz.

**Bayat dalı ayırt etme:** `git diff --stat origin/main origin/<dal> -- src/`
net **silme** gösteriyorsa içerik zaten main'de, güvenle silinir.

İlgili: [[calisma-akisi-develop-uzerinde]] · [[ajan-prompt-desenleri]] ·
[[onay-bekleme-yok]]
