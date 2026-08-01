# Afiş QR şeması — FK `onDelete` tasarım notu

**Durum:** Uygulandı (2026-08-01)  
**İlgili:** [activities-schema-fk-debt.md](activities-schema-fk-debt.md), T10.1

---

## FK `onDelete` politikaları

| FK | Tablo.kolon | Politika | Gerekçe |
|---|---|---|---|
| `universities.id` | `poster_qr_codes.university_id` | **RESTRICT** | Üniversite yalnızca boş tenant'ta soft-delete (`deletedAt`); fiziksel silme yok. Tenant QR kayıtları tenant ile birlikte sessizce kaybolmamalı. |
| `clubs.id` | `poster_qr_codes.target_club_id` | **RESTRICT** | Kulüp silme yok (`archived`); [activities-schema-fk-debt §2](activities-schema-fk-debt.md) ile aynı ürün kararı. |
| `clubs (id, university_id)` | bileşik tenant kilidi | **RESTRICT** | Aynı — hipotetik hard-delete yolunda graf korunur. |
| `activities.id` | `poster_qr_codes.target_activity_id` | **CASCADE** | Etkinlik hard-delete olsa hedef QR anlamsız; `activity_attendees.activity_id` ile aynı mantık. Bugün iptal = status, silme yok. |
| `users.id` | `poster_qr_codes.created_by` | **RESTRICT** | Kullanıcı anonimleştirilir, fiziksel silme yok; oluşturan referansı audit için kalır. |
| `poster_qr_codes.id` | `poster_qr_scans.qr_code_id` | **CASCADE** | Kod silinince tarama satırları da gider. |

**Migration:** takip migration — `target_activity_id` RESTRICT → CASCADE + tarama indeksi.
