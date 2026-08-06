# ERP-800 Tests

- `T-INT-ERP-800-001`: dry-run inventory and deterministic review-row classification.
- `T-INT-ERP-800-002`: atomic/idempotent staging persistence, organization isolation, version conflict and audit proof.
- `T-E2E-ERP-800-001`: review queue filters, focused detail editing and persisted readback.

Local proof:

- Fresh native PostgreSQL migration plus workbook import integration: 10/10 passed.
- Real workbook extraction: 288 stable review IDs; 234 pending, 54 posted; expected flag counts and omitted-row coordinates passed.
- Full CLI suite: 253 passed, 2 skipped.
- Full Playwright suite: 69 passed.
- Repository `pnpm check`: passed, including 31/31 native DB tests and production build of `/imports/review`.
- Real browser smoke: `/imports/review` rendered 288 total / 234 pending / 54 processed, drawer loaded real row data and browser console errors were empty.
- Exact-commit CI and release proof remain pending push.
