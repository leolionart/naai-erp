# ERP-851 summary

Implemented a guarded local-only organization reset through the versioned API and first-party CLI. The reset requires exact organization confirmation, a retained Full ERP Data Package ID, the matching workbook SHA-256, owner authorization, loopback host, explicit local enablement and an idempotency key.

Created a source-preserving normalization staging workbook from the four supplied Excel workbooks. Deterministic enrichment produced 74 parties, 35 projects, 127 purchase invoices, 271 purchase lines, 45 revenue activities and 127 retained expenses. Eighty-seven invoice-backed expense rows were matched exactly and excluded with an audit trail to prevent double recognition.

No live reset or canonical import was executed in this pass because the final staging workbook must
first be converted through canonical application services and pass a zero-error dry-run plus
financial reconciliation; the source review queue itself is now resolved.

The accountant-maintained 2026 VAT schedule was added as a fifth source. It supplied authoritative
sales/purchase invoice identities and manual line classifications. Filtered sales and purchase
exports now lead with an accountant-readable Vietnamese VAT schedule while retaining Summary,
Records, Lines and Filters sheets for canonical audit and machine use.

The source backlog has now been dispositioned to zero open review items without inventing invoice
identity. Valid but line-poor purchase invoices use exact header-level canonical summary lines;
management revenue without a real invoice number remains explicitly non-issued; ambiguous project
names remain separate source-row identities. Nine source exceptions are retained and excluded from
canonical posting rather than silently corrected.

A deterministic ERP-851 converter now verifies the final staging SHA and emits a Portable Data
Package v1. The safe package includes 75 parties and 35 projects and explicitly excludes financial
resources until reviewed account and tax mappings exist. External portable packages are now
registered atomically before their import record, allowing the package to pass the real API dry-run
without requiring a prior ERP-generated export.

The authenticated local dry-run accepted all 110 safe rows with zero invalid/conflict rows and zero
business mutations. Live demo parties and projects remained at 7 and 2 respectively after dry-run.

The converter now also emits a conservative draft-financial package using the reviewed baseline
accounts: AP `331-AP`, operating expense `642-OPEX`, input VAT `1331-VAT`, owner-paid funding
`3388-OWNER` and company-account funding `112-BANK`. Purchase VAT remains explicitly unreviewed in
drafts. Header-level summary lines are used only when detailed source lines do not reconcile exactly.
Zero-value expenses, unknown funding, missing invoice identity/date and broken headers remain
excluded. The authenticated API dry-run accepted all 343 rows: 75 parties, 35 projects, 121 purchase
invoices and 112 expenses, with zero errors/conflicts and zero business mutations.

The owner then authorized the local cutover. A fresh Full ERP backup was retained as package
`5e374385-961a-4e14-8bbc-c2ef2771d4ed` with workbook SHA-256
`4441db74e2ae4a7eb8ac56a44fa13b1903e429b511b49a86bc5d41216b786b50`. The reset removed demo and
prior partial-import business rows while preserving organization identity, credentials, accounts,
fiscal periods, tax configuration and portable backups.

Cutover rehearsal exposed canonical constraints that the earlier dry-run did not detect: invalid
project contract type, required project owner/client fields and duplicate supplier invoice
references. Converter v9 now uses `fixed_fee`, the retained local owner identity, the existing NAAI
management party for explicitly unallocated management projects, and stable-ID suffixes only for
repeated supplier invoice numbers. Corrected package `fcd65678-9d91-5318-a42d-555a37f1d7d3`
(SHA-256 `49fb54629802666a7995f6d9510dc292ddf84ba819782377fe1fd271367125f4`)
committed 343/343 rows. Readback confirms 75 parties, 35 projects, 121 draft purchase invoices and
112 draft expenses, with no demo IDs, duplicate external references or unbalanced posted journals.
The organization legal name was corrected through the versioned API to `CÔNG TY TNHH NAAI STUDIO`.

After explicit owner confirmation of the conservative tax policy, fiscal years and all monthly
periods for 2024 and 2025 were created through master-data APIs. All 121 purchase invoices were
reviewed with invoice VAT marked eligible, then captured, verified, approved and posted. All 112
non-invoice expenses were reviewed as management-valid, CIT-ineligible and VAT-ineligible, then
submitted, approved and posted. The temporary owner-approved self-approval ceiling used for this
local cutover was restored to disabled immediately afterward.

The owner subsequently authorized completeness-first inferred mappings. Three missing customer
parties, five explicitly inferred sales projects and their source-backed contract caps were created.
All eight official BRTT78 sales invoices were created and issued with external references marking
the mapping as owner-authorized inference. The full 45-row revenue/receipt activity source was also
imported into a clearly labelled inferred bank account so every supplied movement is visible for
later reconciliation and correction.

Funding-source presentation was then clarified without changing the accounting invariants. Expense
forms now use the live `111-CASH`, `112-BANK` and `3388-OWNER` codes. Listings and record dialogs
label company cash/bank, owner-paid and AP-backed documents distinctly. The dashboard now presents
bank, cash, total company funds and owner-paid obligations as separate cards instead of subtracting
owner-paid obligations from the headline company-fund balance. Tax amount and eligibility remain
independent.

At the owner's request, payroll history before 2025 was backfilled as provisional management data.
The exact monthly 2025 pattern (187,000,000 VND/year) is retained for 2024 as 12 draft payroll
expenses, all funded through `3388-OWNER` and explicitly tagged
`erp851-inferred-payroll-history`. A first-pass 2023 estimate was discarded after the owner clarified
that company expenses start from 2024. The 2024 estimates remain unposted and require payroll or
personal bank-transfer evidence before official recognition.

The owner clarified the payroll memo mapping: 10,000,000 VND payments belong to Ly, 3,000,000 VND
to Trang and 2,000,000 VND to Phúc. Employee parties were created for those three names. Historical
posted rows still preserve their original source payload without employee IDs; reporting can use the
explicit amount-to-person mapping until a correction workflow replaces those rows.

The expense entry UI was also corrected to use the current canonical expense classes and live
ledger account codes. Users can now create payroll, tax, invoice-backed, receipt-backed,
contract-backed, owner-personal and other expenses, select company cash/bank or owner-paid funding,
and edit draft records through the existing dialogs. Category selection automatically chooses the
payroll, tax or owner-personal class where applicable.
