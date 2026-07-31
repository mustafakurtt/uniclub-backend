# Documentation

Reference documentation for the UniClub backend. Overview: [root README](README.md).

> API/integration docs are in **Turkish**; architecture/ops in **English** ([CONTRIBUTING.md](../CONTRIBUTING.md)).

Changelog: [CHANGELOG.md](../CHANGELOG.md).

## Reference — [`reference/`](reference/)

| Doc | Covers |
| --- | --- |
| [api.md](reference/api.md) | REST endpoint catalog |
| [data-model.md](reference/data-model.md) | ER diagram, table dictionary, tenant columns |
| [error-and-audit.md](reference/error-and-audit.md) | Error envelope, i18n, audit trail |

## Architecture — [`architecture/`](architecture/)

| Doc | Covers |
| --- | --- |
| [overview.md](architecture/overview.md) | Layering, multi-tenancy, RBAC, realtime |
| [core-middleware.md](architecture/core-middleware.md) | `src/core` middleware catalog |
| [notifications.md](architecture/notifications.md) | Notifications + WebSocket |
| [mail-verification.md](architecture/mail-verification.md) | Email verification (BullMQ) |
| [cache/](architecture/cache/) | Cache layers, invariants, roadmap |

## Operations — [`operations/`](operations/)

| Doc | Covers |
| --- | --- |
| [runbook.md](operations/runbook.md) | Environments, migrations, backups, incidents |
| [machine-setup.md](operations/machine-setup.md) | Two-machine dev/prod setup |
| [tenant-onboarding.md](operations/tenant-onboarding.md) | New university runbook |
| [logging.md](operations/logging.md) | Vector → Loki, Prometheus → Grafana |
| [performance.md](operations/performance.md) | Load test results |

## Compliance — [`compliance/`](compliance/)

| Doc | Covers |
| --- | --- |
| [kvkk.md](compliance/kvkk.md) | Personal data inventory, anonymization |

## Planning — [`planning/`](planning/)

| Doc | Covers |
| --- | --- |
| [README.md](planning/README.md) | **Ürün sırası** — A1→G yol haritası (ilerleme CHANGELOG'da) |
| [session-revocation-and-password-reset.md](planning/session-revocation-and-password-reset.md) | A2 tasarım — tokenVersion + şifre sıfırlama (onay bekliyor) |
| [schema-product.md](planning/schema-product.md) | Active schema/product backlog |
| [platform-ops-roadmap.md](planning/platform-ops-roadmap.md) | SaaS platform panel roadmap (phases, backend gaps) |
| [platform-rbac.md](planning/platform-rbac.md) | Platform rol/yetki modeli (kaç rol, permission demetleri) |
| [security-core.md](planning/security-core.md) | Security + `core/` gaps |
| [archive/](planning/archive/) | Completed tier history |

## Frontend integration — [`integration/`](integration/)

Endpoint contracts and client behavior. Start at [integration/README.md](integration/README.md).

## RBAC design — [`design/`](design/)

9-role model, scenarios, permission bundles. Hub: [design/README.md](design/README.md).

## ADRs — [`adr/`](adr/)

Architecture decision records.
