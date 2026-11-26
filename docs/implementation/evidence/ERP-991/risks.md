# ERP-991 — Risks and Follow-ups

- **Database migrations**: None added or altered; `scripts/run-real-ui-e2e.mjs` runs the existing `@naai-erp/database db:migrate` pipeline against an ephemeral database on every run and drops it on exit.
- **Forward compatibility with `ERP-989` and `ERP-990`**:
  - `real-ui-operations.spec.ts` and `recordDraftBatchCompat` detect one-click `"Ghi sổ"` UI buttons and `POST /drafts/record` / `POST /expenses/{id}/record` endpoints automatically while supporting the current pre-`ERP-989` API lifecycle, so merging `ERP-989` will exercise the new one-click and batch endpoints without breaking CI.
- **Port and environment isolation**:
  - Dynamic ephemeral loopback ports and explicit sanitization of `NEXT_PUBLIC_*` / `NAAI_ERP_PROD_*` variables prevent interference with developer `.env.local` files or concurrent local servers.
