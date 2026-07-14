# Architecture

A multi-tenant SaaS backend where **one deployment serves many universities**,
each isolated by `universityId`. The design favors a strict, testable layering
and a portable RBAC engine that could be lifted into another Bun/Hono project.

## Request lifecycle

```
HTTP request
   │
   ▼
requestId ─▶ metrics ─▶ secureHeaders ─▶ bodyLimit ─▶ locale ─▶ request logger ─▶ CORS
   │   (global middleware: correlation id, Prometheus timing, security headers,
   │    body-size cap → 413, Accept-Language, structured log line, CORS allowlist)
   ▼
authMiddleware        (verify JWT, attach typed `user` to context)
   │
   ▼
attachAuthz           (resolve effective roles/permissions from cache;
   │                   reject suspended users → 403)
   ▼
auditTrail(key)       (wrap next(); record mutating calls, incl. denials)
   │
   ▼
requirePermission(key) / enforceTenantScope
   │
   ▼
route handler ──▶ zValidator (zod) ──▶ service ──▶ repository ──▶ Drizzle ──▶ Postgres
                                          │
                                          └─▶ notifySafe / mail queue (BullMQ) / pub-sub
```

The five middleware above are composed once by `guard(permissionKey, { tenantScoped })`
in [`src/core/rbac/guard.ts`](../src/core/rbac/guard.ts), so every protected route
imports one thing instead of re-declaring the chain.

## Layering (per feature)

Each feature under `src/features/<feature>/` is split by concern:

| File | Responsibility |
| --- | --- |
| `*.routes.ts` | Hono routes, request validation (`zValidator` + zod), response shaping |
| `*.service.ts` | Business rules; throws plain `Error` with a user-facing (Turkish) message |
| `*.repository.ts` | **The only layer that touches `db`/`schema`** |
| `*.schema.ts` | zod request schemas + inferred DTO types |
| `*.types.ts` | Drizzle-inferred entity types + payload interfaces |
| `*.permissions.ts` | `as const` catalog of the feature's permission keys |

**Error contract:** services signal business-rule failures with a *plain*
`new Error(...)`. The error handler distinguishes these from infrastructure
errors via `err.constructor === Error` (pg/drizzle/runtime errors are always
subclasses), returning `400/404` with the message, or a generic `500` that
never leaks SQL — correlated to the server log by `requestId`.

## Multi-tenancy

```
universities
  └─ universityDomains   (student / staff email domains)
       └─ faculties
            └─ departments
users.universityId        (denormalized — fast tenant-scoped queries)
```

Registration **infers the tenant from the email domain** (`user@<domain>` looked
up in `universityDomains`) rather than an explicit selector — no match, no
registration. `enforceTenantScope` compares a `:universityId` path param to the
caller's own tenant; only `super_admin` / `platform_support` bypass it.

## Two-layer authorization

1. **Global claim layer** — `roles`, `permissions`, `rolePermissions`,
   `userRoles`, `userPermissions`. Ships a **9-role enterprise model**
   (`super_admin`, `platform_support`, `university_admin`, `student_affairs`,
   `academic_affairs`, `content_moderator`, `auditor`, `advisor`, `student`).
   `roles.universityId` is nullable: a role is either a global template or
   tenant-scoped. A per-user `userPermissions.granted` override applies on top
   of the role union — **deny wins**.
2. **Per-club layer** — `clubMembers.role` (`member` / `officer` / `president`),
   enforced separately by `club.middleware`. Deliberately not conflated with
   the global layer.

Effective permissions (+ account `status`) are computed in
`shared/rbac/rbac.repository.ts` and cached read-through in Redis (300s TTL);
any status/role change must invalidate the cache so suspensions take effect on
the next request.

## Portable core vs. project-coupled shared

`src/core/` is intentionally project-agnostic — a reusable Bun/Hono/Drizzle
backend toolkit that never reads `env` or knows a project field/role name.
Everything project-specific is **injected** via a `createX(options)` /
`configureX(...)` / `registerX(...)` seam (the recurring pattern). It spans:

| Area | What core provides (mechanism only) |
| --- | --- |
| `config` | `createEnv` (zod validation), `envBoolean` |
| `logger` | `createLogger` (pino factory, `LogLevel`, redaction) |
| `http` | `HttpError` + `createErrorHandler`, `createResponder`, `createValidator`, `createRequestLogger`, `createShutdownManager` |
| `db` | `BaseRepository` (CRUD, soft-delete, keyset, composite-where guard, tx) + column sets |
| `auth` | JWT factory, password hashing, `authMiddleware` (empty `AuthClaims`) |
| `rbac` | `attachAuthz`, `requirePermission`, `enforceTenantScope`, `guard()` composer, audit hook |
| `cache` | `CacheStore` port + memory/redis/null adapters + `Cache` facade (`getOrSet` single-flight, **fail-open**) |
| `redis` | `createRedisClient` |
| `i18n` | `createTranslator`, `defineCatalog`, locale middleware |
| `mail` | `createMailer` (SMTP, optional pool) |
| `metrics` | `createMetrics` (Prometheus registry + HTTP instruments + `/metrics`) |

The schema-coupled counterparts live in `src/shared/` (e.g. `shared/rbac/`),
which fill those seams with this project's env, Drizzle relations and Turkish
message catalog. The RBAC pair touches at exactly one seam: core reads back
through the shared Redis cache.

## Operational hardening & observability

- **Graceful shutdown** — `createShutdownManager` (core) runs registered cleanup
  tasks in order on `SIGTERM`/`SIGINT` (HTTP drain → queue → redis → db → mailer)
  with a timeout backstop, so deploys don't drop in-flight work.
- **HTTP hardening** — `secureHeaders`, an env-driven CORS allowlist
  (`CORS_ORIGINS`), and a request `bodyLimit` (`MAX_BODY_BYTES` → 413).
- **Cache resilience** — the `Cache` facade is **fail-open**: a transient Redis
  error on reads becomes a miss (recompute from source) and `getOrSet` writes are
  best-effort, so a Redis blip never fails an authenticated request. Explicit
  `delete` (invalidation) still propagates — a missed invalidation is a correctness bug.
- **Observability** — structured pino logs shipped by **Vector → Loki**, plus
  **Prometheus** metrics (`/metrics`) scraped into **Grafana**. See
  [docs/LOGLAMA.md](LOGLAMA.md).

## Realtime notifications

Persisted to a `notifications` table **and** pushed live over Bun's native
WebSocket (`hono/bun`). Handshakes can't carry an `Authorization` header, so
auth uses a **single-use 60s ticket** (Redis `SETEX` → consumed with `GETDEL`
on upgrade) instead of a token in the query string. Cross-instance fan-out goes
through Redis Pub/Sub on a dedicated subscriber connection (ioredis forbids
normal commands on a connection in subscriber mode).

## Background jobs & rate limiting

- **Email verification** runs through a BullMQ queue/worker sending via
  `nodemailer`; locally captured by **Mailpit**. Retries 3× with exponential
  backoff. Going to production changes env vars, not code.
- **Rate limiting** uses Redis fixed-window counters, **fail-open** if Redis is
  down, keyed by the *identity of the protected resource, not the IP* — students
  share one campus NAT IP, so an IP-keyed limit would lock out a whole university.

## Audit trail

Every mutating request through `guard()` is recorded to an append-only
`audit_logs` table (actor, action = permission key, method/path/status, derived
target, redacted body, ip) by a project-registered sink. Denied attempts land
in the log with status 403. There are deliberately **no write/delete endpoints**
— only a cursor-paginated read gated behind `audit.view`.
