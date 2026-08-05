# NAAI ERP Business Rules Catalog

This catalog is the authoritative behavior specification for implementation. Repository benchmarks are design inspiration only; Vietnamese tax rules remain configurable and require accountant approval.

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
- Small-team self-approval may be configured but is clearly audited.

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

- Recognized revenue, invoiced revenue and cash collected remain separate.
- Cash receipt does not automatically create revenue.
- Invoice before delivery may create deferred revenue/contract liability.

### BR-REV-002 — Milestone recognition

- Recognition requires configured evidence such as milestone acceptance or completion policy.
- Advance receipt posts to customer advance/contract liability.
- Disputed or rejected milestones do not recognize revenue until resolved.

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

### BR-EXP-001 — Expense classes

Supported classes include invoice-backed, receipt-backed, contract-backed, payroll/personnel, bank fee, tax payment, non-documented, owner/personal, prepaid and fixed asset.

Document type and accounting treatment are independent.

### BR-EXP-002 — Expense lifecycle

`draft → submitted → evidence_pending → approved/rejected → posted`

- Business purpose, payee, period, amount/currency, dimensions, payment evidence and approver are captured as required by class.

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

### BR-BNK-003 — Internal transfer

- Transfer between own accounts does not affect P&L.
- Bank fee is a separate line.
- Transit account may be used while only one side is imported.

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
- Net burn excludes owner funding from operating inflow.
- Runway = unrestricted cash / average positive net burn; if net burn ≤ 0, show cash-generating/N/A.

## 9. Reports and exports

### BR-UI-001 — Financial drill-down

- Every dashboard/report amount drills down to read-model rows, journal lines, source documents and authorized evidence.
- A UI aggregate may not use a different formula from the report/API source.

### BR-UI-002 — Review and replay UX

- Review queues show validation reason, source payload, mapping gaps and safe remediation actions.
- Replay is explicit, authorized, idempotent and audited; UI never silently drops failed events.

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

## Traceability requirement

Every implemented feature must trace:

`ERP task → BR rule → API/domain operation → database invariant → tests → evidence → affected report`

No task may be marked done with orphan business rules or untested behavior.
