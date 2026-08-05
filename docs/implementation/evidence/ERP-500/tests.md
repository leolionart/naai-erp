# ERP-500 test evidence

## Executed locally

```sh
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm --filter @naai-erp/domain typecheck
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm --filter @naai-erp/domain test
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm --filter @naai-erp/contracts typecheck
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm --filter @naai-erp/contracts test
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm --filter @naai-erp/cli typecheck
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm --filter @naai-erp/cli test
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm typecheck
```

Observed results during implementation:

- domain typecheck passed;
- domain: 23 files / 130 tests passed;
- contracts typecheck passed;
- contracts: 2 files / 16 tests passed;
- CLI typecheck passed;
- CLI: 2 files / 136 tests passed;
- full monorepo typecheck: 10/10 packages passed;
- scoped Prettier validation and `git diff --check` passed.

The domain suite covers workforce effective dates, timed overlap and boundary-touching entries, project/internal and billing classification, submit/reject/revise/approve transitions, maker/checker denial, effective-rate date boundaries, overlapping-rate rejection, deterministic positive/negative rounding, append-only adjustments, billing requirements and adjusted capacity summaries.

The contract suite verifies exact-string raw-rate and derived-cost fields. Client tests verify REST routing for workers, timesheets, adjustments, cost rates, capacity versions and capacity summary, including mutation idempotency and optimistic-version headers.

## Required before completion

```sh
RUN_DB_INTEGRATION=1 DATABASE_URL=postgresql://naai_erp:naai_erp@localhost:5432/naai_erp pnpm --filter @naai-erp/api test
pnpm --filter @naai-erp/web test
pnpm test:e2e
pnpm check
```

These pending gates must prove PostgreSQL organization isolation, concurrent overlap/rate approval safety, API idempotency, sensitive-rate RBAC/redaction, admin lifecycle interaction, responsive behavior and exact-commit CI. This document does not claim those unexecuted checks passed.
