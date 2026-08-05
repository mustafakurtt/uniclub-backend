---
name: frontend-bilgi-mimarisi
description: "uniclub-frontend 'geniş ama sığ' — 11 admin rotası ama tek detay rotası, detaylar modal içinde; M2.5'in konusu"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4c3723be-c6d4-4c16-a2f2-f644f6e85a4c
  modified: 2026-08-01T15:48:53.752Z
---

Kullanıcının 2026-08-01 tarifi: *"karmaşık pathler her yerde ama içlerinde ayrıntı yok;
yönetim kısmında her şey alt alta geçmiş ama detaylara ulaşamıyoruz."* Koda karşı
ölçüldü, doğru çıktı:

- **11 admin rotası, tek parametrik detay rotası** — yalnızca
  `/admin/universities/:universityId`. Kulüp, kullanıcı, başvuru için detay rotası yok.
- **Detaylar modal içinde:** `AdminFormationProposalDetailModal`,
  `ClubApplicationHistoryModal`, `ClubAdvisorsModal`, `RoleFormModal`.
- **Menü 9 düz öğe**, gruplanmamış; günlük iş (kulüpler, moderasyon, raporlar) ile
  nadir kurulum işi (roller, yetkiler, akademik yapı) aynı düzeyde.

**Modal'ın bedeli kozmetik değil işlevsel.** Link verilemez, yer imi yapılamaz, geri
tuşu çalışmaz, sekmede açılamaz, e-postayla paylaşılamaz. Kurumsal iş akışında SKS
uzmanı meslektaşına "şu başvuruya bak" der — bunun yolu bir URL olmalı. Denetimde
"hangi kayda baktık" sorusunun cevabı da öyle.

**Yön (roadmap FE-5 / M2.5):** modal → rota; sekmeli varlık detayları (kulüp detayı:
üyeler · etkinlikler · duyurular · danışmanlar · galeri · denetim izi); menü gruplama
(günlük iş / kurum yapısı / sistem); rol bazlı iniş sayfaları (`student_affairs` ile
`university_admin` aynı ekrana düşmemeli); öğrenci tarafında süreç görünürlüğü
(başvuru hangi kademede, ne bekleniyor).

**Why:** M3 daha çok varlık ve ilişki getiriyor. Düz liste + modal mimarisi üzerine
eklenirse sorun büyüyerek katılaşır.

**How to apply:** FE prompt'u yazarken ekran eklemekten önce **mimari** iste. Yeni bir
detay yüzeyi gerektiğinde modal değil rota öner. İlgili: [[urun-yol-haritasi-ve-durum]]
