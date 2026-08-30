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
- Cross-resource business fingerprints (organization, supplier/payee, date, gross amount and currency)
  reject duplicate purchase invoices and non-invoice expenses even when document numbers or external
  IDs differ. Cancelled/reversed originals are excluded from the active fingerprint so an approved
  correction or migration replacement can be created without weakening history immutability.
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
- Operational listings show the current canonical source set by default: commercial documents in
  `cancelled` state and expenses in `reversed` state are hidden so a correction's original and
  replacement are not presented as duplicate spend. An explicit lifecycle-state filter and the
  detail route remain available for audit and history review.
- Revenue Management shows invoiced revenue activity separately from recognized revenue activity.
  These axes are visibly labeled and are never added together as one revenue total. A recognition
  event without an explicit invoice relationship is shown as non-invoice activity; the UI never
  guesses a link from amount, date or project.
- Expense Management shows purchase invoices and non-invoice expense records in one listing. Every
  row retains its canonical source type, endpoint, lifecycle and correction form; the UI never fuzzy
  deduplicates supplier/date/amount matches.
- Expense rows normalize both camelCase and snake_case API compatibility fields into one presentation
  model for date, payee, category, description and amount; a missing camelCase alias must not blank a
  value that is present in the canonical API payload.
- Invoice and expense list/detail surfaces use one category presentation contract: prefer the root
  category projection, then read the canonical category code from owning line fields (`categoryCode` /
  `expenseCategoryCode`) when a compatibility response omits the root projection. Allocation dimensions
  are relationship-only and never supply or override category. The contract must never invent a category
  from account codes or form defaults.
- Stable invoice, expense and revenue-recognition detail routes remain available from the unified
  listings.
- Revenue invoice and recognition surfaces share one presentation contract for customer, project,
  activity date, amount, currency and lifecycle state. Recognition derives its customer only through
  its canonical project relationship; commercial documents retain their direct party relationship
  and allocation-based project relationships. Technical policy, evidence, actor and version fields
  remain available to API clients but are not duplicated in ordinary business tables or forms.

### BR-MVP-008 — Unified revenue and expense category catalog

- Revenue and expense forms select only active, organization-scoped categories from the canonical
  `master-data/categories` resource; clients must not silently fall back to hardcoded demo values.
- Each category has a stable code, display name, kind (`revenue` or `expense`) and optional default
  account/tax mapping. The same catalog is used by validation, posting, reports and automation.
- Category mutations are versioned, audited, idempotent and deactivation preserves existing history.

### BR-MVP-004 — Minimal report readiness

- A clean installation receives a minimal approved TT133 account, tax and statement-mapping setup.
- Revenue, expense, profit, direct Cash Flow, VAT, paid/unpaid, MoM/YoY and target reports use existing canonical report formulas.
- Dashboard values must equal the report API response and drill down to posted sources.

### BR-MVP-005 — Release and controlled workbook import

- Production containers run non-root and become healthy through Docker Compose after migrate-once.
- A successful main-branch check publishes `main` and immutable `sha-<12>` images.
- Workbook import supports inventory, zero-mutation dry-run, explicit commit, row-level errors, retry idempotency and exact reconciliation to source controls.

## AI-native access

### BR-UX-001 — Simple input, backend-owned matching

- Everyday business input is expressed as one compact business payload from Web, REST or CLI;
  callers should not coordinate a chain of master-data, relationship and posting calls for one
  revenue, purchase or expense event.
- The backend performs organization-scoped deterministic matching (stable ID, exact business key,
  then one normalized name match), creates only the explicitly permitted missing master data and
  returns a structured ambiguity/error when it cannot match safely. It never guesses between
  multiple candidates.
- Primary screens expose progressive disclosure: one primary action and only the fields needed for
  the current workflow. Advanced identifiers, protocol details and correction mechanics stay behind
  a contextual dialog or API contract, not a tab bar or a form full of technical options.
- The same simplification applies to administrative workflows (master data, metadata correction,
  imports and background operations): one command may orchestrate safe backend steps while keeping
  RBAC, organization scope, idempotency, audit, version and accounting invariants intact.
- Simplification must not hide consequential state. Responses and screens still show the effective
  resource, warnings, unresolved fields and permitted `nextActions`; ambiguous input has zero
  mutation and financial history remains immutable.

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
- The focused expense screen exposes an owner-only automation protocol dialog from its page header.
  It documents the canonical complete purchase-invoice and purchase-product requests and may reveal
  the stable API credential already sealed in the authenticated server session only after an
  explicit same-origin action. The response is never cached, the token is never compiled into the
  browser bundle or committed to source, and operators are instructed to store it as an n8n
  credential rather than inside workflow JSON or logs.
- Production-backed native development may reveal the server-only upstream credential injected by
  the approved data-source launcher or read the same credential from the operator's macOS Keychain.
  Production itself still requires a valid encrypted login session; neither path reads a public
  browser environment variable.
- Purchase-invoice automation uses `commercial-documents`, not the descriptive expense-metadata

### BR-AI-006 — Unified business metadata correction

- Authorized users may correct the customer or supplier/payee, project, category and business
  description of revenue and expense records from Web, REST or CLI through one canonical command.
- The client submits the intended final metadata once. The backend resolves stable master-data IDs,
  validates organization scope and relationship compatibility, and returns structured ambiguity or
  field errors instead of requiring callers to coordinate several APIs.
- Draft records are updated in place with optimistic concurrency, idempotency and audit evidence.
- For issued or posted records, the same command plans and atomically performs the permitted
  credit/reversal and linked replacement in an open period. Posted journals and original source
  history remain immutable; "editable" never means overwriting accounting history.
- Amounts, tax treatment, accounts and payment/reconciliation effects remain financial corrections,
  not unrestricted metadata. They use their canonical correction workflows and safeguards.
  correction endpoint. Integrations follow returned `nextActions`; a solopreneur owner create may
  atomically finish as `posted` or `paid`, while controlled-mode clients must perform only the
  lifecycle actions permitted by the response.
- Every primary business input screen exposes the same authenticated `API & tự động hóa` action,
  but its dialog contains only the protocol examples relevant to that screen: customers, projects,
  service plans/subscriptions, purchase products, revenue or expenses.
- Customer creation is ordered as party creation followed by the explicit `client` party role. A
  project retains that returned party ID as `client_party_id`; it never guesses a customer from a
  display name.
- A customer subscription retains the verified `customerPartyId`, `servicePlanId` and optional
  `projectId`. Revenue uses the customer `partyId` and project allocation; purchase invoices and
  direct expenses use their canonical endpoints and must never duplicate the same business event.
- The expense protocol provides one copyable quick-ingestion cURL. The backend resolves the supplier
  by normalized organization-scoped tax ID, creates the party and explicit `supplier` role when
  absent, then creates the canonical purchase invoice. The caller does not coordinate three HTTP
  mutations or provide project, payment-account or accounting-account IDs.
- The quick path accepts supplier tax ID/name, invoice number/date, an optional human-readable
  category hint, description and gross amount. It resolves an exact active category code/name first,
  then accepts only one strong deterministic name match from the organization category catalog.
  Ambiguous or unknown matches fail before supplier mutation. Until real VAT is supplied it records
  the gross amount as management cost, uses zero deductible VAT and keeps tax eligibility
  `unreviewed`; it must not claim guessed input VAT.
- A commercial document may be hard-deleted only while it is an unreferenced `draft` with no journal.
  Deletion requires organization scope, write authorization, the current resource version, a reason
  and an idempotency key, and retains an audit record. Posted or otherwise progressed invoices are
  never hard-deleted; they use the canonical cancel or reversal workflow.
- Malformed automation payloads return the ERP validation code instead of leaking JavaScript
  property-access errors such as attempting to call `map` on an absent line collection.
- The expense protocol provides a paste-ready n8n expression object for the staging step before ERP
  mutation. It maps all available `$json.output` OCR labels and Paperless metadata in one operation,
  normalizes tax ID, VND money and signed date, retains raw OCR output, and explicitly reports fields
  still missing before the commercial-document create call. Staging data never marks itself ready to
  post merely because a gross total was extracted.

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

Expense and purchase-invoice records may carry an optional organization-scoped
`fundingFinancialAccountId`. This provenance identifies the actual company bank/cash account used
for settlement (including the owner's custody cash account) and is retained independently from the
category `fundingTreatment`. Historical rows may remain null when evidence is unavailable; clients
must not infer a source account from a ledger code alone.

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
  ROI definitions, planning, forecast adjustments and project recognition.
- Solopreneur self-approval always records actor, reason, timestamp, resource version and audit event.
  It never bypasses RBAC, idempotency, period locks, balanced-journal validation, duplicate controls
  or immutable posted history. Missing evidence and unresolved tax classification remain explicit
  record-level warnings and eligibility states; they do not require a second approver.
- `NAAI_ERP_SOLOPRENEUR=true` bootstraps the login organization only when its workflow policy is
  missing. The persisted organization policy remains the runtime source of truth.

### BR-WFL-002 — State transition integrity

- Invalid transitions are rejected.
- Approval does not imply payment or tax eligibility.
- Controlled mode requires its configured approval state before posting. In solopreneur mode, the
  authenticated owner may complete eligible create/save, self-approval and posting in one atomic
  command when accounting inputs are valid.
- Every REST mutation is classified in the reviewed solopreneur gate matrix as `none`, `draft`,
  `posted`, `correction` or `destructive`. No mutation that can post, settle, reverse, reconcile,
  change a fiscal period or alter retained financial history may be classified `none`.
- Solopreneur simplification may collapse intermediate submit/review/approve steps but never collapses
  the distinction between draft input and a posted accounting effect. Posted correction and destructive
  effects remain explicit and retain their accounting/security safeguards. Controlled-mode behavior
  is unchanged.

### BR-WFL-003 — Immediate solopreneur management visibility

- Valid input saved by the authenticated organization owner is immediately available to management
  reporting. Commercial documents and expenses use one `save and record` action that atomically
  completes eligible owner self-approval and the normal issue/post operation.
- Management metadata such as payee/customer, project, category and descriptive dimensions may be
  corrected directly through an audited, versioned command for drafts and for issued, posted,
  partially-paid or paid documents when the change does not rewrite posted debit, credit or tax
  amounts. The UI must not disable this metadata path because a document is paid. Accounting-impacting
  corrections still use reversal and replacement.
- Canonical posted transactions affect account balances immediately. Statement import and
  reconciliation identify differences and matches; they do not gate visibility until period close.
- Missing evidence, tax eligibility or optional dimensions produce source-level warnings. One
  incomplete source cannot make unrelated canonical dashboard cards or an entire report unavailable.
- Planning and management read models read canonical sources on demand or refresh inside the source
  mutation. They never return a user-actionable `STALE` state requiring a separate backfill workflow.

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
- The self-hosted operational AP workspace contains only unpaid actual freelance costs created from
  a posted canonical expense with one project, freelancer-role payee and due date. Project budget is
  forecast only and purchase invoices are excluded from this operational payable population.
- An ordinary purchase invoice may default to settled only when its create contract carries an
  explicit active same-currency `financial_account` funding source. Posting resolves the ledger
  account server-side, credits that funding account and marks the invoice paid atomically. Without
  canonical funding it remains posted; a state-only paid flag is prohibited.

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
- Quick creation requires only the readable service name and default exact price. The application
  service derives a stable uppercase ASCII code with deterministic numeric collision suffixes,
  resolves the active canonical organization service line in policy order (`RETAINER_FEE`, then
  `SYSTEM_MAINTENANCE`, then the first active code), and defaults to VND billed monthly with
  interval `1` and billing day `1`. Technical identifiers and audit reason are not exposed as
  required fields in the quick-create dialog; the versioned API keeps them optional and explicit.
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
- A manual customer receipt records an actual cash or bank inflow through one active organization
  financial account and allocates the exact receipt amount to one or more eligible issued sales
  invoices for the same customer and currency. Unallocated manual receipts are not silently created.
- Posting is atomic and balanced: debit the selected funding account and credit each invoice's AR
  control account. The receipt date must be in an open posting period; audit, authorization and
  idempotency apply. Invoice `partially_paid` or `paid` state is derived from all canonical
  reconciliation and manual-receipt allocations, never from a UI-only flag.

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
  or freelancer attribution uses the party directory and explicit party roles; the UI never depends
  on a separate workforce profile.
- A direct expense may optionally select the project receiving the cost. That project is also the
  user-facing commercial contract, so no separate contract selector is exposed. The supplier/payee
  remains independent from the receiving project's customer. Draft edits preserve existing
  allocation IDs and unrelated dimensions while canonicalizing the relationship to `projectId`.
- A draft created in error may be discarded before submission. Discard requires write authorization,
  optimistic version matching, a nonblank reason, idempotency, and retained audit/outbox evidence;
- Posted expenses may receive one audited, versioned and idempotent metadata correction for the
  active supplier/payee, business-purpose text, line descriptions and canonical `expenseCategoryCode`.
  Legacy `dimensions.category` is read only during migration and is never written by the active path.
  The quick-edit UI presents these fields as one save action instead of separate category and
  document-update actions. This operation never changes amounts, tax states, allocations, funding
  treatment, account codes, journal linkage or any other posted financial field. Every correction
  retains before/after audit evidence; a payee must resolve to one active supplier party in the same
  organization.
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

- Accounting recognition is independent of tax readiness. A posted business expense remains in
  accounting profit and management cost when CIT or VAT is `unreviewed` or evidence is missing.
  Only VAT deductibility, CIT deductibility and tax-report finality are reduced or warned locally.

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
- The Owner Current cash timeline uses the immutable funding snapshot when present. For imported
  legacy expenses whose snapshot is null, it uses the reviewed funding treatment of the canonical
  category recorded on that historical line. This compatibility rule restores known cash-paid
  categories without treating every invoice or Owner Current credit as owner-paid.
- `tax_only_non_cash` remains available for VAT/CIT evidence and tax reporting but does not reduce
  management net company funds.
- Official dashboard balances include posted records only and disclose uncategorized or unreviewed
  records separately.
- When company funds are held in the owner's custody account, the confirmed custody amount is the
  reconciled custody inflow less posted expenses paid directly from that custody account as of the
  reporting date. Such expenses reduce both physical custody cash and the dashboard's owner-held
  company-funds metric.
- Funding source is a separate management dimension: `company_bank`, `company_cash`,
  `owner_custody_cash`, or `owner_personal_advance`. A purchase invoice reduces owner custody only
  when its explicit funding financial account is `CASH-OWNER-CUSTODY`; an Owner Current credit alone
  is not evidence of custody cash. `owner_personal_advance` increases the owner payable and leaves
  custody unchanged. The dashboard excludes owner custody from company available cash to prevent
  double counting, while preserving the original funding treatment and audit provenance.
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
  bank-to-cash transfer; it does not change statutory Owner Current merely because the owner is the
  custodian. It does reduce the confirmed management settlement still payable to the owner because
  the owner already holds that company cash for future company spending.

### BR-BNK-003 — Internal transfer

- Transfer between own accounts does not affect P&L.
- Bank fee is a separate line.
- Transit account may be used while only one side is imported.

### BR-BNK-004 — Owner-current reconciliation view

- The banking workspace presents only the confirmed owner-cash timeline without changing the executive
  dashboard metric. Confirmed owner-paid costs, company repayments and owner funding are shown in the
  main timeline. Movements without direct source-of-funds evidence remain excluded from confirmed owner
  debt and available through canonical expense or ledger records, but are not rendered as an Owner Current
  review table or management metric.
- The read-only owner-current ledger view is resolved from the approved Balance Sheet `owner_current`
  mapping, posted/reversed journals and organization financial accounts.
- Every row shows the journal, signed owner-liability effect, signed company-funds effect and running
  owner-current balance. The totals must reconcile exactly to the mapped ledger balance.
- `owner_paid_company_cost` requires a canonical posted expense whose effective treatment is
  `owner_paid_company_cost`, together with an Owner Current credit. Effective treatment uses the line
  snapshot first and the reviewed historical category only when the snapshot is null. Invoice presence
  and an Owner Current credit alone do not prove actual owner payment; costs whose effective category
  treatment is company-funded remain review-required.
- `company_repayment_to_owner` requires the same journal to debit Owner Current and credit a configured
  company bank/cash account. It reduces the amount owed to the owner and never creates a second expense.
- Owner Current credits without canonical owner-paid expense evidence, and debits without a company-funds
  repayment leg, remain explicit review-required adjustments. Classification never relies on description,
  amount or date similarity.
- Historical repayment classification includes configured company bank/cash accounts that later became
  inactive; deactivation does not erase the meaning of posted history.
- When a movement originates from an expense, the read model exposes the canonical expense ID,
  business purpose, expense class, category and tax-review states. The UI links to the expense detail
  instead of forcing the owner to infer the purchase from a generic journal description.
- A company payment to the owner is identified only when the same journal debits Owner Current and
  credits a configured company bank/cash account. The UI does not guess whether the payment is a
  reimbursement, withdrawal, owner loan settlement or equity movement without canonical metadata.
- Missing decrease movements remain visible as a reconciliation warning; they are never fabricated
  from workbook notes or transaction descriptions.
- The confirmed timeline contains only actual cash-source movements: an explicitly owner-paid expense,
  owner funding into configured company bank/cash, or company bank/cash paid or withdrawn to clear
  Owner Current. A transfer between company bank and company cash remains internal and is excluded.
- Confirmed running balance is calculated in chronological journal order and represents the balance
  immediately after each confirmed movement. Review-required entries do not alter that confirmed
  running balance. The complete ledger closing balance remains separately disclosed and continues to
  feed the unchanged executive dashboard metric.
- The confirmed owner-settlement position equals owner-paid company costs plus owner funding, less
  total owner-custody transfers and evidenced company repayments/personal withdrawals. The remaining
  physical custody balance is displayed separately and is never subtracted a second time. Timing does not matter:
  the owner may receive company cash before or after paying company expenses.
- Invoiced, recognized or collected revenue does not reduce settlement merely because it is revenue.
  A reduction requires canonical evidence that the cash is held or withdrawn by the owner. Unsupported
  repayment journals remain in review and do not reduce the confirmed settlement position.
- A positive confirmed settlement is `Công ty đang nợ chủ`. A negative position is shown separately
  as company funds currently held by the owner, never as negative company debt. Statutory Owner Current
  remains visible for accounting reconciliation.
- A manual owner personal withdrawal is recorded through one versioned banking command, never by
  submitting arbitrary journal lines from the UI. The command accepts an active organization bank or
  cash account, a positive exact amount, date and note; atomically creates a negative cash transaction,
  a balanced posted journal (Dr approved Owner Current / Cr selected company-funds account), canonical
  withdrawal evidence, audit and outbox records. Idempotency, organization scope and fiscal-period locks
  apply. Corrections use normal reversal rather than mutating the posted journal.

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
- A project referenced by contracts, milestones, budgets, documents, expenses, revenue recognition,
  allocations or other canonical business data cannot be hard-deleted. The API
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
- When the directory URL has no explicit period, the effective selection is the current calendar
  year; the visible period navigator and the applied project filter must never disagree.
- Project cards present recognized and invoiced progress as separate axes against the contract
  commitment. Collection remains a
  separate accounting/read-model measure but is not duplicated on directory cards for organizations
  whose issued-invoice workflow treats invoicing as the operational completion signal.
- The directory offers both card and Kanban views. Kanban shows all canonical lifecycle columns and
  allows an authorized user to move one project between states through the same organization-scoped,
  audited project update service used by the form, CLI and API. Failed updates restore the prior
  column. Drag-and-drop is the only inline state control in Kanban; cards contain no duplicate state
  dropdown and stay focused on project identity and profile navigation. Precise non-drag state
  changes remain available in the project editor.

### BR-CST-002 — Direct costs

- A canonical Expense has zero or one project. A posted Expense with a project is counted once as a
  direct project cost; an Expense without a project is company overhead and is excluded from project
  margin.
- A posted purchase commercial-document allocation with a project is counted once as direct project
  cost. Draft, cancelled and reversed sources are excluded.
- Freelancer cost becomes an actual project cost only when the canonical Expense is posted. A project
  budget or planned freelance amount does not itself create cost or a payable.
- Project cost reports read posted canonical Expense and commercial-document allocation dimensions.
  They do not create derived cost-item queues or direct/overhead allocation runs.

### BR-BUD-001 — Project budget

- Budget versions preserve baseline and revisions.
- Scope change records reason, approval and expected revenue/cost impact.

### BR-PRF-001 — Project profitability

- Gross margin = recognized project revenue − direct project cost.
- Company overhead without a project is deliberately excluded from project gross margin.

### BR-PRF-002 — Project reporting integrity

- Project report totals tie to ledger/read-model dimensions.
- Cash collected is not profit.
- Show unbilled work, overdue AR, overrun and missing dimensions as confidence flags.
- Service-line reporting uses the canonical posted source dimension and then the project's valid
  default service line. It never depends on a removed timesheet or allocation subsystem.

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
- The executive dashboard uses the positive confirmed owner-settlement position as the amount the
  company currently owes the owner. When the position is negative, the debt card is zero and the
  dashboard separately shows the absolute company funds held by the owner. The statutory
  `owner_current` Balance Sheet balance remains available through reconciliation drill-down.
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
- UI gọi cùng REST application services với CLI/AI và không được bỏ qua organization scope, RBAC,
  audit, idempotency hoặc period locks. Controlled mode retains maker-checker; solopreneur mode uses
  the persisted owner self-completion policy instead of requiring a second reviewer.
- Trạng thái lỗi API phải hiển thị rõ; UI không được giả lập thành công khi mutation thất bại.

### BR-UI-004 — Reusable design system

- Admin modules use shared semantic tokens and accessible component primitives instead of per-screen raw controls or hard-coded visual rules.
- Product color is defined once through the shadcn theme contract: primary actions, navigation,
  charts, focus rings and contextual surfaces use semantic tokens and supported component variants.
  Screens must not add raw palette utilities or per-page color overrides. Color remains accessible
  in light and dark modes and never becomes the sole carrier of accounting or lifecycle meaning.
- Lists, forms, dialogs, feedback, loading and empty states follow one documented composition contract.
- Responsive behavior preserves navigation and primary workflows without JavaScript-only layout assumptions.
- Collapsed sidebar submenus use shared accessible overlay/navigation primitives and preserve a
  stable pointer path from trigger to submenu; custom hover timers and flickering open/close loops
  are prohibited.
- Financial analysis pages use the shared URL-backed year/quarter/month navigator and the standard
  filter popover composition. Drill-down values remain directly clickable without decorative arrow
  affordances that add visual noise but no distinct action.
- Dashboard overview cards may combine an exact canonical value, concise business context, status
  and a trend chart only when the underlying API provides a matching time series. Trend visuals use
  shared chart tokens and never replace the exact value or invent missing data.
- API contracts must use the same field names as runtime responses. Compatibility query aliases may
  remain accepted and documented as deprecated, but first-party UI uses only the canonical names and
  does not render raw IDs, stale optional fields or literal `undefined` as business information.
- Customer and project directory cards expose enough canonical context to distinguish records
  without opening each profile. Customer cards show tax and available contact/identity details;
  project cards show customer, service, budget and execution period. Missing values are stated
  explicitly, status and actions retain consistent positions, and mobile layouts must not overflow.
- Project cards show commercial progress as separate contract, invoiced and collected measures.
  Collected progress uses only posted/reconciled receipts, attributes gross settlement to the
  project's net invoice share without counting VAT as revenue, and never combines invoiced and
  collected percentages into one additive completion number.

### BR-UI-007 — Sidebar-owned page navigation

- Navigation between sibling routes belongs in the primary sidebar and its named submenus.
- Workspace headers may contain page actions, filters, view controls and contextual back links, but
  they must not duplicate the sidebar with tab-like buttons or links that switch to sibling pages.
- Desktop expanded, desktop collapsed and mobile navigation expose the same available child routes.
- Tabs remain valid only when they switch content sections within the same route and preserve one
  workspace identity.

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

### BR-RPT-005 — Monthly expense analysis by payee and category

- Management expense analysis includes canonical posted purchase invoices and posted direct expense
  records only. Draft, approved-but-unposted, cancelled and reversed sources are excluded.
- The payee report counts each source header exactly once and resolves the canonical same-organization
  party display name. The category report aggregates source lines using the persisted category code;
  a missing category remains explicitly unclassified and is never inferred from an account code.
- `startsOn` and `endsOn` are inclusive. Sources are grouped by document/expense date into calendar
  months (`YYYY-MM`) and every row drills down to the exact source set for that month and dimension.
- Net, VAT and gross amounts remain exact minor-unit strings. Different source currencies are
  reported as separate series and are never added together without a reviewed conversion basis.
- Within each currency and period, the payee total and category total reconcile to the same canonical
  posted-source population. The API, CLI and UI use one shared read model and organization scope.

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
- Workbook sheets come from a reviewed portable-resource disposition, not unrestricted database
  introspection. Canonical top-level resources are included when rows exist; an empty resource is
  recorded in the manifest with `empty_at_cutoff` instead of creating a blank worksheet.
- Child rows already embedded in their canonical parent, operational event/attempt tables, staging
  tables and derived read models are recorded as excluded with a stable reason and are never emitted
  as duplicate user-facing worksheets. Explicit exclusion remains visible and is not silent omission.
- Stored package blobs are bounded per organization. After a successful generation, the system keeps
  the newest configured number of completed packages and deletes older package blobs/rows without
  deleting canonical business data, posted journals or append-only resource audit history.

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
- Stored accountant workbook blobs use the same bounded, organization-scoped retention policy as
  portable packages. Retention runs only after a successful new export and never removes canonical
  documents, journal history or audit evidence.

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
- Production may continue consuming moving `latest` images, but the supported update command must
  pull all images, recreate and wait for the one-shot migrate service to exit successfully, then
  recreate application services and verify health. Restarting Watchtower-managed app containers alone
  is not accepted as migration evidence because an exited migrate container is not automatically run.

### BR-OPS-005 — Bounded database storage maintenance

- Generated export/import blobs have explicit organization-scoped retention; financial source rows,
  posted ledger history and append-only audits have no generic age-based deletion.
- Storage diagnostics report database size, relation/TOAST size, live/dead tuples and retained blob
  counts without mutation. Reclaim operations that require table locks, including `VACUUM FULL` or
  `pg_repack`, require an explicit maintenance window and backup evidence.

### BR-OPS-004 — Production confidence

### BR-OPS-006 — Background activity log visibility and bounded retention

- Authorized organization members with the operations/read scope can view a paginated, filterable
  activity stream for background workers and maintenance jobs (job name, status, started/finished
  time, duration, correlation ID, attempt and a redacted error summary).
- The stream is an operational read model only. It may include worker, outbox-delivery and
  maintenance activity, but never replaces the append-only resource/audit chain or posted ledger
  evidence. Organization filters are mandatory and cross-organization rows are never disclosed.
- Log messages and structured metadata are redacted before persistence and before API/CLI output;
  credentials, authorization headers, tokens, raw evidence and complete financial payloads must not
  be stored or returned.
- Operational activity rows use a configurable age-based retention policy with a documented default
  of 30 days. A scheduled cleanup removes only rows older than the effective policy (and may be
  safely retried); it never deletes journals, source documents, resource audit events or immutable
  outbox history. The effective retention and last cleanup result are visible to operators.
- Reads support deterministic cursor pagination and time/status/job filters. Cleanup is bounded per
  run so it cannot monopolize the database; failures are reported as activity entries and do not
  silently broaden deletion scope.

### BR-AUD-002 — Unified activity read model

- Authorized operators can view one organization-scoped activity stream that combines operational
  telemetry with resource and planning audit events. Each row identifies its source, event type,
  actor, resource, correlation ID, status, severity and occurrence time.
- The unified read model is a projection only: immutable audit rows remain authoritative and are
  never changed or removed by operational retention. Before/after financial states and secrets are
  not returned; details are limited to redacted, non-sensitive metadata.
- Reads use stable cursor pagination and source/event/status/severity/actor filters. Read-only page
  views and health probes are intentionally not treated as business audit events.

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
- Reviewed customer aliases may collapse to one stable active-party identity only through an explicit,
  versioned alias map. Import never fuzzy-matches unrelated customer names or conflicting tax identities.
- Project service labels are translated to canonical active `service_line` codes only through reviewed
  exact aliases. Missing, ambiguous or unsupported labels remain explicit review flags and never receive
  an invented dimension.
- A project import carrying a service-line code validates organization scope and active master data before
  any mutation, then persists the code as the project's reporting fallback.

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
