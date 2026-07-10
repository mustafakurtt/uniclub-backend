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
serves many universities — students, advisors, clubs, join requests,
announcements and galleries — each tenant isolated by `universityId`. Built to
explore real backend concerns: layered architecture, a portable RBAC engine,
realtime delivery, background jobs, auditing and structured logging.

> The codebase uses **Turkish** for code comments and user-facing API messages
> by design; this README and the [architecture guide](docs/architecture.md) are
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
- **Portable authorization core** — `src/core/` is project-agnostic
  (JWT + RBAC middleware, a single `guard()` composer, audit hook, pino
  factory), decoupled from the schema-bound `src/shared/rbac/`.
- **Realtime notifications** — persisted **and** pushed over Bun-native
  WebSockets, authenticated with a single-use Redis ticket (no token in the
  query string), fanned out across instances via Redis Pub/Sub.
- **Background jobs** — email verification via BullMQ + nodemailer, captured
  locally by Mailpit; retries with exponential backoff.
- **Append-only audit trail** — every mutating request (including denied 403s)
  auto-recorded with actor, action, target and redacted body.
- **Resilient by default** — Redis-backed rate limiting keyed by *resource
  identity, not IP* (campus NAT-aware) and **fail-open**; a strict error
  contract that never leaks SQL; structured pino logging correlated by
  `requestId`.

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
| Logging | Pino (+ pino-pretty in dev) |
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
**[docs/architecture.md](docs/architecture.md)** for the full design.

## Project structure

```
src/
├─ config/        env validation (zod) — the only place process.env is read
├─ core/          portable RBAC engine (auth, rbac, guard, audit hook, logger)
├─ db/            schema.ts (source of truth), relations, migrations, seed
├─ features/      auth · users · university · admin · clubs · announcements ·
│                 gallery · notifications · audit  (routes/service/repo/…)
├─ middlewares/   error · rate-limit · request-logger · verified/active-user
├─ shared/        rbac cache/repo · mail · redis · ws · logger · utils
└─ index.ts       app wiring + Bun WebSocket export
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
| `bun run db:generate` | Generate a SQL migration from `schema.ts` |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:push` | Push schema without a migration file |
| `bun run db:seed` | Seed universities, roles and sample data |
| `bun run db:sync-permissions` | Backfill permission keys into an existing DB |

## Environment

Validated at startup via `src/config/env.ts` (Zod) — the app **fails fast** with
a clear message on any invalid/missing var. Required: `PORT`, `NODE_ENV`,
`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`. Mail (`SMTP_*`, `MAIL_FROM`,
`APP_URL`) and rate-limit vars have dev defaults. See
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

## API & docs

- **[docs/API.md](docs/API.md)** — REST endpoint reference
- **[docs/architecture.md](docs/architecture.md)** — full system design
- **[docs/frontend/](docs/frontend/)** — per-surface frontend integration guides
- **[docs/design/](docs/design/)** — RBAC model design notes & scenarios

## Contributing

Branching model, commit convention and code rules live in
**[CONTRIBUTING.md](CONTRIBUTING.md)**. Work branches from `develop`; `main` is
protected and holds tagged releases.

## License

[MIT](LICENSE) © Mustafa Kurt
