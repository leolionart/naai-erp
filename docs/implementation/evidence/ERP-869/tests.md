# ERP-869 tests

- `pnpm --filter @naai-erp/domain test` — PASS, 37 files / 188 tests.
- Focused executive-metric API suites — PASS, 2 files / 10 tests.
- Executive-metric browser E2E — PASS, 6 tests.
- Domain/API/web typecheck — PASS.
- Documentation verification — PASS.
- Release workflow `31318388559` — PASS for packaging, API, worker and web at
  `7e6f5f5521a7a44e92a4fe24599283ddb889cd7c`.
- Production web readback — `naai-erp-web-1`, image digest `sha256:5d231d6b...`, OCI revision
  `7e6f5f5521a7a44e92a4fe24599283ddb889cd7c`, `healthy`, no image update available;
  `/login` and `/api/v1/capabilities` return HTTP 200.
- Production financial-statement mapping `demo-tt133:3` — approved with 33 lines.
- Production cash-flow readback — reviewed AR receipts are operating; unresolved clearing sources
  remain `review_required`.
- Rendered localhost verification against production data — PASS for landing, equity, liquidity,
  profitability, returns and ROI routes; metric source dialog also renders the source fingerprint,
  formula and cutoff.
