# ERP-959 — Shared cash and owner custody reconciliation

The dashboard keeps the shared `111-CASH` ledger total as the canonical company-funds amount and
does not add owner custody a second time. It now exposes `companyCashOnHandMinor` as the residual
after separating the confirmed custody amount, and flags `shared_cash_ledger_unreconciled` when the
residual is negative. The UI labels the components and warns that a negative residual indicates
legacy funding provenance that must be corrected through supported financial workflows.

The home dashboard now presents `totalCompanyFundsMinor` as the primary “Tiền công ty hiện có”
card. This is a non-overlapping physical partition of bank, non-negative company-held cash
residual and owner-held custody. The canonical ledger control remains available in the workbook
and API as `cashAndBankMinor`; `companyFundsReconciliationGapMinor` makes any provenance mismatch
visible instead of silently changing the accounting total.
