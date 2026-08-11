# Deployment foundation

Dockerfiles, Compose contracts and release workflows are implemented in ERP-800 through ERP-852.

The production Compose stack is [compose.yaml](../compose.yaml). It runs PostgreSQL, a one-shot
migration, API, worker and web services. Runtime images are the explicit GHCR packages published
by `.github/workflows/release-main.yml`; [compose.build.yaml](../compose.build.yaml) only replaces
those images with local builds for development verification.

Start from [env/.env.example](env/.env.example) and follow
[the release runbook](../docs/runbooks/docker-compose-release.md). Production intentionally follows
the matching `latest` tags for migrate, API, worker and web. Use the supported update command so the
one-shot migration is recreated and completed before the runtime services restart.
