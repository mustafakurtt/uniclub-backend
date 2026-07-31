# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A multi-tenant ("SaaS") backend for a university club management system (think: student clubs, advisors, join requests, announcements) — one deployment serves many universities, tenant-scoped by `universityId`. Built with Bun + Hono + Drizzle ORM + PostgreSQL, with Redis/BullMQ for background jobs.

Code comments, commit-style notes, and API-facing error messages throughout the codebase are written in Turkish. Preserve this convention when editing existing files.

## Commands

Runtime is **Bun**, not Node — use `bun`/`bunx`, not `npm`/`npx`.

```sh
bun install                # install deps
bun run dev                # start dev server with --hot reload (src/index.ts), http://localhost:3000
docker-compose up -d       # start local Postgres (5432) + Redis (6379) — required before `dev`

bun run db:generate        # drizzle-kit generate — create SQL migration from schema.ts changes
bun run db:migrate         # drizzle-kit migrate — apply pending migrations
bun run db:push            # drizzle-kit push  — push schema directly without a migration file
bun run db:seed            # bun run src/db/seed.ts — seeds 3 universities (tenant-isolation scenarios), the 9-role RBAC catalog + bundles, sample users for every role, clubs in every status, applications, memberships
bun run db:reset           # drop + generate + migrate + seed, in one shot (interactive — drizzle-kit drop prompts)

bun run typecheck          # tsc --noEmit — the check CI runs; must pass before pushing

bun run test:setup         # provision the isolated `uniclub_test` DB (drop + migrate + seed) — run once before `test`
bun run test               # bun test — integration tests (Hono app.request against real Postgres/Redis)
bun run test:all           # test:setup + test, in one shot
bun run docs:check         # markdown link + API mount coverage (CI)
```

Full architecture: [docs/architecture/overview.md](docs/architecture/overview.md). Doc index: [docs/README.md](docs/README.md).

Quality gates are `typecheck`, `test`, and `docs:check` (both run in CI — see `.github/workflows/ci.yml`). There is still **no lint script**, so don't assume `bun run lint` exists. The tests are integration-style: they exercise the full middleware chain (auth, RBAC `guard()`, tenant scope) via Hono's `app.request()` against a **separate `uniclub_test` database** and Redis DB index 1, so they never touch dev/CI data. `tests/provision.ts` drops+recreates+seeds that DB each run (deterministic seed → tests key off fixed emails); `tests/setup.ts` is the `bunfig.toml` preload that repoints env **before** `src/config/env.ts` reads it. `app` is exported from `src/index.ts` for this — importing it does not start `Bun.serve` (that only happens when the file is the entrypoint).

**Branching**: `main` is protected (PR + green CI + 1 approval); daily work branches off `develop`. Never commit straight to `main`. See `CONTRIBUTING.md`.

**Environments are not branches.** `main` and `develop` hold identical files. Dev/prod differ by env vars and by build scope — `.dockerignore` keeps `docs/`, `.github/` and dev tooling out of the production image (`Dockerfile`, `docker-compose.prod.yml`).

Required env vars (validated at startup, see below): `PORT`, `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`. Mail-related vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `APP_URL`) and rate-limit vars (`RATE_LIMIT_DISABLED`, `TRUST_PROXY`) all have dev defaults. Boolean env vars go through the `envBoolean` helper in `env.ts`, **not** `z.coerce.boolean()` — the latter turns the string `"false"` into `true`.

`docker-compose` brings up Postgres (5432), Redis (6379) and **Mailpit** — a fake SMTP server on 1025 with a web inbox at http://localhost:8025 where the verification emails land.

## Architecture

Full design lives in [docs/architecture/overview.md](docs/architecture/overview.md). Read that (and the linked sub-docs) before touching schema, RBAC, cache, or notifications. Agent-critical rules below — do not violate them.

**Layering:** `src/features/<feature>/` — `*.routes.ts` → `*.service.ts` → `*.repository.ts` (+ `*.schema.ts`, `*.types.ts`, `*.permissions.ts`). Only repositories import `db`/`schema`. Services throw **`HttpError`** (`shared/utils/errors.ts` + `MessageKey`); routes have **no** `try/catch` (`app.onError` handles everything).

**RBAC:** Global claim layer (`guard(permissionKey, { tenantScoped? })` = auth → attachAuthz → audit → requirePermission [→ enforceTenantScope]) vs per-club layer (`clubMembers.role`). Permission keys in each feature's `*.permissions.ts`; seed imports the same constants. `core/` is portable; `shared/rbac/` is schema-coupled. Details: [core-middleware.md](docs/architecture/core-middleware.md), [design/06-rol-mimarisi-yeniden-tasarim.md](docs/design/06-rol-mimarisi-yeniden-tasarim.md).

**Schema invariants** ([planning/schema-product.md](docs/planning/schema-product.md)): `timestamptz` via `base.entity.ts`; every FK has explicit `onDelete`; composite tenant locks on `clubMembers`/`clubAdvisors`/`clubGallery`/`announcements`/`clubApplications`; user delete = anonymization (`deletedAt` → empty permissions + suspended in RBAC cache). Use `compositeForeignKey` helper, not drizzle's `foreignKey()`.

**Cache:** `getOrSet` never caches null; fail-open reads; explicit `delete` rethrows. Each feature: `*.cache.ts` with entries + effects; wire invalidation via route `invalidates()` or service `effect.emit()`. Coverage: `tests/unit/cache-coverage.test.ts`. Full record: [docs/architecture/cache/](docs/architecture/cache/).

**Auth & gating:** JWT HS256 7-day (`{ userId, universityId, exp }`). Tenant from email domain at register. `requireActiveUser` / `requireVerifiedUserForWrites` read status from RBAC cache — invalidate on status changes. Rate limits keyed by identity, not IP.

**Jobs & real-time:** Email verification via BullMQ + Mailpit locally ([mail-verification.md](docs/architecture/mail-verification.md)). Notifications persisted + WebSocket ticket handshake ([notifications.md](docs/architecture/notifications.md)); call `notifySafe()` so delivery failures never fail the business write.

**Logging & audit:** Scoped pino loggers only ([logging.md](docs/operations/logging.md)). Mutating `guard()` requests auto-audit to `audit_logs` (read-only `audit.view` endpoint).

**Frontend integration docs:** [docs/integration/](docs/integration/) (Turkish). API catalog: [docs/reference/api.md](docs/reference/api.md).
