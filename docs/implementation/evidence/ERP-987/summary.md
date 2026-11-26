# ERP-987 Summary

## Outcome

Implemented `ERP-987` (`BR-CLOSE-001`) delivering the 6-point monthly close checklist with soft-warning fiscal period closing, owner-custody cash count (`kiểm quỹ` against `111-OWNER-CUSTODY`), negative custody fund alerts on both the operating dashboard and period-close checklist, and year-end owner position reporting and audited settlement options across PostgreSQL, NestJS REST API, OpenAPI, CLI, and Next.js Web UI.

## Key Deliverables & Decisions

1. **Migration `0078` & Schema (`db/migrations/0078_period_close_cash_count_and_owner_settlement.sql`, `packages/database/src/period-close-schema.ts`)**:
   - Seeds `711-CASH-OVER` (overage other income), `811-CASH-SHORT` (shortage other expense), and `421` (retained earnings) across organizations and wires statement mappings where missing.
   - Creates `period_close_checklist_notes`, `owner_custody_cash_counts`, and `owner_year_end_settlements` with strict organization foreign keys, check constraints, and journal linkage invariants.
   - Repaired a stray malformed brace in `db/migrations/meta/_journal.json` at `idx: 73` and registered `0078_period_close_cash_count_and_owner_settlement` at `idx: 77`.

2. **Monthly Close Checklist & Soft-Warning Close (`apps/api/src/period-close/period-close-checklist.service.ts`, `apps/api/src/fiscal-periods/fiscal-period.service.ts`)**:
   - Evaluates `unlinked_funding` (`funding-plans/unlinked` through period end = 0), `payment_evidence_gaps` (`ERP-982` resolved or explicitly noted), `ap_tied` (AP subledger tied to `331`), `tax_finalization` (non-gated lines reviewed), `bank_reconciled` (active bank transactions reconciled/ignored and no pending statement exceptions), and `owner_custody_non_negative` (`111-OWNER-CUSTODY >= 0`).
   - `POST /fiscal-periods/close` warns without blocking when `reason` is supplied, persisting `checklistWarnings` in the audit trail.

3. **Negative Custody Alert (`apps/api/src/operating-dashboard/`, `apps/web/src/components/dashboard/negative-custody-alert.tsx`)**:
   - Whenever `111-OWNER-CUSTODY < 0`, emits `owner_custody_negative` and `negativeOwnerCustodyAlert` recommending reclassifying excess spend to `owner_paid` (`TK 3388`).

4. **Cash Count (`apps/api/src/period-close/cash-count.service.ts`)**:
   - Compares non-negative physical cash counted by the owner against the `111-OWNER-CUSTODY` ledger balance as of `countedOn`, posts balanced overage (`Dr 111-OWNER-CUSTODY / Cr 711-CASH-OVER`) or shortage (`Dr 811-CASH-SHORT / Cr 111-OWNER-CUSTODY`) journals with mandatory reason in an open period, and persists the count record idempotently.

5. **Year-End Owner Settlement (`apps/api/src/period-close/owner-settlement.service.ts`)**:
   - Reports `3388`, `1388`, `111-OWNER-CUSTODY` (kept separate from net owner position), and `421` retained earnings.
   - Supports `repayment` (`company_to_owner` or `owner_to_company` via active company bank/safe-cash account, rejecting `111-OWNER-CUSTODY`), `offset_3388_1388` (`Dr 3388 / Cr 1388`), and `profit_distribution` (`Dr 421 / Cr 1388`), each posting a balanced audited journal with mandatory reason.

6. **CLI & Web UI (`apps/cli/src/period-close-cli.ts`, `apps/web/src/app/workspaces/period-close-workspace.tsx`)**:
   - All new source files are kept well below 500 lines; `dashboard-workspaces.tsx` and `pg-operating-dashboard.store.ts` shrank in line count through helper extraction.
