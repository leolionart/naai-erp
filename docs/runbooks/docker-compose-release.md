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
IMAGE_TAG=sha-<first-12-characters-of-git-sha>
```

`POSTGRES_PASSWORD` is required by Compose. The release workflow publishes four matching packages:

- `ghcr.io/leolionart/naai-erp-api`
- `ghcr.io/leolionart/naai-erp-web`
- `ghcr.io/leolionart/naai-erp-worker`
- `ghcr.io/leolionart/naai-erp-migrate`

Each package receives `main` and `sha-<first-12-characters-of-git-sha>` tags. Use the immutable
`sha-*` tag in `IMAGE_TAG`; `main` is only a convenience default for manual previews. All four
services must use the same tag so the migration and runtime code stay on one release.

The four `NAAI_ERP_LOGIN_*` values are server-only. Never rename them to `NEXT_PUBLIC_*`, commit
their real values, or use an API token that is not backed by an active organization membership and
RBAC roles. The login route exchanges a valid username/password for that existing token; it does not
bypass API authorization.

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

Pull the exact release and start it:

```bash
docker compose --env-file .env.production pull
docker compose --env-file .env.production up -d --wait
```

The ordering is deliberate:

1. PostgreSQL becomes healthy.
2. `migrate` runs once and must exit successfully.
3. API and worker start only after migration succeeds.
4. Web starts only after the API readiness check succeeds.

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

## Rollback

Set `IMAGE_TAG` to the previous immutable workflow tag and recreate application services:

```bash
IMAGE_TAG=sha-<previous-12-character-git-sha> docker compose --env-file .env.production pull
IMAGE_TAG=sha-<previous-12-character-git-sha> docker compose --env-file .env.production up -d --wait
```

Database migrations are forward-only. Before rollback, confirm that the previous application image remains compatible with the migrated schema. Restore PostgreSQL from the approved backup procedure if a schema rollback is required.
