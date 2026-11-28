# ERP-1013 — Acceptance

- `BR-AI-007` (Session-token isolation): `/auth/automation-token` returns `410 Gone` (`OWNER_SESSION_TOKEN_RETIRED`) with zero session or Keychain token disclosure; internal `isOwnerCredential` rows are hidden from external Service Key tables and immutable via integration endpoints.
- `BR-AI-001` & `BR-AI-002` (Self-service Service Keys & Webhooks across REST, OpenAPI, CLI, and Web UI): verified via `T-UNIT-ERP-1013-001`, `T-CLI-ERP-1013-002`, `T-E2E-ERP-1013-003`, `openapi-v1.json`, and `solopreneur-gate-matrix.json`.
- `BR-UI-008` & `BR-SIZE-001` (DLS compliance & ≤500 code lines per file): verified via `dls-compliance.test.ts` and `pnpm check:file-size`.
