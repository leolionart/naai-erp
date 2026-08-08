# ERP-841 risks

- The project-cost subsystem has no canonical API/CLI operation that materializes
  `project_cost_items` from posted expense, purchase, timesheet or reclassification sources. Direct
  cost display now reads posted purchase allocations canonically, but overhead pools still cannot be
  seeded without forbidden business-table SQL.
- Consequently the dashboard must continue describing its profit number as ledger profit until a
  posted overhead allocation run exists; ERP-841 must not be marked done before that gap is closed or
  the fully-loaded card is changed to a truthful non-fully-loaded label.
- The web project budget create form still lacks the scope-change inputs required for a revision; the
  existing approved demo baseline is read-only safe.
- Commercial invoice allocations still persist project attribution in `dimensions.projectId`; they
  do not persist canonical `contractId` or `milestoneId`. The issue gate prevents aggregate project
  over-invoicing but cannot report exactly which contract or milestone an allocation consumed.
- The added salary, freelance and contract-dev records are direct-cost and expense examples only.
  Shared payroll remains on operating expense and is not presented as project cost until a canonical
  overhead allocation run exists, preventing double counting or a false fully-loaded claim.
- Runtime workbook content was verified through authenticated local API calls and ExcelJS readback.
  The legacy ERP-650 integration fixture still assumes a freshly initialized database and collides
  with its own fixed organization IDs on the long-lived demo database; it should be made isolated or
  idempotent before being used as a repeatable shared-database gate.
- The current unified listings are a frontend composition over existing versioned APIs. They use
  explicit source tags and no fuzzy matching, but server-side unified pagination and a first-class
  recognition-to-invoice relationship would require dedicated read-model endpoints later.
- Cash-fund direction currently derives from the exact signed `amountMinor` returned by the banking
  API. The API has no server-side account-kind/direction filter or pagination, so the web workspace
  filters the complete organization transaction list client-side; a dedicated paginated read model
  will be needed if transaction volume becomes large.
- There is no canonical manual receipt/payment-voucher create endpoint yet. The new Sổ quỹ is a
  complete view of imported cash-account transactions, not a substitute manual journal workflow.
- The environment login is intentionally a single-account deployment convenience and has no
  lockout/rate-limit layer of its own. Its API token must already belong to an active organization
  member with the intended RBAC roles; the login route does not bypass API authorization or provision
  database identities.
- Category metadata on posted expenses is deliberately independent from `expense_category_code` and
  `funding_treatment`. Reclassifying the funding treatment can change management balance semantics
  and therefore still requires the normal reversal/replacement workflow rather than this metadata
  endpoint.
