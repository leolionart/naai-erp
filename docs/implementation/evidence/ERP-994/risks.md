# ERP-994 — Risks & Follow-ups

- 31 legacy files remain in `scripts/file-size-baseline.json` (web workspaces, `pg-banking.store.ts`, `pg-report-export.store.ts`, `import-workbooks.ts`, `seed-local-demo.mjs`, etc.); the file-size ratchet prevents them from growing and allows incremental splitting in future batches.
