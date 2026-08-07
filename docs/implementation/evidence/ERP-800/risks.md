# ERP-800 Risks

- Review data is evidence and proposed mapping, not posted accounting truth.
- Posted invoices and expenses remain immutable; financial correction requires reversal and replacement in a later controlled workflow.
- Generic identities must not be interpreted as verified clients or suppliers.
- Owner/personal movements and zero-value rows must not create journals until explicitly classified and approved.
- Import retry preserves user corrections once resolution or notes exist; source refresh may update untouched staged proposals only.
- Live-data correction audit on 2026-08-06 found no canonical promote/apply command: review-row PATCH updates staging JSON only, while the legacy commit path directly created posted journals.
- Four owner/personal movements require an owner/accountant classification (capital contribution, withdrawal, owner loan or internal transfer) before any journal may be created.
- Six expense rows still have no defensible supplier identity. Inferred names improve listing and
  migration proposals but do not independently prove tax eligibility.
- Source `cash`, `received` and `fundingSource` fields do not by themselves define the canonical payment allocation or counter-account. Applying a guessed interpretation would change cash, AR/AP and tax reports.
- Existing import-created posted records must not be edited in place. Any financial remapping requires controlled reversal/replacement with exact reconciliation evidence.
- Mapping v3 stages cash, actual receipts, debt, planning, payroll and control data but intentionally does not promote them into banking, reconciliation, revenue-recognition, purchase-invoice, target or workforce resources. One workbook row can represent several independent accounting axes, so canonical application requires a reviewed candidate/apply model rather than another direct-post import path.
- Executive Metrics, collected revenue, AR and AP now load from canonical policy, document, ledger
  and reconciliation data. Cash/runway remains evidence-based and may legitimately be zero or
  `cash_generating`; the UI does not fabricate a runway month count.
- The migration CLI is intentionally not executed against live data automatically. It requires
  separate maker, checker and finance credentials plus explicit `--commit`; dry-run is the default.
- Local validation used Node 26 although the repository contract is Node 22-24. Exact-commit CI on
  the supported runtime is required before closing G8.
- Dry-run now rejects structurally invalid purchase-invoice candidates before mutation. Rows that
  pass preflight can still require business review (supplier identity, tax eligibility and payment
  allocation); preflight is contract validation, not accountant approval.
- OpenAPI and CLI currently advertise bank-account PATCH, but the banking controller does not
  implement it. This is outside ERP-800 planned files and requires a new ledger task or an explicit
  contract decision before clients may rely on it.
- Aging party/item drill-down and worker deactivation still lack REST/CLI parity. They are recorded
  in `docs/api/resource-coverage.md` and were not expanded inside ERP-800.

# 2026-08-07 range-query follow-up

- The posted-ledger profit fallback is not a fully-loaded project-profitability measure. The UI keeps
  this distinction visible until approved project budgets and posted overhead allocation runs exist.
- Provisional CIT is a simple 20% indicator over positive posted-ledger profit; it is not a filed tax
  return and does not replace tax-eligibility or adjustment review.
- The repository production-build gate is independently blocked by existing Next.js 16 Suspense
  requirements on `/reports/accountant-exports` and `/accounting/journals`. These routes are outside
  the dashboard range-query change and were not modified here.
