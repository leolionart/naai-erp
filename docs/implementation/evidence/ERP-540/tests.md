# ERP-540 test evidence

## Local results

The following checks pass in the current worktree using the supported Node 22 runtime:

```sh
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm --filter @naai-erp/web typecheck
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm test:fixtures
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm --filter @naai-erp/web test:e2e -- project-profitability.spec.ts
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" TURBO_FORCE=true pnpm check
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm db:check
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm test:e2e
```

Verified behavior:

- `GF-PROJECT-001` hashes, exact profitability layers, KPI denominators and control ties pass its fixture-local verifier and the repository fixture verifier.
- Desktop Playwright covers `T-E2E-ERP-540-001`, confidence flags, dedicated drill-down and URL-backed report filtering.
- Mobile Playwright covers the queue and project drill-down without body overflow.
- Web TypeScript validation passes.
- Full monorepo check/build passes; migration directory validates with 27 entries.
- Full Playwright suite passes 30/30 after correcting the filter Sheet scroll boundary.

## Pending proof

These are local current-worktree results. The PostgreSQL profitability integration test is authored but requires exact pushed-commit CI before ERP-540 or Gate G5 can be marked done.
