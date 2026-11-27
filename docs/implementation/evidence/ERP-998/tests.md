# ERP-998 — Tests

- `T-UNIT-READ-005`: `apps/cli/src/list-output.test.ts` passed (stdout budget, NDJSON/CSV export, `describe`, `openapi --tag`, `expenses` and `commercial-documents` `count`/`summary`).
- `T-INT-READ-006`: `apps/cli/src/route-golden.test.ts` passed (all resource/action/key routes match `route-golden.json`).
- `pnpm check`: passed across all workspaces.
