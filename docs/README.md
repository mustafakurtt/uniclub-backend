# Documentation

Reference documentation for the UniClub backend. The high-level overview
lives in the [root README](../README.md); this folder holds the deep dives.

> Note: API/feature docs and the design notes are written in **Turkish**, matching
> the codebase convention (comments and user-facing messages are Turkish).

## Reference

| Doc | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | System design: layering, multi-tenancy, RBAC engine, realtime, data flow |
| [operations.md](operations.md) | Environments, migrations, backups, deploys, incident response |
| [API.md](API.md) | REST endpoint reference |
| [BILDIRIMLER.md](BILDIRIMLER.md) | Notification system + WebSocket delivery |
| [DENETIM_VE_HATA.md](DENETIM_VE_HATA.md) | Audit trail + error-handling contract |
| [MAIL_DOGRULAMA.md](MAIL_DOGRULAMA.md) | Email verification flow (BullMQ + Mailpit) |

## Frontend integration guides — [`frontend/`](frontend/)

Endpoint contracts and expected client behavior for each surface (auth/RBAC,
clubs, university, management, notifications & rate limits).

## RBAC design notes — [`design/`](design/)

The enterprise 9-role model: role → permission bundles, tenant-scope rules,
escalation safety, and the scenarios that drove the design.
