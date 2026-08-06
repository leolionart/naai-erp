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
IMAGE_TAG=<immutable-git-sha>
```

`POSTGRES_PASSWORD` is required by Compose. For releases, use an immutable Git SHA in `IMAGE_TAG`; `main` is only a convenience default for manual previews.

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

Set `IMAGE_TAG` to the previous immutable Git SHA and recreate application services:

```bash
IMAGE_TAG=<previous-git-sha> docker compose --env-file .env.production pull
IMAGE_TAG=<previous-git-sha> docker compose --env-file .env.production up -d --wait
```

Database migrations are forward-only. Before rollback, confirm that the previous application image remains compatible with the migrated schema. Restore PostgreSQL from the approved backup procedure if a schema rollback is required.
