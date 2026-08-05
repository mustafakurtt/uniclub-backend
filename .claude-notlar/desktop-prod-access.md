---
name: desktop-prod-access
description: "DÜZELTME: çalışan bir production ortamı YOK — her şey local. Eski deploy/JWT_SECRET iş maddeleri geçersiz."
metadata: 
  node_type: memory
  type: project
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-08-01T23:32:57.119Z
---

## ⚠️ Prod diye bir ortam YOK (kullanıcı 2026-08-02'de düzeltti)

> *"bu arada prod umuz yok, eski verilerde yazıyor olabilir ama onlar denemeydi
> hep localdeyiz"*

Depoda `docker-compose.prod.yml`, `Dockerfile`, `scripts/deploy-agent.sh` ve
`deploy-local.sh` **var** ama bunlar bir denemenin kalıntısı. **Çalışan,
erişilebilir bir üretim ortamı bulunmuyor.** Geliştirme ve demo tamamen local.

## Geçersiz kılınan notlar

- **"Prod `JWT_SECRET` ≥ 32 karakter olmalı"** — turlarca açık iş maddesi olarak
  tekrarlandı, **karşılığı yok**. Bir daha gündeme getirme.
- "v1.8.0 / v1.9.0 / v2.0.0 deploy'ları düşmüş olabilir" — deploy olmadı.
  GitHub release'leri yalnızca **sürüm kaydı**; hiçbir yere dağıtılmıyor.
- Aşağıdaki 2026-07 tarihli laptop/Caddy/`uniclub.test` kurulumu **tarihsel**;
  aktif bir ortam değil.

## Hâlâ geçerli

- **LAN üzerinden local erişim** anlamlı: QR içeriği `window.location.origin` ile
  üretiliyor; telefonla okutmak için frontend `localhost` yerine bilgisayarın LAN
  IP'sinden servis edilmeli. Vite hazır (`host: true`, `allowedHosts: ['.uniclub.test']`).
- Sürüm etiketleme değerli — değişiklik kaydı ve anlatı için. Ama "deploy
  tetikler" beklentisi yanlış.

---

## TARİHSEL (2026-07, artık aktif değil)

Masaüstü = geliştirme, laptop = deneme "production"; Docker'da Caddy 443'te
`uniclub.test`'i yerel CA ile servis ediyordu. Erişim `hosts` + kök CA güvenine
dayanıyordu. Laptop IP'si DHCP'den kayıyordu; açılmazsa önce güncel LAN IP
teyit edilirdi.

**How to apply:** Deploy/prod ile ilgili iş maddesi önerme. Demo ve doğrulama
local'de. İlgili: [[urun-yol-haritasi-ve-durum]]
