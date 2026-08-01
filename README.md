# UniClub — Multi-Tenant University Club Management Backend

[![CI](https://github.com/mustafakurtt/uniclub-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/mustafakurtt/uniclub-backend/actions/workflows/ci.yml)
![Bun](https://img.shields.io/badge/Bun-1.1+-000?logo=bun&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

A production-minded **multi-tenant SaaS backend** where a single deployment
serves many universities — students, advisors, clubs, join requests, events,
announcements and galleries — each tenant isolated by `universityId`, plus a
separate SaaS control plane for operating the tenants themselves. Built to
explore real backend concerns: layered architecture, a portable RBAC engine,
realtime delivery, background jobs, auditing and structured logging.

> The codebase uses **Turkish** for code comments and user-facing API messages
> by design; this README and the [architecture guide](docs/architecture/overview.md) are
> in English.

---

## Highlights

- **Multi-tenancy from the schema up** — `universities → domains → faculties →
  departments`; tenant is **inferred from the user's email domain** at
  registration, and every guarded route is scope-checked against the caller's
  own university.
- **Enterprise 9-role RBAC** — a global claim-based layer (roles, permissions,
  per-user grant/deny overrides where **deny wins**) plus a separate per-club
  membership layer. Effective permissions are cached read-through in Redis with
  correct invalidation on role/status changes.
- **Portable backend core** — `src/core/` is a project-agnostic Bun/Hono/Drizzle
  toolkit (config, logger, HTTP error/response/validation, `BaseRepository`, JWT +
  RBAC + `guard()`, cache, redis, i18n, mail, metrics, graceful shutdown) — every
  project-specific detail injected via a `createX`/`configureX` seam, decoupled
  from the schema-bound `src/shared/`.
- **SaaS control plane** — a separate `/api/platform` surface for tenant
  lifecycle (trial/active/past_due/suspended), atomic onboarding and operator
  accounts. Suspending a tenant cuts access on the *next* request across every
  surface, guarded and unguarded alike. Platform permissions can never be
  granted to a tenant role.
- **Session security** — token-less admin provisioning: operators invite tenant
  admins with a single-use, hashed, expiring token and never learn their
  password. Session revocation rides on the authz snapshot already read each
  request (`tokenVersion`), so a password change drops other devices with **no
  extra Redis call and no deny-list**.
- **Publishing pipeline** — announcements and events carry a draft/published
  lifecycle, visibility scoping and **scheduled publishing** interpreted in the
  tenant's own timezone. The trigger lives in Redis but Postgres is the source
  of truth: a reconciliation sweep re-queues anything the queue lost, so a
  scheduled post can never silently fail to publish.
- **Public surface** — unauthenticated club and event pages plus poster QR
  resolution, for people who don't have an account yet (prospective students,
  open-day visitors). Serves an explicit public DTO — no member lists, no
  attendee data, no personal names.
- **Realtime notifications** — persisted **and** pushed over Bun-native
  WebSockets, authenticated with a single-use Redis ticket (no token in the
  query string), fanned out across instances via Redis Pub/Sub. Delivery is
  batched, queued past a threshold, and filtered by per-type/per-club user
  preferences — mandatory notices can never be muted.
- **Background jobs** — email verification via BullMQ + nodemailer, captured
  locally by Mailpit; retries with exponential backoff.
- **Append-only audit trail** — every mutating request (including denied 403s)
  auto-recorded with actor, action, target and redacted body.
- **Resilient by default** — Redis-backed rate limiting keyed by *resource
  identity, not IP* (campus NAT-aware) and **fail-open**; a **fail-open cache**
  (a Redis blip never fails an authenticated request); a strict error contract
  that never leaks SQL; **graceful shutdown** that drains in-flight work on deploy.
- **Observability & hardening** — structured pino logs (Vector → Loki) + Prometheus
  metrics (`/metrics` → Grafana), security headers, an env-driven CORS allowlist
  and a request body-size cap.

## Tech stack

| Layer | Choice |
| --- | --- |
| Runtime | **Bun** |
| Web framework | **Hono** |
| ORM / DB | **Drizzle ORM** + **PostgreSQL 16** |
| Cache / queue / pub-sub | **Redis 7** + **BullMQ** (ioredis) |
| Validation | **Zod** |
| Auth | JWT (HS256) + `Bun.password` (bcrypt) |
| Mail | Nodemailer (Mailpit locally) |
| Observability | Pino → Vector → Loki (logs) · Prometheus → Grafana (metrics) — [docs](docs/operations/logging.md) |
| Language | TypeScript (strict) |

## Architecture at a glance

```
HTTP ─▶ requestId ─▶ logger ─▶ auth (JWT) ─▶ attachAuthz ─▶ audit hook
                                                 │              │
                                    requirePermission / enforceTenantScope
                                                 ▼
                        routes ─▶ services ─▶ repositories ─▶ Drizzle ─▶ Postgres
                                     │
                          notifications · mail queue · pub/sub  ─▶ Redis
```

Code is organized **by feature** (`src/features/<feature>/`), each split into
`routes / service / repository / schema / types / permissions`. Repositories are
the only layer that touches the database. See
**[docs/architecture/overview.md](docs/architecture/overview.md)** for the full design.

## Project structure

```
src/
├─ config/        env validation (zod) — the only place process.env is read
├─ core/          portable backend toolkit — config · logger · http · db ·
│                 auth · rbac/guard · cache · redis · i18n · mail · metrics · shutdown
├─ db/            schema.ts (source of truth), relations, migrations, seed
├─ features/      auth · users · university · admin · clubs · announcements ·
│                 activities · gallery · media · dashboard · notifications ·
│                 audit · moderation · platform · public · poster-qr ·
│                 tenant-settings  (routes/service/repo/…)
├─ middlewares/   error · rate-limit · request-logger · verified/active-user ·
│                 optional-auth · app-locale
├─ shared/        rbac cache/repo · cache · mail · redis · ws · publishing ·
│                 i18n · logger · metrics · utils
└─ index.ts       app wiring + Bun.serve (import.meta.main) + graceful shutdown
```

## Getting started

### Prerequisites

- [Bun](https://bun.sh) `>= 1.1`
- Docker (for local Postgres, Redis and Mailpit)

### 1. Install & configure

```sh
bun install
cp .env.example .env      # then set JWT_SECRET (openssl rand -base64 48)
```

### 2. Start infrastructure

```sh
docker-compose up -d      # Postgres :5432 · Redis :6379 · Mailpit :8025
                          # + observability: Grafana :3001 · Prometheus :9090 · Loki :3100
```

### 3. Migrate & seed

```sh
bun run db:migrate        # apply migrations
bun run db:seed           # 3 universities, 9-role RBAC catalog, sample data
```

The seed creates tenant-isolation scenarios, the full role catalog, a user for
every role, and clubs in every status.

### 4. Run

```sh
bun run dev               # http://localhost:3000 (hot reload)
```

Verification emails land in the Mailpit inbox at **http://localhost:8025**.

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Dev server with hot reload |
| `bun run typecheck` | `tsc --noEmit` (run in CI) |
| `bun run docs:check` | Doc link, API-coverage and constant-drift checks (run in CI) |
| `bun run test:all` | Provision the isolated test DB, then run the test suite |
| `bun run test` | `bun test` — integration tests (run in CI) |
| `bun run db:generate` | Generate a SQL migration from `schema.ts` |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:reset` | Drop, regenerate, migrate and seed in one shot |
| `bun run db:push` | Push schema without a migration file |
| `bun run db:seed` | Seed universities, roles and sample data |
| `bun run db:bootstrap` | Idempotent RBAC catalog (+ rank backfill) + first `super_admin` (production) |

## Testing

Integration tests run the **full middleware chain** — JWT auth, the RBAC
`guard()` composer, tenant-scope enforcement and multi-tenant isolation — through
Hono's `app.request()` against a **real Postgres + Redis**, exactly the way CI
does. They run against a dedicated `uniclub_test` database (and Redis DB index 1)
that is dropped, migrated and re-seeded on every run, so they are deterministic
and never touch dev data.

```sh
bun run test:all   # provision the isolated test DB, then run the suite
```

**385 tests** across auth (registration, login timing, email verification,
self-service reset, session revocation), the RBAC matrix and multi-tenant
isolation, clubs and memberships, activities and RSVP, announcements and their
publish lifecycle, notification preferences and fan-out, the platform control
plane, tenant settings, scheduled publishing and its reconciliation sweep, the
public surface, and QR resolution and check-in.

The suite shares one seeded database, so isolation rules matter — see
[`tests/README.md`](tests/README.md). Order dependence is a real failure mode
here: verify with more than one file ordering before trusting a green run.

## Environment

Validated at startup via `src/config/env.ts` (Zod) — the app **fails fast** with
a clear message on any invalid/missing var. Required: `PORT`, `NODE_ENV`,
`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (min 32 chars; common placeholder
values are rejected outright). Mail (`SMTP_*`, `MAIL_FROM`, `APP_URL`),
rate-limit, logging (`LOG_LEVEL`, `LOG_FILE`) and security (`CORS_ORIGINS` — set in
production — `MAX_BODY_BYTES`) vars have dev defaults. See
[`.env.example`](.env.example).

## Deployment

The app ships as a multi-stage [`Dockerfile`](Dockerfile) (Bun on Alpine, runs
as a non-root user, `/health` healthcheck). Docs, CI config and dev tooling are
excluded from the image via [`.dockerignore`](.dockerignore) — environments
differ by **configuration and build scope**, never by which files a branch carries.

```sh
# Production stack (app + Postgres + Redis; no Mailpit, DB port not exposed)
docker compose -f docker-compose.prod.yml up -d --build
```

All secrets come from the environment; `docker-compose.prod.yml` contains no
values and fails fast if a required variable is missing.

**CI never deploys.** On every push it builds the production image, applies
migrations from a separate migrator image to a clean database, boots the
container with `NODE_ENV=production` and waits for `/health` — proving a release
candidate actually starts, not just compiles.

Production **pulls**: the deploy agent on the production host reads GitHub, finds
the latest release, verifies its CI was green and deploys itself
([`scripts/deploy-agent.sh`](scripts/deploy-agent.sh)). GitHub never connects
inward — on a public repo a self-hosted runner would hand fork PRs a code
execution surface. Migrations run as their own step before the app starts, and a
failed deploy rolls back to the previous image.

The app also refuses to start in production if migrations are pending, so a
missed migration fails loudly at boot instead of silently at the first query.
Backups, migration rules and incident response are documented in
**[docs/operations/runbook.md](docs/operations/runbook.md)**.

## API & docs

Index: **[docs/README.md](docs/README.md)**.

- **[docs/reference/api.md](docs/reference/api.md)** — REST endpoint reference
- **[docs/architecture/overview.md](docs/architecture/overview.md)** — full system design
- **[docs/operations/logging.md](docs/operations/logging.md)** — logging + metrics observability stack
- **[docs/operations/runbook.md](docs/operations/runbook.md)** — deploy, backups, incident response
- **[docs/integration/](docs/integration/)** — per-surface frontend integration guides
- **[docs/design/](docs/design/)** — RBAC model design notes & scenarios

## Contributing

Branching model, commit convention and code rules live in
**[CONTRIBUTING.md](CONTRIBUTING.md)**. Work branches from `develop`; `main` is
protected and holds tagged releases.

## License

[MIT](LICENSE) © Mustafa Kurt
