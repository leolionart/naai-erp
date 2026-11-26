# ERP-977 Tests

- `apps/api/src/expenses/expense.integration.test.ts`: verified `by-external` funding reclassification + `postReplacement: true` posts the replacement in one command on scratch Postgres DB (`RUN_DB_INTEGRATION=1`).
- `apps/api/src/commercial-documents/commercial-document.reclassify.test.ts` and `commercial-document.service.test.ts`: verified existing unit expectations pass.
- Repo gates (`verify-docs.mjs`, `verify-solopreneur-gate-matrix.mjs`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) verified.
