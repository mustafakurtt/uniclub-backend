# Contributing

Thanks for working on UniClub. This guide covers the branching model, the daily
workflow, and the conventions the codebase expects.

## Branching model

```
main      ← protected. Production-ready. Only via PR from develop (or hotfix/*).
  ▲
develop   ← integration branch. All feature work merges here first.
  ▲
feature/* ← one branch per unit of work
```

| Branch | Purpose |
| --- | --- |
| `main` | Always deployable. Tagged releases (`v1.2.0`) are cut from here. |
| `develop` | Integration. CI must be green. |
| `feature/<short-name>` | New work. Branch from `develop`. |
| `fix/<short-name>` | Bug fix targeting `develop`. |
| `hotfix/<short-name>` | Urgent production fix. Branch from `main`, merge to **both** `main` and `develop`. |

> **Branches are not environments.** `main` and `develop` contain the same
> files. Environment differences live in env vars and in what the build includes
> (see [`.dockerignore`](.dockerignore)) — never in which files a branch carries.

## Daily workflow

```sh
git switch develop && git pull                # start from the latest develop
git switch -c feature/club-search             # your branch

# ... work, committing as you go ...

bun run typecheck                             # must pass before you push
git push -u origin feature/club-search
gh pr create --base develop                   # or use the VS Code GitHub PR extension
```

A teammate reviews, CI runs, then **squash merge** into `develop` — this keeps
`develop` history one clean commit per unit of work.

### Cutting a release

> **Use a merge commit for `develop → main` — never squash.** A squash rewrites
> develop's commits into a brand-new SHA on `main`, so `main` stops being an
> ancestor of `develop` and the two branches read as "diverged" forever after
> (even though their content is identical). A merge commit keeps `main` a true
> superset of `develop`. (Squash is only for `feature → develop`, above.)

```sh
gh pr create --base main --head develop --title "release: v1.1.0"
gh pr merge --merge          # merge commit, NOT --squash
# after merge:
git switch main && git pull
git tag -a v1.1.0 -m "v1.1.0" && git push origin v1.1.0
gh release create v1.1.0 --generate-notes
```

## Commit convention

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject in imperative mood>
```

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`.
Scopes are usually the feature folder: `auth`, `clubs`, `notifications`, `db`, `core`.

```
feat(clubs): add full-text search to club browsing
fix(auth): invalidate permission cache on email verification
```

## Code conventions

Read [docs/architecture.md](docs/architecture.md) first. The non-negotiables:

- **Language.** Code comments and user-facing API messages are **Turkish**.
  README and architecture docs are English.
- **Layering.** `routes → service → repository`. Only repositories import
  `db`/`schema`. Services never touch the database directly.
- **Errors.** Business-rule failures throw a *plain* `new Error("Türkçe mesaj")`.
  Infrastructure errors (pg, drizzle, TypeError) are subclasses and become a
  generic 500. Route `catch` blocks call `respondWithBusinessError(c, error)`.
- **Env.** Never read `process.env` in app code — go through `src/config/env.ts`.
  New vars must be added to `.env.example` and validated with Zod.
- **Logging.** Never `console.*`. Use `logger.child({ module: "..." })`.
- **Permissions.** Add keys to the feature's `*.permissions.ts`. Split read
  (`*.view`) from write — never gate a GET behind a write permission.
- **Migrations.** Schema changes require `bun run db:generate` and the generated
  SQL committed alongside.

## Local setup

See the [README](README.md#getting-started). In short:

```sh
bun install
cp .env.example .env        # set JWT_SECRET
docker-compose up -d        # Postgres + Redis + Mailpit
bun run db:migrate && bun run db:seed
bun run dev
```

## Before you open a PR

- [ ] `bun run typecheck` passes
- [ ] Migration committed if `schema.ts` changed
- [ ] New env vars in `.env.example` **and** `src/config/env.ts`
- [ ] Docs updated where behavior changed
