# ERP-841 risks

- The project-cost subsystem has no canonical API/CLI operation that materializes
  `project_cost_items` from posted expense, purchase, timesheet or reclassification sources. Direct
  cost display now reads posted purchase allocations canonically, but overhead pools still cannot be
  seeded without forbidden business-table SQL.
- The dashboard truthfully describes its profit number as ledger profit. A canonical source
  materialization workflow and posted overhead demo remain a future enhancement; no current card
  claims that the demo profit is fully loaded.
- The web project budget create form still lacks the scope-change inputs required for a revision; the
  existing approved demo baseline is read-only safe.
- Commercial invoice and expense allocations persist canonical project attribution and may persist
  an explicitly selected contract in `dimensions.contractId`. The issue gate still enforces capacity
  at aggregate project level; it does not calculate per-contract consumption, and `milestoneId`
  remains unavailable. Clients must not infer either relationship from names, dates or amounts.
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
- Migration 0038 and the project-profitability fallback passed on a freshly migrated integration
  database. A rerun against the long-lived shared database collided with its pre-existing fixed
  `org-erp540` fixture. Production service-line assignments and the dashboard review-signal readback
  still depend on successful release and migration deployment.
- Project directory filtering currently operates client-side after loading the first 100 project
  master-data rows. The URL contract and overlap semantics are stable, but organizations exceeding
  that response limit will require server-side state/date filtering and pagination to guarantee a
  complete result set.
- The expense list category fallback regression passed on a freshly migrated PostgreSQL 16 database.
  Dashboard-wide posted-ledger category breakdown remains a separate follow-up because the
  operating-dashboard API currently exposes only monthly totals.
- Hard deletion is intentionally narrow to unreferenced projects. The reference registry must be
  extended whenever a new canonical project relationship is introduced. Referenced projects remain
  close/correct candidates, not delete candidates, and deletion may never cascade into posted
  accounting or retained audit history.
- In-app Browser visual readback was unavailable for the shared table control in this session.
  Focused desktop Chromium E2E passed with mocked API data; live `/banking` visual readback remains
  dependent on an available browser session and configured local API upstream.
- Category recovery uses the existing deterministic workbook inference rules. Fifty-seven of 245
  records lacked a more specific declared category and were assigned `OTHER_EXPENSE`; those records remain
  candidates for accountant review and more precise manual category correction.
- The management dashboard metric is narrower than the statutory owner-current liability: it tracks
  owner-borne operating cost less posted repayments and excludes assets/financing. Purchase invoices
  still do not carry a first-class funding-treatment snapshot, so exact supplier-invoice attribution
  remains a separate API/data-model follow-up.
- Four `Tiền cá nhân` bank withdrawals totaling VND 52,000,000 were posted as owner repayments and
  linked by explicit source references. Their bank rows are no longer left `imported` or eligible for
  a second reconciliation effect.
- Production bank cash is now complete in the posted ledger, but VND 281,712,775 remains in
  `3389-BANK-CLEAR` pending source-by-source classification. Clearing intentionally preserves the
  physical bank balance without recognizing revenue, owner funding, interest or internal transfers
  prematurely.
- Backfill is intentionally reviewed one record at a time. It must not automatically infer projects
  for 121 purchase invoices or 124 expenses, nor treat 18 likely and one ambiguous invoice/expense
  matches as canonical relationships. The VIOD sales invoice customer/project ownership conflict must
  be corrected in project master data before any contract backfill.
