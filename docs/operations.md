# Operations Runbook

How UniClub moves from a laptop to production: environments, schema changes,
backups, deploys, and what to do when something breaks.

> Companion docs: [architecture.md](architecture.md) for system design,
> [CONTRIBUTING.md](../CONTRIBUTING.md) for the branching model.

## Environments

Every environment runs **the same code**. What differs is configuration, the
database it points at, and whether the data is real.

| | local | development | production |
| --- | --- | --- | --- |
| Runs on | your machine | GitHub environment `development` | GitHub environment `production` |
| Deployed from | — | `develop` branch | `main` branch |
| Approval | — | none | **manual, required** |
| Database | Docker Postgres | dev instance | live instance |
| Data | seeded fixtures | seeded / anonymized | **real user data** |
| Mail | Mailpit (captures all) | real SMTP, test inbox | real SMTP |
| Compose file | `docker-compose.yml` | — | `docker-compose.prod.yml` |

**Branches are not environments.** `main` and `develop` carry identical files.
The difference lives in environment variables and in build scope — see
[`.dockerignore`](../.dockerignore), which keeps `docs/`, `.github/` and dev
tooling out of the production image.

### Configuration

All config is validated at startup by [`src/config/env.ts`](../src/config/env.ts).
The app **fails fast** with a clear message if anything is missing or malformed;
it never boots half-configured.

Secrets live in GitHub **environment** secrets, not repository secrets, so a
workflow running on `develop` can never read production credentials.

Before the first real production deploy, `production` needs:

| Name | Kind | Set? |
| --- | --- | --- |
| `JWT_SECRET` | secret | ✅ |
| `APP_URL` | variable | ✅ |
| `DATABASE_URL` | secret | ⬜ pending a real database |
| `REDIS_URL` | secret | ⬜ |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | secret | ⬜ |

Each environment gets its **own** `JWT_SECRET`. Sharing one across environments
means a token minted in dev is valid in production.

## Schema changes (migrations)

Schema is defined in [`src/db/schema.ts`](../src/db/schema.ts). Changing it means
generating a migration and committing the SQL alongside the code:

```sh
bun run db:generate      # writes src/db/migrations/<timestamp>_<name>/
bun run db:migrate       # applies pending migrations locally
```

CI applies every migration to a **clean** database on each run, so a migration
that only works on your machine fails before it reaches anyone else.

### Two rules that are not negotiable

**Never edit a migration that has already run anywhere.** Once applied in
production, its checksum is recorded. Editing it desynchronizes the schema from
the migration history. Fix forward — write a *new* migration. (Same instinct as
`git revert` over rewriting pushed history.)

**Make schema changes backward compatible.** During a deploy, old and new code
run simultaneously for a moment. Dropping a column the old code still reads will
crash it. Split destructive changes across two releases:

1. Release A — stop reading/writing the column; deploy.
2. Release B — the migration that drops it; deploy.

The same applies to renames: add the new column, backfill, switch the code, then
drop the old one.

### Ordering vs. deploy

Migrations run **before** the new code starts. Because they are backward
compatible (above), the currently running old code keeps working against the new
schema until it is replaced.

## Backups

```sh
bun run db:backup                          # → backups/uniclub_<timestamp>.dump
bun run db:restore backups/<file>.dump     # → restores into uniclub_restore_test
```

[`scripts/db-backup.sh`](../scripts/db-backup.sh) takes a `pg_dump` custom-format
archive (compressed, supports partial and parallel restore), then **verifies it
by reading the archive back**. A dump that cannot be read is deleted rather than
silently kept. Files older than `RETENTION_DAYS` (default 7) are pruned.

[`scripts/db-restore.sh`](../scripts/db-restore.sh) restores into a scratch
database by default and **refuses to overwrite the live one** unless you pass
`CONFIRM_OVERWRITE=evet`. This is deliberate: the muscle-memory version of the
restore command must not be the one that destroys production.

`backups/` is gitignored. Dumps contain real user data and never enter the repo.

### Policy

| Term | Meaning | Target here |
| --- | --- | --- |
| **RPO** | How much data may we lose? | ≤ 24h (nightly dump); tighten with WAL archiving |
| **RTO** | How fast must we be back? | ≤ 1h from a dump |
| **3-2-1** | 3 copies, 2 media, 1 offsite | dump + object storage + a second region |

A `pg_dump` gives you last night. For "restore to 14:32 yesterday" you need
**PITR** — continuous WAL archiving on top of a base backup. Worth adding once
there is real user data.

**A backup you have never restored is not a backup.** Run a restore drill on a
schedule; `db:restore` exists precisely so the drill is one command.

### Restoring for real

```sh
# 1. Stop writes (take the app down or put it in read-only).
# 2. Restore into a fresh database first and verify counts.
bun run db:restore backups/uniclub_20260710_114029.dump
# 3. Only once verified, point the app at it — or overwrite deliberately:
CONFIRM_OVERWRITE=evet TARGET_DB=uniclub bun run db:restore backups/<file>.dump
```

## Deploys

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml):

1. **Build & smoke-test image** — builds the production image, applies migrations
   to a clean database, boots the container and waits for `/health`. A build that
   compiles but cannot start never proceeds.
2. **Deploy** — `develop` → `development` (automatic), `main` → `production`
   (**blocks for manual approval** because the `production` environment has a
   required reviewer).

The deploy step itself is not wired to a host yet. When a target is chosen
(Fly.io, Railway, a VPS), it slots into that step; nothing else changes.

### Rollback

Prefer rolling forward. When you cannot, redeploy the previous image tag — the
tag is the short commit SHA, so `git log` tells you what to redeploy. Migrations
do **not** roll back automatically; if the bad release included a destructive
migration, you need the backup. This is why destructive changes ship separately
from the code that stops using the column.

## Incidents

1. **Confirm.** Check `/health` and the logs. Every error response carries a
   `requestId`; the matching server log line has the stack trace.
2. **Stop the bleeding.** Roll back or disable the feature before diagnosing.
3. **Hotfix.** Branch from `main` (`hotfix/<name>`), fix, PR into `main`.
   Then merge `main` back into `develop` so the fix is not lost.
4. **Write it down.** What broke, why, what would have caught it earlier.

### Access

Never connect to the production database from a laptop to "just look." Ask for
read-only access if you must. Never run migrations by hand in production — the
pipeline runs them, so what happened is recorded.

Never copy production data to a development machine unless it has been
anonymized. Real names, emails and phone numbers are personal data; handling them
carelessly is a legal problem, not just a sloppy one.
