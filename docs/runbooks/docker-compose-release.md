# Docker Compose release runbook

## Scope

This runbook covers the production packaging contract for PostgreSQL, the one-shot database migration, API, background worker, and web application. It does not add automated deployment; image publishing is owned by the release workflow.

## Required configuration

Create a deployment-only environment file that is not committed:

```dotenv
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=naai_erp
POSTGRES_USER=naai_erp
APP_BASE_URL=https://erp.example.com
SESSION_SECRET=<at-least-32-random-characters>
WEBHOOK_SIGNING_SECRET=<at-least-32-random-characters>
NAAI_ERP_LOGIN_USERNAME=owner
NAAI_ERP_LOGIN_PASSWORD=<strong-random-password>
NAAI_ERP_LOGIN_ORGANIZATION=<organization-id>
NAAI_ERP_LOGIN_API_TOKEN=<active-organization-api-token>
IMAGE_TAG=latest
```

`POSTGRES_PASSWORD` is required by Compose. The release workflow publishes four matching packages:

- `ghcr.io/leolionart/naai-erp-api`
- `ghcr.io/leolionart/naai-erp-web`
- `ghcr.io/leolionart/naai-erp-worker`
- `ghcr.io/leolionart/naai-erp-migrate`

Each package receives `latest`, `main` and `sha-<first-12-characters-of-git-sha>` tags. Production
intentionally tracks `latest` across all four services. Do not change the production tag during a
normal update. The supported updater explicitly enforces `IMAGE_TAG=latest`, including when an older
environment file still contains another value.

The four `NAAI_ERP_LOGIN_*` values are server-only. Never rename them to `NEXT_PUBLIC_*`, commit
their real values, or use an API token that is not backed by an active organization membership and
RBAC roles. The login route exchanges a valid username/password for that existing token; it does not
bypass API authorization.

`SESSION_SECRET` encrypts the web login cookie and must be injected into both the API and web
containers. Keep the same strong value during normal application upgrades: changing or omitting it
invalidates all existing browser sessions and requires users to sign in again. Rotate it only as an
intentional security operation. The browser receives an encrypted `HttpOnly`, `Secure`, same-site
cookie; the underlying API token is never returned to or stored by browser JavaScript.

## Build locally

```bash
POSTGRES_PASSWORD=local-only docker compose \
  -f compose.yaml -f compose.build.yaml build
```

Validate the packaging contract without starting services:

```bash
node scripts/verify-compose.mjs
```

## Start or upgrade

Run the supported updater from the repository root:

```bash
pnpm prod:update
```

Pass a different deployment environment file only when its location differs:

```bash
pnpm prod:update -- /absolute/path/to/.env.production
```

The ordering is deliberate:

1. The matching `latest` images are pulled without changing the running application.
2. PostgreSQL is confirmed healthy, then web, worker and API are stopped for the schema change.
3. `migrate` is force-recreated from the pulled image and its non-zero exit code aborts the update.
4. API, worker and web are force-recreated only after migration succeeds.
5. Compose health, migration exit code, API readiness and web health are verified.

Do not rely on Watchtower to run migrations. A one-shot `migrate` container is normally exited, so
updating its image does not execute it. Watchtower may pull or recreate long-running containers, but
the repository update command remains the required production upgrade path.

Inspect the one-shot migration and runtime health:

```bash
docker compose --env-file .env.production ps -a
docker compose --env-file .env.production logs migrate
curl --fail http://localhost:3001/health/ready
curl --fail http://localhost:3000/health
```

The production reverse proxy must send `/api/*` on the public application origin to the API service
and all other paths to the web service. The browser client intentionally uses the current HTTPS
origin in production, while local development continues to default to `http://localhost:3001`.

## Persistence verification

The automated verifier uses an isolated Compose project, writes a sentinel row, recreates the stack without deleting its volume, verifies the row, then deletes only that isolated project and volume:

```bash
node scripts/test-compose-persistence.mjs
```

For production, confirm the named volume before any maintenance:

```bash
docker compose --env-file .env.production config --volumes
docker volume inspect naai-erp_postgres-data
```

Never use `docker compose down --volumes` against a production project.

## Recovery

Database migrations are forward-only. If migration fails, the updater leaves API, worker and web
stopped and reports the failing migration logs; repair the migration or restore PostgreSQL through
the approved backup procedure, then rerun the same `latest` updater. Do not switch production image
tags as an ad-hoc rollback because an older application may be incompatible with the migrated schema.
