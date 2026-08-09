# ERP-865 Acceptance

- Project introduction targets one-person businesses: implemented in the README introduction.
- AI-native positioning and safety boundaries: documented under `Vì sao gọi là AI-native?`.
- Supported management domains: documented in expandable `<details>` sections.
- Docker Compose deployment: includes environment preparation, pull/start, health checks, local builds, upgrade, rollback and volume safety.
- Standalone deployment: explicitly requires only `compose.yaml` and `.env.production`; repository cloning is limited to local source builds.
- Documentation and Compose validation gates pass; exact commands are recorded in `tests.md`.
