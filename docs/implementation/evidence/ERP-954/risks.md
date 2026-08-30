# Risks and follow-ups

- PROD currently has `CASH-COMPANY` and `CASH-OWNER-CUSTODY` backed by the same `111-CASH` ledger.
  Exact historical split is impossible without transaction-level provenance or distinct ledger
  subaccounts.
- The PROD dashboard currently reports a negative bank balance while many bank transactions are
  ignored. Those rows need explicit reconciliation evidence before any cash correction.
- A fresh PROD backup and an owner-approved reversal/replacement plan are required before mutating
  posted history.
- The remaining `owner-repayment-bank-*` and `owner-repayment-import-2026-03-22-100000000` entries
  may be genuine bank payments, but their bank evidence and purpose must be confirmed separately;
  they were not auto-reclassified.
