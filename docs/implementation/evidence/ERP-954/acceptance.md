# Acceptance

- [x] Owner-held company cash is displayed as remaining physical custody, independently of signed Owner Current settlement.
- [x] Shared ledger `111-CASH` and missing funding provenance no longer infer custody spending.
- [x] Explicit custody-funded expenses are counted once; duplicate subtraction was removed.
- [x] Bank, company cash, custody cash and owner liability remain separate dashboard controls.
- [ ] Historical PROD journals still require a separately approved reversal/replacement correction to split the shared `111-CASH` pool; this is intentionally not fabricated by the dashboard.
- [x] The four duplicated `owner-repayment-import-*` bank credits were reversed with auditable
  reversal journals after a PROD backup. The remaining bank balance still requires reconciliation of
  ignored transactions and unproven expense funding.
- [x] Explicit custody-funded costs totaling `120.233.150₫` were reclassified with one balanced,
  posted correction journal from Owner Current to company custody cash; original posted expenses
  remain unchanged.
- [x] The owner-directed provisional bank residual correction was posted as a reversible, non-P&L
  journal, bringing `112-BANK` to `0₫` pending statement reconciliation.
