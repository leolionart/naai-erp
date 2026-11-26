# ERP-984 Acceptance

- AP aging includes unpaid purchase/supplier invoices on account `331` (remaining balance after payments/reconciliation) and freelance payables: verified by `T-INT-AP-001` in `apps/api/src/aging/aging.integration.test.ts` and `packages/domain/src/aging.test.ts`.
- Owner-paid (`3388` / `owner_current`) and owner personal expenses (`1388`) remain separate in owner position and never mix into AP or AR aging: verified by `T-INT-AP-001` (including `banking/owner-current-movements` and `1388` ledger balance checks).
- Purchase invoices with `funding = owner_paid` do not create AP (`3388`), and `company_*` paid invoices carry `0` AP balance and are omitted from AP aging: verified by `T-INT-AP-001`.
- `tieStatus` reconciles ledger account `331` against the AP aging detail total (`tied` when matched, `out_of_balance` when an unlinked manual `331` entry exists): verified by `T-INT-AP-001`.
