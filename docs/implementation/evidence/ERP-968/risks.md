# Remaining risks

- Voiding an invoice dated in a closed period is rejected; the user must reopen the period first.
- Voiding does not unwind receipts/reconciliation; those must be unapplied first.
- 8 legacy e2e tests in focused-records.spec.ts are stale (labels/routes) and need a separate refresh.
- The e2e run used a local override of NEXT_PUBLIC_* env because apps/web/.env.local points at a real API.
