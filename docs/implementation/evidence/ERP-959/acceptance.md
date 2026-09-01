# Acceptance

- Shared cash ledger is counted once: implemented by retaining canonical `cashAndBankMinor` and
  not adding custody to it.
- Owner custody remains visible: `ownerHoldsCompanyFundsMinor` remains a separate metric.
- Primary home card uses `totalCompanyFundsMinor` and includes owner-held company cash exactly once.
- API contract exposes `companyFundsReconciliationGapMinor` for unresolved historical provenance.
- Legacy ambiguity is explicit: `companyCashOnHandMinor` and the
  `shared_cash_ledger_unreconciled` warning expose negative residuals instead of hiding them.
