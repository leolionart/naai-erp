# Gate G4 test evidence

## Local verification

```sh
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" TURBO_FORCE=true pnpm check
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm db:check
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm test:e2e
```

Results:

- full check passed with 22 domain files / 121 tests, 13 contract tests, 116 CLI tests, 17 API unit suites / 45 tests and 13 web unit/component files / 28 tests;
- migration directory valid with 23 entries, including one clean ERP-440 migration;
- `GF-BANK-001`, `GF-TRANSFER-001` and `GF-AGING-001` all pass independent exact-money verification;
- Playwright desktop/mobile: 15/15 passed, including statement session create, URL filters, close blockers, reasoned exception approval, safe close and responsive detail;
- localhost `/banking/statements` and API health return HTTP 200;
- runtime OpenAPI preserves prior resources and exposes statement-session paths/schemas.

## Consolidated PostgreSQL proof

Authored tests cover:

- statement opening plus transaction movement equals closing balance;
- imported/duplicate/rejected counts and amounts explain every raw row;
- all accepted bank transactions are reconciled, ignored with reason, or linked to an approved exception;
- unapproved suspense balance is zero;
- settlement/reversal and transfer journals balance;
- AR/AP control variances are zero and supplier advance is exercised in PostgreSQL;
- cross-organization access is denied.

Exact-commit GitHub CI passed all PostgreSQL suites and Playwright at https://github.com/leolionart/naai-erp/actions/runs/31031720108 for proof commit `602d9f8ce8b96acb21f5f414ccbb9c9acbd9b2e5`, keeping G4 accepted and G5 unlocked.
