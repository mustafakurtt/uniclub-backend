# Mimari Karar Kayıtları (ADR)

Bu klasör, **zaten alınmış** mimari kararların gerekçesini ve elenen
alternatiflerini tutar. `architecture.md` sonucu anlatır; ADR'ler *neden* o
sonuca varıldığını kaydeder.

Numaralandırma kronolojiktir (ilk karar = `0001`). Yeni bir karar alındığında
sıradaki numarayı kullanın; eski kayıtları **değiştirmeyin** — yanlışsa yeni
bir ADR ile geçersiz kılın.

| ADR | Karar |
|---|---|
| [0001](0001-bun-runtime.md) | Runtime: Bun (Node yerine) |
| [0002](0002-drizzle-orm-define-relations.md) | ORM: Drizzle + `defineRelations` v2 |
| [0003](0003-core-shared-portability-boundary.md) | `core/` taşınabilir çatı vs `shared/` proje bağımlılığı |
| [0004](0004-nine-role-rbac-with-rank.md) | 9 rollük RBAC + `roles.rank` hiyerarşisi |
| [0005](0005-plain-error-business-contract.md) | İş kuralı hataları: düz `new Error` sözleşmesi |
| [0006](0006-composite-fk-cross-tenant-lock.md) | Çapraz-tenant kilidi: bileşik FK'ler |
| [0007](0007-email-domain-tenant-inference.md) | Tenant: e-posta domain'inden çıkarım |
