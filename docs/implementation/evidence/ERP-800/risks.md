# ERP-800 Risks

- Review data is evidence and proposed mapping, not posted accounting truth.
- Posted invoices and expenses remain immutable; financial correction requires reversal and replacement in a later controlled workflow.
- Generic identities must not be interpreted as verified clients or suppliers.
- Owner/personal movements and zero-value rows must not create journals until explicitly classified and approved.
- Import retry preserves user corrections once resolution or notes exist; source refresh may update untouched staged proposals only.
- Live-data correction audit on 2026-08-06 found no canonical promote/apply command: review-row PATCH updates staging JSON only, while the legacy commit path directly created posted journals.
- Four owner/personal movements require an owner/accountant classification (capital contribution, withdrawal, owner loan or internal transfer) before any journal may be created.
- 159 expense rows have no source payee identity. Personnel, expense type and notes can support proposals, but they do not prove the legal supplier/payee for tax or AP purposes.
- Source `cash`, `received` and `fundingSource` fields do not by themselves define the canonical payment allocation or counter-account. Applying a guessed interpretation would change cash, AR/AP and tax reports.
- Existing import-created posted records must not be edited in place. Any financial remapping requires controlled reversal/replacement with exact reconciliation evidence.
- Mapping v3 stages cash, actual receipts, debt, planning, payroll and control data but intentionally does not promote them into banking, reconciliation, revenue-recognition, purchase-invoice, target or workforce resources. One workbook row can represent several independent accounting axes, so canonical application requires a reviewed candidate/apply model rather than another direct-post import path.
- Executive Metrics, cash/runway/ROS, collected revenue and AP remain unavailable as canonical metrics until policies, real bank transactions/reconciliations, purchase invoices and approved recognition events exist. The UI now states these gaps explicitly instead of fabricating values.
- The migration CLI is intentionally not executed against live data automatically. It requires
  separate maker, checker and finance credentials plus explicit `--commit`; dry-run is the default.
- Local validation used Node 26 although the repository contract is Node 22-24. Exact-commit CI on
  the supported runtime is required before closing G8.
- Dry-run now rejects structurally invalid purchase-invoice candidates before mutation. Rows that
  pass preflight can still require business review (supplier identity, tax eligibility and payment
  allocation); preflight is contract validation, not accountant approval.
