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

Deployment is **pull-based**. GitHub never connects to the production machine;
the production machine reads GitHub and deploys itself.

```
  main'e merge ──▶ CI (GitHub) ──▶ release cut by a human
                                         │
                    production machine ──┘  (polls, reads only)
                    scripts/deploy-agent.sh
                                         │
                    scripts/deploy-local.sh ──▶ http://localhost:8080
```

A self-hosted GitHub Actions runner would be the push-based alternative, but on
a **public** repository it lets a fork's pull request execute code on the runner
— GitHub itself advises against it. The pull model has no inbound connection,
and the only code it ever runs is a published release of this repository.

### Trust chain

1. Code reaches `main` only through a pull request (branch protection).
2. It cannot merge without a green CI.
3. A human cuts the release — **this is the deployment gate**.
4. [`deploy-agent.sh`](../scripts/deploy-agent.sh) deploys only the latest
   release, and only if that commit has a successful CI run.

### The two scripts

[`deploy-agent.sh`](../scripts/deploy-agent.sh) — polls for a new release,
checks out a **separate clone** (`~/uniclub-prod`) so nothing from a development
working copy can leak into production, and hands off to:

[`deploy-local.sh`](../scripts/deploy-local.sh) — backs up the database, builds
the image tagged with the release, applies migrations from a **separate migrator
image** (the production image deliberately has no `drizzle-kit`), restarts the
app and waits for `/health`. If health never turns green it **rolls back to the
previous image**.

```sh
./scripts/deploy-agent.sh            # check once
./scripts/deploy-agent.sh --watch    # poll every 5 minutes
```

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) still builds
and smoke-tests the image on every push, so a release candidate that compiles
but cannot start is caught before anyone tags it.

### Two stacks on one machine

Development and production run side by side and share nothing:

| | development | production |
| --- | --- | --- |
| Compose | `docker-compose.yml` | `docker-compose.prod.yml` (project `uniclub-prod`) |
| App | `bun run dev` on `:3000` | container on `:8080` |
| Database port | `5432`, exposed | **not exposed** |
| Volume | `universityclub_pgdata` | `uniclub-prod_pgdata` |
| Data | seeded fixtures | real data, never seeded |
| Env file | `.env` | `.env.prod` |

Both are gitignored; `.env.prod.example` documents what production needs.

### Rollback

Prefer rolling forward. `deploy-local.sh` rolls back automatically when the new
release fails its health check. To roll back deliberately, redeploy the previous
release tag:

```sh
IMAGE_TAG=v1.1.0 ./scripts/deploy-local.sh
```

Migrations do **not** roll back. If the bad release contained a destructive
migration, you need the backup — which is why destructive changes ship in a
separate release from the code that stops using the column.

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
