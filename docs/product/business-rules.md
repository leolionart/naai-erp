# NAAI ERP Business Rules Catalog

This catalog is the authoritative behavior specification for implementation. Repository benchmarks are design inspiration only; Vietnamese tax rules remain configurable and require accountant approval.

## Active invoice MVP rules

These rules define the active release boundary. Historical rules remain valid for completed modules but do not authorize new scope.

### BR-MVP-001 — External identity and idempotent upsert

- Paperless/n8n sends structured invoice, credit-note or expense data through REST/webhook.
- Each resource may carry a generic external reference with system, external ID, canonical URL, checksum/version, sync timestamp and metadata.
- `(organization, external system, external ID)` is unique.
- Re-sending the same external identity returns or updates one business resource even when the HTTP idempotency key changes.
- Invalid payloads create no business effect and return structured field errors; NAAI ERP has no separate ingestion review workflow.

### BR-MVP-002 — Paperless boundary and duplicate prevention

- Paperless-ngx owns source file bytes, search and document lifecycle. NAAI ERP stores references only.
- Purchase invoice is the canonical supplier-invoice record. Non-invoice expense must not duplicate it through a second invoice-backed path.
- Duplicate checks prioritize external identity, then supplier, invoice number, date, gross amount and currency.
- The same external ID may exist in different organizations.

### BR-MVP-003 — Focused invoice and expense UI

- Invoice and expense use dedicated list, new and detail routes with URL-backed filters.
- Drafts may be corrected directly. Posted financial records retain existing cancel/reverse controls and are not hard-deleted.
- Detail pages show Paperless reference, journal and payment/reconciliation links.
- UI uses organization master data and never silently applies demo account codes.

### BR-MVP-006 — In-place Quick View editing, currency formatting, and period controls

- Invoices and expenses can be edited completely in-place within the Quick View Dialog without navigating away from the focused listing workspace.
- Currency fields across forms display formatted numbers with thousand separators and the Vietnamese Dong (`₫`) symbol, ensuring high legibility while parsing back to exact integer/minor-unit amounts.
- Financial report and dashboard workspaces support quick period selectors (MTD, YTD, full year) and respect URL-driven date range parameters.

### BR-MVP-007 — Revenue and expense management listings

- The primary document workspaces are named **Revenue Management** and **Expense Management**, not
  inbound/outbound invoice silos.
- Each workspace defaults to all relevant records. Invoice presence is an optional URL-backed filter
  with `all`, `present` and `missing` semantics.
- Revenue Management shows invoiced revenue activity separately from recognized revenue activity.
  These axes are visibly labeled and are never added together as one revenue total. A recognition
  event without an explicit invoice relationship is shown as non-invoice activity; the UI never
  guesses a link from amount, date or project.
- Expense Management shows purchase invoices and non-invoice expense records in one listing. Every
  row retains its canonical source type, endpoint, lifecycle and correction form; the UI never fuzzy
  deduplicates supplier/date/amount matches.
- Stable invoice, expense and revenue-recognition detail routes remain available from the unified
  listings.

### BR-MVP-004 — Minimal report readiness

- A clean installation receives a minimal approved TT133 account, tax and statement-mapping setup.
- Revenue, expense, profit, direct Cash Flow, VAT, paid/unpaid, MoM/YoY and target reports use existing canonical report formulas.
- Dashboard values must equal the report API response and drill down to posted sources.

### BR-MVP-005 — Release and controlled workbook import

- Production containers run non-root and become healthy through Docker Compose after migrate-once.
- A successful main-branch check publishes `main` and immutable `sha-<12>` images.
- Workbook import supports inventory, zero-mutation dry-run, explicit commit, row-level errors, retry idempotency and exact reconciliation to source controls.

## AI-native access

### BR-AI-001 — Machine-readable coverage

- Every business entity and workflow has a versioned API contract and first-party CLI access before its feature is complete.
- UI-only and direct-database-only capabilities are incomplete.
- Reads support stable IDs, pagination, filtering and structured errors.

### BR-AI-002 — Controlled AI mutations

- AI/service identities use the same organization scope, RBAC and state machines as people.
- Retryable mutations require idempotency and correlation identifiers.
- AI cannot bypass approval, maker-checker, locked periods, evidence or accounting invariants.

### BR-AI-003 — Explainable effects

- Mutations return resource version, audit reference and permitted next actions.
- Suggested classifications/postings remain distinct from approved or posted effects.
- Financial amounts use exact strings/minor units, never binary floating point JSON values.

### BR-AI-004 — Bulk and event interoperability

- Import/export, webhook and outbound event payloads are schema-versioned.
- Bulk operations support dry-run, row-level validation and explicit partial-failure results.
- Direct database access is not an integration contract.

### BR-AI-005 — Relationship-aware data ingestion

- Every writable business resource documents its organization scope, stable identity, prerequisite
  resources, relationship fields, lifecycle prerequisites and permitted correction path.
- AI and integration clients resolve referenced resources through API/CLI reads or external identity;
  they never invent database IDs or use direct PostgreSQL access.
- Create and update guidance defines which response IDs must be retained and reused by downstream
  resources, including party, project, account, document, expense, journal, bank and reconciliation
  links.
- Relationship writes are ordered, idempotent and validated before financial mutations. Missing or
  ambiguous parents produce structured errors or a review state, never a guessed association.
- Posted or issued financial history is corrected through cancel, deactivate, reverse or replacement
  workflows rather than relationship rewrites or hard delete.
- Relationship backfill first inventories canonical records and their aggregated `projectIds` and
  `contractIds`, then performs a zero-mutation dry-run against the current resource version. Commit
  requires the dry-run `planHash`, the same `If-Match` version and an idempotency key; a changed
  mapping, reason or version invalidates the plan.
- Issued/posted document and posted-expense backfills reverse the original accounting effect and
  create a linked replacement draft. They never update allocations or journals in place.

### BR-AI-006 — Cash-heavy business activity classification

- The default small-business model allows the owner to pay company invoices and expenses from a
  personal account without treating that personal account as a company financial account.
- Supplier/payee, project, tax and expense identity remain canonical; the funding side credits a
  reviewed Owner Payable/current-account liability instead of pretending company cash or bank paid.
- Reimbursement clears the owner liability and never creates a second expense. Owner funding is
  financing and never revenue; owner personal spending is not a company expense.
- Owner withdrawals, owner-paid company costs and owner transfers into the company are tracked as
  separate movements on a reviewed owner current-account/clearing policy. A withdrawal is not an
  expense; a transfer into the company is not revenue; paying a supplier from the company account
  after owner funding does not create a second funding or expense effect.
- Customer money received into the owner's account requires an approved owner-custody/clearing
  treatment and must not recognize revenue twice.
- When no canonical API exists for a classified movement, AI stops and reports the missing workflow;
  it does not fall back to direct SQL or an unreviewed manual journal.

## Rule format

Every rule contains a stable ID, invariant/behavior, validation, state transition or posting effect, edge cases and required test coverage. A rule may not be silently changed from code; update this file and its mapped tests first.

## 1. Organization, audit and periods

### BR-ORG-001 — Organization isolation

- Every business and financial record belongs to exactly one organization.
- Queries and mutations require organization context.
- Cross-organization references are rejected at application and database levels.
- The same external invoice number may exist in different organizations.
- Required tests: positive isolation, cross-org IDOR denial, background-job isolation.

### BR-AUD-001 — Append-only audit

- Record actor, timestamp, action, reason, source, correlation ID and before/after state.
- Posted financial history and evidence versions are never removed from the audit chain.
- System/import/webhook actors are explicit service identities.

### BR-PER-001 — Fiscal period state

`open → soft_locked → hard_locked`

- Open: normal posting.
- Soft locked: only configured finance roles may post.
- Hard locked: reject posting/backdating until approved reopen.
- Payment in an open period may settle an invoice from a locked period without changing the original journal.

### BR-PER-002 — Reopen control

- Reopen needs elevated permission, reason and approver.
- Reopen/close events are audited.
- Reclosing must rerun reconciliation and financial-statement gates.

## 2. Chart of Accounts, dimensions and currency

### BR-COA-001 — Account hierarchy

- Root types: Asset, Liability, Equity, Revenue, Expense.
- An account with ledger history cannot change root type or be deleted; it can only be deactivated.
- Control accounts may block manual posting.

### BR-COA-002 — Management/statutory mapping

- Internal accounts may map to TT133/TT200 codes through versioned configuration.
- Mapping effective dates preserve historical reports.
- A missing statutory mapping does not block management posting unless policy requires it; it blocks statutory export readiness.

### BR-DIM-001 — Required dimensions

- Revenue normally requires client, project/contract and service line.
- Direct project costs require project.
- Shared overhead requires cost center and may omit project until allocation.
- Required dimensions are defined per account/rule version.

### BR-DIM-002 — Allocation integrity

- Split allocation totals exactly 100% or the full source amount.
- Allocation creates multiple journal lines, not duplicate source documents.
- Rounding residual goes to a configured line/account with explicit metadata.

### BR-CUR-001 — Multi-currency

- Store document currency, rate, rate source/timestamp and base amounts.
- Use decimal/minor units, never binary floating point.
- Partial payment may create realized FX gain/loss.
- Period-end revaluation creates unrealized FX entries under an approved policy.

## 3. Ledger and posting

### BR-LED-001 — Double-entry invariant

- Every posted journal balances: `Σ debit = Σ credit` in base currency.
- A line cannot contain both debit and credit.
- Normal line amount must be positive; reversal polarity is system-generated.
- An unbalanced journal is rejected atomically with zero ledger lines created.

Example: hosting expense 1,100,000 including 10% VAT:

```text
Dr Hosting expense              1,000,000
Dr VAT input                      100,000
Cr Bank/AP                      1,100,000
```

### BR-LED-002 — Atomic posting

- Document state change, journal creation and outbox write occur in one database transaction.
- A crash cannot leave a posted document without ledger entries or create duplicate entries on retry.

### BR-LED-003 — Immutability and reversal

`draft → approved → posted → reversed`

- Posted entries cannot be edited or deleted.
- Correction uses a linked reversal and replacement.
- One original entry cannot be reversed twice.
- If the original period is closed, correction posts in an allowed open period while retaining original-period metadata.

### BR-LED-004 — Idempotent posting

- Repeating the same approved posting command returns the same journal ID.
- Same idempotency key with a different payload returns conflict.

### BR-LED-005 — Opening balances

- Opening balances require control totals and approval.
- AR/AP openings preserve party/document detail.
- Import cannot use a hidden balancing plug; unexplained variance is rejected.

### BR-PST-001 — Posting rules

- Posting behavior is defined by versioned rules with effective dates.
- Rule selection uses organization, document type, account/category/tax configuration and date.
- Reports disclose the posting-rule version used by source journals.

### BR-PST-002 — Manual journal restriction

- Manual journals require explicit permission.
- Direct manual posting to protected AR/AP/Bank/VAT control accounts may be blocked or require elevated approval.

### BR-WFL-001 — Maker/checker

- Submitter cannot approve above configured threshold.
- `controlled` mode uses maker-checker, with optional bounded self-approval configured by amount.
- `solopreneur` mode allows the authenticated organization `owner` to create and approve the same
  resource across journals, commercial documents, expenses, financial mappings, executive metrics,
  ROI definitions, planning, forecast adjustments, project recognition and overhead allocation.
- Solopreneur self-approval always records actor, reason, timestamp, resource version and audit event.
  It never bypasses RBAC, idempotency, period locks, balanced-journal validation, evidence checks,
  tax eligibility rules or immutable posted history.
- `NAAI_ERP_SOLOPRENEUR=true` bootstraps the login organization only when its workflow policy is
  missing. The persisted organization policy remains the runtime source of truth.

### BR-WFL-002 — State transition integrity

- Invalid transitions are rejected.
- Approval does not imply payment or tax eligibility.
- Post requires approved state and complete accounting inputs.

## 4. Sales, receivables and revenue

### BR-PTY-001 — Party identity

- A party may act as client, supplier, freelancer or employee through explicit roles.
- Tax ID, bank details and external references have organization-scoped uniqueness policies.
- Merge/dedup preserves all document and audit references; parties with financial history are not hard-deleted.

### BR-INV-001 — Sales invoice lifecycle

`draft → validated → issued → partially_paid → paid`

Branches: cancellation before issue; credit note/reversal after issue.

- Issued totals, customer, tax and lines are immutable.
- Human invoice number is unique by organization/series/fiscal year.
- A relationship correction after issue uses an authorized dry-run and reverse/replacement workflow:
  the original becomes cancelled, its journal is reversed under normal period controls, and the
  replacement draft retains the durable external reference and may reuse the human invoice identity.

### BR-INV-002 — Purchase invoice lifecycle

`draft → captured → verified → approved → posted → partially_paid → paid`

- OCR/capture is not accounting verification.
- Duplicate detection uses supplier identity, invoice reference/date/amount and evidence hash.

### BR-AR-001 — Sales invoice posting

Typical service invoice with VAT:

```text
Dr Accounts Receivable
Cr Service Revenue or Deferred Revenue
Cr VAT Output
```

Revenue account depends on recognition policy, not merely invoice issuance.

### BR-AR-002 — Receivable aging

- Outstanding derives from journal/payment allocations, not UI status.
- Buckets use due date: current, 1–30, 31–60, 61–90, >90.
- Customer credits are shown separately and do not hide overdue debit.

### BR-AP-001 — Purchase invoice posting

Eligible VAT example:

```text
Dr Direct/Operating Expense
Dr Deductible VAT Input
Cr Accounts Payable
```

If VAT is ineligible, cost/tax-expense treatment follows configured reviewed policy.

### BR-AP-002 — Payable aging

- Outstanding derives from posted bills, advances, payments, credit/debit notes and allocations.
- Due/overdue data must tie to AP control account.

### BR-REV-001 — Revenue axes

- Contract value, invoiced revenue, recognized revenue, cash collected and remaining contract value
  are five separate project-revenue axes. None may be presented as a substitute for another.
- Contract value is the reviewed commercial ceiling from project contracts, adjusted only by
  approved revenue-impacting scope changes included at the reporting cutoff.
- Invoiced revenue is the net eligible sales-invoice amount less effective credit notes. Recognized
  revenue comes only from posted recognition events. Collected revenue comes only from completed
  payment/reconciliation allocations to eligible sales invoices.
- Remaining contract value is `contract value - invoiced revenue`. It is commercial work not yet
  invoiced, not accounts receivable, deferred revenue, forecast revenue or available cash.
- Every five-axis read uses one explicit `asOf` cutoff. Contract/scope, invoice/credit, recognition
  and collection facts dated after that cutoff are excluded rather than mixed into the result.
- Cash receipt does not automatically create revenue.
- Invoice before delivery may create deferred revenue/contract liability.
- The project is the single user-facing commercial contract for invoice and expense attribution.
  Commercial-document line/allocation dimensions retain canonical `projectId`; create and edit
  workflows remove stale user-supplied `contractId` dimensions rather than asking users to maintain
  the same relationship twice. Legacy contract rows remain a compatibility/read-model source for
  commercial value and milestones until those fields are migrated onto projects. Milestone
  attribution is not yet persisted, so the system must not claim milestone-level invoice-cap
  enforcement or drill-down.
- Sales-invoice creation opens in context from revenue management. Customer choices are limited to
  client-role parties and shown by business name while the REST payload retains the canonical party
  ID. The project selector reads the canonical project master list. Selecting a project sets its
  linked customer on a sales invoice, so project and customer cannot silently diverge. The selected
  project is the canonical contract relationship and no separate contract selector is exposed.
  Direct `/documents/new` navigation resolves to the same dialog workflow.

### BR-REV-002 — Milestone recognition

- Recognition requires configured evidence such as milestone acceptance or completion policy.
- Advance receipt posts to customer advance/contract liability.
- Disputed or rejected milestones do not recognize revenue until resolved.

### BR-SUB-001 — Customer service subscription identity and lifecycle

- A service plan is organization-scoped active master data with a stable code, readable name,
  service-line relationship, default exact price/currency and recurrence rule. Deactivation preserves
  historical subscription references and prevents new activation.
- A customer service subscription links exactly one client-role party to one service plan and may
  optionally link the project that represents the customer contract. When a project is selected, its
  canonical `client_party_id` must equal the subscription customer; no separate contract ID is
  collected or inferred.
- Lifecycle is `draft → active ↔ paused → cancelled|expired`. Lifecycle changes use typed actions,
  optimistic version matching, idempotency, an effective date and an audited reason where applicable;
  status is never changed through an unrestricted generic patch.
- Draft commercial fields remain editable. Once active or referenced downstream, history is retained;
  cancellation/expiry replaces hard deletion. Date ranges, recurrence intervals, quantity and exact
  minor-unit pricing are validated deterministically without binary floating point arithmetic.
- List/read APIs support stable IDs, pagination and filters for customer, service plan, project,
  lifecycle and active date. UI selectors resolve canonical parties, plans and projects rather than
  accepting arbitrary database identifiers.

### BR-SUB-002 — Subscription schedule and accounting boundary

- A subscription and its schedule preview are commercial management records only. They do not issue
  an invoice, recognize revenue, create receivables, collect cash or post ledger entries.
- Schedule preview derives deterministic service periods and billing dates from the snapshotted
  recurrence rule. Paused, cancelled or expired ranges do not produce future scheduled periods.
- Scheduled recurring value is labeled separately from invoiced, recognized and collected revenue.
  Forecast composition may reference a subscription period through a stable source identity but must
  not double-count the same invoice, project milestone or other commercial source.
- Future invoice automation, if implemented, creates only an idempotent sales-invoice draft through
  the canonical commercial-document service. Issued invoices retain their own price, tax and project
  snapshot even when the subscription later changes.
- Service plans and customer subscriptions are included in the portable organization package with
  dependency-aware export, zero-mutation dry-run and canonical application-service import. Missing,
  cross-organization or customer-project-mismatched relationships reject mutation with structured
  field errors.

### BR-AR-003 — Payment allocation

- One payment may settle multiple invoices; one invoice may receive multiple payments.
- Allocations cannot exceed available payment or invoice outstanding.
- Overpayment remains customer credit/advance.

### BR-AR-004 — Credit note

- References original invoice and reason.
- Cumulative credit cannot exceed eligible invoiced quantity/amount.
- Paid invoice credit becomes refund payable or customer credit.

### BR-AP-003 — Supplier advance

- Advance payment records supplier advance, not immediate expense.
- Bill allocation clears advance against AP.

## 5. Expenses, evidence and tax review

### BR-PRD-001 — Purchase product VAT catalog

- Purchase products are organization-scoped master data identified by a stable code and readable
  name. The configured purchase VAT rate is restricted to exactly 8% or 10%.
- Authorized API and first-party CLI clients can list, read, create, update and deactivate products.
  Mutations are idempotent, audited and versioned; inactive products remain readable for history.
- The administration navigation exposes a dedicated purchase-product screen where authorized users
  can add products, change names or VAT rates and deactivate products through the same REST service.
- Deactivation is the supported removal path. Catalog changes never rewrite VAT or amounts already
  snapshotted on financial documents.

### BR-EXP-001 — Expense classes

Supported classes include invoice-backed, receipt-backed, contract-backed, payroll/personnel, bank fee, tax payment, non-documented, owner/personal, prepaid and fixed asset.

Document type and accounting treatment are independent.

### BR-EXP-002 — Expense lifecycle

`draft → submitted → evidence_pending → approved/rejected → posted`

- Business purpose, payee, period, amount/currency, dimensions, payment evidence and approver are captured as required by class.
- Expense creation opens in context from the expense list. Payees are selected from active supplier
  parties and displayed by business name while the payload retains the canonical party ID. Employee
  attribution uses active workforce profiles mapped to party names; when workforce data is absent,
  the UI states that explicitly instead of exposing arbitrary party identifiers.
- A direct expense may optionally select the project receiving the cost. That project is also the
  user-facing commercial contract, so no separate contract selector is exposed. The supplier/payee
  remains independent from the receiving project's customer. Draft edits preserve existing
  allocation IDs and unrelated dimensions while canonicalizing the relationship to `projectId`.
- A draft created in error may be discarded before submission. Discard requires write authorization,
  optimistic version matching, a nonblank reason, idempotency, and retained audit/outbox evidence;
  submitted, approved or posted expenses cannot be deleted.
- Posted expenses may receive an audited, idempotent `dimensions.category` metadata correction when
  the category is active organization master data. This operation never changes amounts, tax states,
  allocations, funding treatment, journal linkage or any other posted financial field.
- A posted expense missing its project relationship is corrected only through relationship
  backfill dry-run and reverse/replacement. The original becomes reversed and the replacement remains
  draft for normal review/posting; amount, evidence and accounting history are not rewritten.

### BR-TAX-001 — Versioned tax policy

- VAT/CIT classifications and required evidence are versioned by effective date.
- The system assists review; it does not claim legal correctness without accountant approval.

### BR-TAX-002 — Independent tax states

Track separately:

- accounting recognition;
- CIT deductibility;
- VAT input deductibility.

States: `unreviewed`, `eligible`, `partially_eligible`, `ineligible`, `accountant_override`.

Override requires reviewer, reason, timestamp and reference/evidence.

### BR-TAX-003 — VAT reconciliation

- VAT output, input, eligible input and ineligible input are distinct.
- Report differences, missing evidence and unreconciled documents.
- VAT report is not final while review thresholds are exceeded.
- VAT payable is `output VAT - eligible input VAT`. Ineligible and unreviewed input VAT are shown
  separately and are not silently deducted.

### BR-TAX-004 — Provisional corporate income tax

- Provisional taxable profit starts from posted-ledger accounting profit before tax and adds reviewed
  CIT-ineligible expense adjustments. CIT-unreviewed expense remains visible and keeps the result in
  review-required state.
- Provisional CIT equals positive provisional taxable profit multiplied by the effective,
  accountant-approved organization CIT tax-code rate. The UI reads the rate from the policy record;
  it never embeds a tax rate or a demo tax amount.
- Taxable profit and accounting profit are distinct. Purchase invoices without CIT review remain
  unreviewed rather than being assumed deductible merely because an invoice exists.

### BR-TAX-005 — Solopreneur tax workflow

- An organization operated by one owner may enable the versioned `solopreneur` workflow policy.
- In `solopreneur` mode, documented operating-expense and purchase-invoice lines default to
  management-valid and CIT-eligible. Input VAT defaults to eligible only when the line contains VAT
  and the required source-document evidence; explicit line classifications always take precedence.
- Non-documented and owner-personal spending remain tax-ineligible. Fixed assets and prepaid costs
  retain their capitalization or amortization treatment and never become immediate operating expense
  merely because `solopreneur` is enabled.
- Resolved management, CIT and VAT states and eligible amounts are persisted on the source line with
  actor, policy version and reason. Reports never reinterpret historical lines from the current
  organization setting.
- Existing unreviewed records change only through an organization-scoped, audited, idempotent
  dry-run and commit operation. The operation reports counts and exact money totals before mutation.

### BR-EVD-001 — Evidence integrity

- Store version, file hash, media type, uploader and source.
- Replacement marks prior file superseded; it does not erase it.
- Duplicate hashes are warnings/controls, not automatic conclusions.

### BR-EVD-002 — Evidence access

- Download requires organization and document permission.
- Use expiring signed URLs; audit sensitive export/download actions.

### BR-EXP-003 — Non-invoice expense

- May be booked for management P&L/cash flow.
- Never automatically qualifies for VAT deduction.
- UI/report shows booked amount, tax-deductible amount and cash outflow separately.

### BR-EXP-004 — Employee reimbursement

- Approval: Dr expense/asset, Cr employee payable.

### BR-EXP-004 — Configurable expense-category funding treatment

- Expense categories are organization-scoped master data and may be added or deactivated without a
  web deployment.
- Each category has one funding treatment: `company_funds`, `owner_paid_company_cost`, or
  `tax_only_non_cash`.
- The selected category and funding treatment are snapshotted on the expense record/line so later
  policy changes never rewrite historical management balances.
- `owner_paid_company_cost` requires an owner-current/payable counter account. It does not change
  physical bank/cash, but posted amounts reduce net company funds and increase the owner liability.
- In approved `solopreneur` mode, a legacy posted expense whose funding snapshot is null and whose
  counter account is mapped to the reviewed Owner Current line is classified deterministically as
  `owner_paid_company_cost` for management reporting. It must not remain in the unclassified queue,
  and the compatibility classification must not edit or reverse its posted journal.
- `tax_only_non_cash` remains available for VAT/CIT evidence and tax reporting but does not reduce
  management net company funds.
- Official dashboard balances include posted records only and disclose uncategorized or unreviewed
  records separately.
- Payment: Dr employee payable, Cr bank/cash.
- Avoid duplicate booking from company-card/bank import and employee claim.

### BR-EXP-005 — Prepaid/capital expenditure

- Material prepaid services amortize according to schedule.
- Purchases above capitalization policy may become assets rather than immediate expense.
- Schedule changes never rewrite already-posted periods.

## 6. Banking and reconciliation

### BR-BNK-001 — Bank ingestion

- Unique source key: bank account + provider transaction ID/fingerprint.
- Raw payload is immutable; normalized representation is versioned.
- Re-import is idempotent.

### BR-BNK-002 — Bank transaction state

`imported → suggested → matched → reconciled`

Branches: `ignored`, `needs_review`.

- The banking workspace exposes a complete cash-fund history independently from the reconciliation
  queue. It includes every transaction belonging to an organization cash account, including
  reconciled and ignored records.
- Cash direction derives only from the exact signed transaction amount: positive is cash deposited
  into the fund and negative is cash withdrawn from the fund. The UI may filter by direction but
  must not classify either direction as revenue or expense without canonical reconciliation data.
- A bank-to-cash or cash-to-bank internal transfer appears once in the cash-fund history through its
  cash-account leg and remains P&L-neutral.
- Company cash physically held by the owner remains a company `cash` financial account backed by an
  asset ledger account. A withdrawal from company bank into that custody fund is an internal
  bank-to-cash transfer; it does not increase or decrease Owner Current merely because the owner is
  the custodian.

### BR-BNK-003 — Internal transfer

- Transfer between own accounts does not affect P&L.
- Bank fee is a separate line.
- Transit account may be used while only one side is imported.

### BR-BNK-004 — Owner-current reconciliation view

- The banking workspace exposes a read-only owner-current ledger view resolved from the approved
  Balance Sheet `owner_current` mapping, posted/reversed journals and organization financial accounts.
- Every row shows the journal, signed owner-liability effect, signed company-funds effect and running
  owner-current balance. The totals must reconcile exactly to the mapped ledger balance.
- When a movement originates from an expense, the read model exposes the canonical expense ID,
  business purpose, expense class, category and tax-review states. The UI links to the expense detail
  instead of forcing the owner to infer the purchase from a generic journal description.
- A company payment to the owner is identified only when the same journal debits Owner Current and
  credits a configured company bank/cash account. The UI does not guess whether the payment is a
  reimbursement, withdrawal, owner loan settlement or equity movement without canonical metadata.
- Missing decrease movements remain visible as a reconciliation warning; they are never fabricated
  from workbook notes or transaction descriptions.

### BR-REC-001 — Candidate matching

Confidence uses amount, date tolerance, reference, counterparty, currency and outstanding balance.

- Auto-match only with one unambiguous candidate above threshold.
- Ambiguous candidates require review.

### BR-REC-002 — Allocation limits

- One bank transaction may split across documents; multiple transactions may settle one document.
- Allocation cannot exceed remaining transaction/document balance.

### BR-REC-003 — Reconciliation lock

- Reconciled item cannot be rematched until authorized unreconcile with reason.
- Book balance and statement balance differences remain visible as reconciling/suspense items.

## 7. Projects, time and cost allocation

### BR-PRJ-001 — Project lifecycle

`planned → active → on_hold → completed → closed`

- Closed project rejects new time/expense/invoice allocations unless approved reopen.
- Project captures client, contract type, currency, budget, dates and owner.
- Project identity and operating attributes remain editable through the versioned master-data API,
  first-party CLI and admin UI while the project exists. The immutability rules for posted journals,
  issued documents and retained audit history do not make ordinary project master data read-only.
- A project may declare one default service line through the organization-scoped project master-data
  API and admin UI. The code must reference an active `service_line` dimension in the same
  organization; an assigned dimension cannot be deactivated or deleted until the project reference
  is changed or cleared.

### BR-PRJ-003 — Audited operational project deletion

- A project with no business or financial references may be hard-deleted as an operational-data
  correction, including removal of a duplicate import. Deletion requires organization-scoped write
  authorization, an optimistic resource version, a nonblank reason and an idempotency key.
- The delete records actor, correlation ID, reason, prior state and resulting resource version in the
  append-only audit trail. An idempotent replay returns the original result without a second effect.
- A project referenced by contracts, milestones, budgets, documents, expenses, time, project costs,
  revenue recognition, allocations or other canonical business data cannot be hard-deleted. The API
  returns a structured conflict so the project can instead be retained, closed or corrected.
- Deleting an eligible operational project never deletes or rewrites posted accounting entries,
  issued documents or audit history. Only posted accounting/history carries the strict immutable
  correction boundary; unrelated operational attributes remain maintainable.

### BR-PRJ-002 — Project directory filtering

- The project directory defaults to all lifecycle states so its count and card/Kanban views represent
  the complete project portfolio; users can explicitly narrow the list to one lifecycle state.
- Lifecycle state, selected execution-date range and text search are combined without changing the
  canonical project records. State and date selections are URL-backed so refresh and shared links
  restore the same directory view.
- A project matches a selected date range when its execution interval overlaps that range, including
  projects that start before the range or have no end date. Projects ending before the selected start
  or starting after the selected end are excluded.
- The directory offers both card and Kanban views. Kanban shows all canonical lifecycle columns and
  allows an authorized user to move one project between states through the same organization-scoped,
  audited project update service used by the form, CLI and API. Failed updates restore the prior
  column. Drag-and-drop is the only inline state control in Kanban; cards contain no duplicate state
  dropdown and stay focused on project identity and profile navigation. Precise non-drag state
  changes remain available in the project editor.

### BR-TIM-001 — Timesheet lifecycle

`draft → submitted → approved → locked/billed`

- Prevent overlapping time for the same person.
- Approved/billed time uses adjustment entries, not silent edits.
- Billable/non-billable and project/internal classification is explicit.

### BR-CST-001 — Effective labor cost rate

- Labor cost = approved hours × rate effective on work date.
- Rate changes never rewrite historical cost.
- Sensitive compensation inputs are access-controlled.

### BR-CST-002 — Direct costs

- Direct labor, freelancer, project tools/travel/vendor services are attributable to projects.
- Shared expenses remain overhead until allocated.

### BR-ALL-001 — Source allocation

- Document/timesheet allocation totals equal source total.
- A cost cannot be counted both directly and through overhead allocation.

### BR-ALL-002 — Overhead methods

Supported methods: revenue proportion, labor hours, headcount, fixed percentage and manual.

### BR-ALL-003 — Allocation versioning

- Allocation policy is versioned and locked after period close.
- Reports disclose before-overhead and after-overhead margin.

### BR-BUD-001 — Project budget

- Budget versions preserve baseline and revisions.
- Scope change records reason, approval and expected revenue/cost impact.

### BR-PRF-001 — Project profitability

- Gross margin = recognized project revenue − direct project cost.
- Contribution margin additionally subtracts attributable variable overhead.
- Fully loaded profit additionally subtracts allocated fixed overhead.

### BR-PRF-002 — Project reporting integrity

- Project report totals tie to ledger/read-model dimensions.
- Cash collected is not profit.
- Show unbilled work, overdue AR, overrun and missing dimensions as confidence flags.
- Approved timesheet service-line attribution takes precedence. When no approved timesheet supplies
  a service line, profitability uses the project's valid default service line; a project with that
  fallback must not be reported as `service-line-unclassified` solely because it has no timesheet.

## 8. Forecast and KPIs

### BR-FCT-001 — Target basis

- Target is versioned by period, organization/team/service/owner.
- Actual basis is explicit: recognized, invoiced or collected.

### BR-FCT-002 — Scenarios

- Base, best, worst and custom scenarios do not overwrite actual data.
- Month-end forecast snapshots are retained for accuracy review.

### BR-FCT-003 — Forecast composition

`actual-to-date + committed milestones + scheduled recurring + weighted pipeline + reviewed manual adjustment`

- Do not double-count the same commercial source as contract, invoice and opportunity.

### BR-FCT-004 — Cash forecast

Opening cash + expected collections + financing − payroll − AP due − recurring expense − tax/capex = projected closing cash.

- Owner funding is financing, not operating inflow.

### BR-KPI-001 — MoM and YoY

- Calendar/fiscal period definitions are explicit.
- Handle different month length, leap year and `Asia/Ho_Chi_Minh` cutoffs.
- Missing comparison data returns N/A, not 0%.

### BR-KPI-002 — Target attainment

- Show MTD actual versus prorated target and full-month target.
- Display selected actual basis.

### BR-KPI-003 — Profitability ratios

- Gross margin, operating margin and net margin are separate.
- ROS basis/formula is labeled and denominator zero returns N/A.

### BR-KPI-004 — ROI/ROE/ROA

- ROI requires object, denominator, period and included-cost policy.
- Project ROI, marketing ROI, ROE and ROA are not interchangeable.
- Missing/non-positive denominator returns N/A unless a reviewed formula says otherwise.

### BR-KPI-005 — Equity burn and runway

- Closing equity = opening equity + contributions − withdrawals + profit/loss + reviewed equity adjustments.
- Owner loans are liabilities unless formally converted.
- Equity consumed uses accumulated losses versus contributed capital.
- Accumulated loss includes reviewed retained earnings already posted to the retained-earnings
  account plus current unclosed earnings from the canonical Balance Sheet. The two sources remain
  explicit so current-period loss is not hidden before the closing journal.
- Owner-current/payable balances must be labeled as công nợ/vãng lai chủ; they are not presented as
  a formal loan or contributed capital without an explicit reclassification record.
- Net burn excludes owner funding from operating inflow.
- Direct cash-flow mapping classifies reviewed customer receipts, supplier payments, VAT,
  other-income/expense and income-tax counterpart accounts as operating. Clearing-account movements
  remain unclassified until their actual business purpose is resolved.
- Runway = unrestricted cash / average positive net burn; if net burn ≤ 0, show cash-generating/N/A.
- Dashboard must keep unrestricted cash separate from owner-adjusted net cash. Owner-adjusted net cash
  equals mapped company cash and bank balances less the positive closing Owner Payable/current-account
  liability. A debit owner-current balance does not increase available cash. The result may be negative
  when the company owes the owner more than its mapped cash and bank balances.
- The executive dashboard presents company bank and cash as one company-funds card with a visible
  component breakdown. It does not repeat bank, cash, their total or a hypothetical post-owner-
  settlement balance as separate headline cards when those cards answer the same liquidity question.
- The executive dashboard uses the complete positive closing `owner_current` Balance Sheet balance as
  the single amount that the company owes the owner. It does not display a second, potentially zero,
  operating-owner obligation beside the statutory owner balance.
- The three liquidity controls are shown together: mapped company cash and bank, company amount owed
  to the owner, and net company funds after that owner obligation. Net company funds equals mapped
  cash and bank less the positive closing owner-current liability.
- Executive metrics require an approved, organization-scoped policy covering the complete requested
  period. The policy maps each semantic to a real chart-of-accounts code; `owner_loan` remains a
  liability semantic and never increases contributed capital.
- Policy versions use maker-checker approval, except the organization owner may self-approve in
  `solopreneur` mode; the self-approval remains explicitly audited. A report must fail
  with an actionable missing-policy state when coverage is absent; the UI must never replace that
  failure with fixture metrics.
- Purpose-specific ROI is displayed only from approved definitions and reviewed benefit/cost facts.
  An empty ROI source set is shown as not configured, never as a fabricated project or campaign.

## 9. Reports and exports

### BR-UI-001 — Financial drill-down

- Every dashboard/report amount drills down to read-model rows, journal lines, source documents and authorized evidence.
- A UI aggregate may not use a different formula from the report/API source.
- Financial cards must not fall back to embedded demo amounts. When a canonical API value is
  unavailable, the UI displays an explicit missing-data or review-required state.
- The executive dashboard prioritizes owner-actionable controls: collectible receivables, bank and
  cash position, owner-adjusted net cash, VAT payable and provisional CIT. Runway remains available
  in dedicated cash-flow/performance reporting but is not a dashboard headline because the owner
  evaluates operating duration directly from the displayed money position. Detailed contract,
  invoice, project-margin and profitability ratios remain on their dedicated workspaces.

### BR-UI-002 — Review and replay UX

- Review queues show validation reason, source payload, mapping gaps and safe remediation actions.
- Replay is explicit, authorized, idempotent and audited; UI never silently drops failed events.

### BR-UI-005 — Revenue and expense chart category consistency

- Revenue and expense management charts use the same canonical category/dimension identity exposed
  by their detail and listing records; chart-only synthetic business categories are prohibited.
- Commercial documents are aggregated per line so a multi-line document may contribute to multiple
  category series. The chart must not assign the whole document to its first line's dimension.
- Non-invoice expense list rows use persisted `dimensions.category` when present and otherwise fall
  back to the canonical line `expense_category_code` returned by the versioned expense API.
- A missing category is rendered explicitly as **Doanh thu chưa phân loại** or **Chi phí chưa phân
  loại** according to the row's canonical source. Missing data must not be silently mapped to a
  configured category.

### BR-UI-006 — Dashboard data-source parity

- Dashboard trend and planning controls may read aggregated workbook or posted-ledger report sources
  when their accounting status is disclosed.
- The Dashboard expense-category overview uses the same purchase-invoice and non-invoice expense
  population, period filtering, canonical category builder and shared component as Expense
  Management. It must not create a separate `Chưa phân bổ` category or exclude non-invoice expenses.
- A canonical expense overview load failure is shown explicitly and is never replaced by stale
  workbook category controls.

### BR-UI-003 — Operational UI parity

- Mỗi module backend đã công bố là khả dụng phải có danh sách và thao tác nghiệp vụ chính trên admin UI; JSON console chỉ là công cụ nâng cao.
- UI gọi cùng REST application services với CLI/AI và không được bỏ qua organization scope, RBAC, audit, idempotency, maker-checker hoặc period locks.
- Trạng thái lỗi API phải hiển thị rõ; UI không được giả lập thành công khi mutation thất bại.

### BR-UI-004 — Reusable design system

- Admin modules use shared semantic tokens and accessible component primitives instead of per-screen raw controls or hard-coded visual rules.
- Lists, forms, dialogs, feedback, loading and empty states follow one documented composition contract.
- Responsive behavior preserves navigation and primary workflows without JavaScript-only layout assumptions.

### BR-RPT-001 — Trial Balance and General Ledger

- Trial Balance balances to zero net debit/credit difference.
- Every summary amount drills down to journal lines and source documents.

### BR-RPT-002 — P&L

- Accrual management basis is default; cash view is labeled separately.
- Revenue, direct cost, gross profit, OPEX, operating profit, other items and net profit are distinct.

### BR-RPT-003 — Balance Sheet

- Validate `Assets = Liabilities + Equity` for every run.
- A mismatch fails loudly; no hidden plug.

### BR-RPT-004 — Cash Flow

- Separate operating, investing and financing cash flows.
- Capital contribution/loan is not revenue; owner withdrawal is not operating expense.

### BR-EXPOR-001 — Accountant export

- Export is reproducible, versioned and audited.
- Include mapping status and unresolved items; do not label final when confidence thresholds fail.

### BR-EXPOR-002 — Portable organization data package

- A portable organization export is a versioned XLSX workbook plus a machine-readable manifest. It
  inventories every canonical organization-scoped business resource as an included sheet or an
  explicit excluded entry with a reviewed reason; silent omission is invalid.
- The manifest records package/export ID, schema version, organization, cutoff, workbook checksum,
  per-resource sheet name, row count, checksum, dependency order and mutability. Exact money values
  remain minor-unit strings and stable IDs, external references, resource versions, relationships
  and lifecycle states survive the round trip.
- Editable rows declare one operation: `no_change`, `create`, `update`, `deactivate`, `cancel` or
  `reverse_replace`. Issued/posted history is never overwritten; journal history is read-only and
  financial corrections use the canonical cancellation, reversal and replacement services.
- Import first performs inventory/completeness validation and a deterministic zero-mutation dry-run,
  then resolves dependencies and returns row-level diffs, warnings and structured field errors.
  Commit is explicit, organization-scoped, authorized, audited, version-checked and idempotent.
- An unchanged export imported into the same compatible organization is a no-op. Missing or unknown
  required sheets, cross-organization references, stale versions, closed-period effects, edited
  posted history and unresolved relationships reject commit without partial accounting effects.
- Secrets, token hashes, signed URLs and binary evidence are never exported. Paperless remains the
  source of document bytes; the package carries only durable external references and checksums.
- Post-import controls reconcile resource counts and canonical Trial Balance, P&L, Balance Sheet,
  cash, AR/AP, tax and project reporting at the package cutoff.

### BR-EXPOR-003 — Filtered accounting list workbooks

- Accountants can export sales invoices separately from a combined purchase-invoice and non-invoice
  expense workbook, using organization-scoped date, lifecycle, party/payee, project and invoice
  presence filters.
- The combined expense workbook preserves canonical `sourceType`; supplier/date/amount similarity
  never merges a purchase invoice with an expense.
- Workbooks lead with an accountant-readable `Bảng kê bán ra` or `Bảng kê mua vào` sheet containing
  organization/period headings, invoice series-number-date, counterparty tax ID, item description,
  pre-tax amount, VAT rate, VAT amount, gross amount, lifecycle state and formula-driven totals.
  Summary, Records, Lines and Filters remain present so stable IDs, relationships, source type and
  exact canonical values are never lost behind the presentation sheet.
- Non-invoice expenses have blank invoice identity and are explicitly labelled as non-invoice; the
  export never invents a series or invoice number. Dates are typed dates and money is typed numeric
  data in the presentation sheet so Excel formulas and month/quarter controls remain usable.
- REST and the first-party CLI use the same filters. Downloads are XLSX attachments with a SHA-256
  checksum and never bypass authorization, organization isolation or audit controls.

### BR-SNP-001 — Report snapshot

- Snapshot identifies ledger version/cutoff, formula versions, organization, period and dimensions.
- Same inputs reproduce the same result.

## 10. Integrations, security and operations

### BR-INT-001 — Inbound idempotency

- Same key + same payload returns same result.
- Same key + different payload returns conflict.
- Store raw payload hash and attempts.

### BR-INT-002 — Signature and replay protection

- Verify signature, timestamp window and source identity before processing.
- Failed verification creates no business mutation.

### BR-INT-003 — Quarantine

- Invalid/unmapped payload enters review/quarantine with reason and can be replayed after correction.

### BR-OUT-001 — Transactional outbox

- Business transaction and outbox record commit atomically.
- Delivery is at-least-once; consumers must be idempotent.

### BR-OUT-002 — Retry and dead-letter

- Exponential backoff, attempt history and dead-letter state.
- Manual replay requires authorization and audit.

### BR-SEC-001 — Authorization

- Default deny; resource/action scopes and organization membership required.
- Maker/checker segregation is tested.

### BR-SEC-002 — Sensitive data

- Secrets are never stored in source or plaintext business records.
- Salary/cost rate, evidence and exports use least privilege.
- Production login uses an encrypted, versioned `HttpOnly` session cookie with an explicit expiry.
  The API credential is never returned to or persisted by browser JavaScript.
- The session encryption secret is server-only, shared by web and API and remains stable across
  application updates. Rotating it intentionally invalidates existing sessions.
- Cookie-authenticated financial mutations require a same-origin request and organization match.
  Existing first-party CLI and integration Bearer authentication remains supported.

### BR-OPS-001 — Observability

- Correlation ID connects request, job, journal and webhook delivery.
- Logs never contain secrets or complete sensitive evidence payloads.

### BR-OPS-002 — Backup and restore

- Backups are encrypted, retained and periodically restored/tested.
- Restore evidence includes schema version and financial control totals.

### BR-OPS-003 — Migration before rollout

- A single migration job runs before app rollout.
- API replicas do not race migrations.
- Schema changes follow expand/contract compatibility.

### BR-OPS-004 — Production confidence

- Go-live requires reconciled control totals, healthy services, rollback target and approved release manifest.

### BR-REL-001 — Main images

- Main build publishes immutable `sha-*` plus moving `main`; production does not use moving tag as rollback identity.

### BR-REL-002 — Semantic release

- `vX.Y.Z` produces immutable semver images, SBOM, provenance, signatures and migration notes.

### BR-DEP-001 — Approved deployment

- Image publication does not imply production deployment.
- Production needs protected-environment approval and immutable digest.

### BR-DEP-002 — Rollback

- App rollback uses recorded digest.
- Database rollback requires compatible schema, explicit down/forward fix or tested backup restore.

### BR-MIG-001 — Source inventory and mapping

- Source datasets, field mappings, ownership and control totals are explicit before import.

### BR-MIG-002 — Dry-run import

- Dry run produces deterministic rejects, duplicate warnings and financial control totals without mutating production.

### BR-MIG-003 — Parallel reconciliation

- Parallel run compares Trial Balance, P&L, Balance Sheet, cash, AR/AP and project margins; unexplained variance blocks cutover.

### BR-MIG-004 — Cutover control

- Cutover requires owner/accountant approval, final backup, signed control totals and archived source/evidence.

### BR-MIG-005 — Local organization reset

- A destructive organization reset is available only in an explicitly local development runtime.
- Reset requires the exact organization ID, a completed Full ERP Data Package ID and matching
  workbook SHA-256. Missing or mismatched backup evidence rejects the reset.
- The operation preserves the organization identity, memberships, API credentials and approved
  baseline configuration while removing organization-scoped business/demo records transactionally.
- Production, non-loopback API bases and unconfirmed organization targets are always rejected.

### BR-MIG-006 — Controlled empty-tenant organization restore

- A Full ERP Data Package can restore canonical organization data into an explicitly empty target
  organization through a versioned API and the first-party CLI; direct PostgreSQL access is not an
  integration path.
- Restore requires owner/platform authorization, exact source and target organization confirmation,
  package ID, workbook SHA-256, schema compatibility, idempotency and a nonblank reason.
- Authentication credentials, secrets, replay controls and package blobs are never copied. Target
  credentials and membership are provisioned separately before restore.
- Business/master data, posted ledgers, bank source rows and their relationships restore in one
  controlled transaction. Existing target business rows reject the operation.
- Completion requires source-versus-target resource counts, deterministic hashes, balanced-journal
  checks and financial control totals with zero unexplained variance.

## Traceability requirement

Every implemented feature must trace:

`ERP task → BR rule → API/domain operation → database invariant → tests → evidence → affected report`

No task may be marked done with orphan business rules or untested behavior.
