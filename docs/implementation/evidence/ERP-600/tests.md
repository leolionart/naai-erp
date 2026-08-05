# ERP-600 test evidence

## Local results

The following focused checks pass in the current worktree:

```sh
node tests/fixtures/golden/GF-FORECAST-001/verify.mjs
pnpm --filter @naai-erp/domain test
pnpm --filter @naai-erp/contracts test
pnpm --filter @naai-erp/web typecheck
pnpm --filter @naai-erp/web test
pnpm --filter @naai-erp/web exec playwright test e2e/planning.spec.ts
pnpm --filter @naai-erp/web build
```

Verified behavior:

- `GF-FORECAST-001` hashes and manually reviewed target/scenario/control rows pass its fixture-local verifier.
- Domain planning tests cover exact target values, version sequences, calendar boundaries, explicit actual basis, scenario separation and month-end immutability.
- Public contract tests retain exact money strings and machine-readable scenario/snapshot metadata.
- Web typecheck, component/unit suite and production build pass.
- Targeted Playwright passes 4/4 desktop/mobile planning journeys.

## Exact-commit proof

The complete GitHub quality job passed for exact proof commit `1e84c0d2ebd6b31231128a0332eb2bf945734ce5`, including PostgreSQL migration/integration tests and 34 desktop/mobile Playwright scenarios: https://github.com/leolionart/naai-erp/actions/runs/31056116463.
