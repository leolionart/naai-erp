# AI Data Relationships and Ingestion Guide

This is the canonical playbook for an AI or integration that reads and writes NAAI ERP data. Read
it together with [`data-relationship-manifest-v1.json`](./data-relationship-manifest-v1.json), the
[OpenAPI contract](./openapi-v1.json), and the [AI-native interface contract](./ai-native-interface-contract.md).

For the business meaning and human sequence behind these machine operations, start with the
[overall business workflow guide](../product/business-workflows.md). This ingestion guide remains
authoritative for lookup order, identifiers, payload relationships and automated writes.

For businesses using cash or personal custody heavily, also read
[`cash-heavy-business-ingestion.md`](./cash-heavy-business-ingestion.md).

## 1. Non-negotiable rules

1. Use REST or the first-party CLI. Never write PostgreSQL directly.
2. Select one `organizationId` and resolve every referenced ID inside that organization.
3. Lookup before create. Never invent a party ID, project ID, account code, tax code or dimension.
4. Use exact minor-unit strings such as `"2100000"`; never JSON floating-point money.
5. Reuse the same `Idempotency-Key` for an exact retry. A different payload with the same key is a
   conflict.
6. Send `X-Correlation-Id`; use `If-Match`/resource version for versioned updates.
7. Retain IDs and versions returned by every mutation. Downstream requests use those response IDs.
8. Create canonical business sources before posting. Do not create a journal first for a normal
   invoice or expense.
9. Reports read posted ledger/read models. Workbook review rows and proposed mappings are not
   accounting truth.
10. Never edit or delete issued/posted history. Use cancel, credit, reverse, replacement, retire,
    supersede or deactivate according to the resource lifecycle.

## 2. Source authority

If documents disagree, follow this order:

1. `docs/product/business-rules.md` and accepted ADRs.
2. Runtime validation and `docs/api/openapi-v1.json`.
3. `data-relationship-manifest-v1.json` and this guide.
4. Examples and historical evidence.

Do not call operations listed under `knownUnavailableOperations` in the manifest.

## 3. Identity types

| Identity           | Purpose                                            | Reuse rule                                                              |
| ------------------ | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `organizationId`   | Tenant/security boundary                           | Same on every resource and reference in one chain                       |
| Stable resource ID | Links one canonical resource to another            | Store from mutation response; never fabricate                           |
| Business key       | Lookup/dedup, such as account code or project code | Resolve to one resource before mutation                                 |
| External identity  | Upsert from Paperless/n8n: `system + externalId`   | Unique inside an organization; retry may use a new HTTP idempotency key |
| Idempotency key    | Deduplicates one mutation command                  | Reuse only for the identical command payload                            |
| Correlation ID     | Traces one workflow across requests                | Reuse across related workflow steps                                     |
| Resource version   | Optimistic concurrency                             | Read latest, then send through `If-Match`/version on update             |

External identity and idempotency key are not interchangeable. External identity identifies the
business object; the idempotency key identifies one mutation attempt.

## 4. Universal request pattern

```http
Authorization: Bearer <service-token>
Idempotency-Key: <stable-command-key>
X-Correlation-Id: <workflow-correlation-id>
Content-Type: application/json
```

For generic master data, create/update payloads use a wrapper:

```json
{
  "data": {
    "id": "party-acme",
    "display_name": "Công ty ACME",
    "normalized_tax_id": "0312345678",
    "status": "active"
  }
}
```

Transactional APIs such as commercial documents, expenses, banking and reconciliation use their
typed camelCase request body directly. Do not convert transactional fields to snake_case.

CLI equivalent:

```text
naai-erp <resource> <action> \
  --organization <organization-id> \
  --data '<JSON>' \
  --idempotency-key <stable-command-key>
```

The CLI emits JSON. Persist resource IDs, `resourceVersion`, `auditEventId`, `journalId` and
`nextActions` from the response when present.

## 5. Required creation order

```text
organization and service membership
  -> fiscal year / fiscal periods / currency rates
  -> accounts / tax versions / dimensions / mappings / posting policies
  -> parties / party roles
  -> service plans
  -> projects / contracts / milestones
  -> financial accounts
  -> customer subscriptions (optional commercial schedule)
  -> commercial documents OR non-invoice expenses
  -> evidence and allocations
  -> validate / review / approve / post
  -> journal generated by application service
  -> bank import / bank transaction
  -> match / reconciliation allocation
  -> project attribution / revenue recognition
  -> reports / snapshots / exports
```

An AI may skip optional branches, but it must never reverse this dependency direction.

## 6. Relationship lookup algorithm

For every reference field:

1. Read the target resource in the same organization using its stable ID or documented business key.
2. Require exactly one compatible result.
3. Validate role/type and lifecycle compatibility, for example client role for a sales invoice or
   supplier role for a purchase invoice.
4. If zero results exist, create the parent only when the input contains sufficient verified data.
5. If multiple results exist or identity is incomplete, stop with structured review/error output.
6. Copy the returned ID/code into the child request field.
7. After mutation, read back the child and confirm every relationship.

Never choose the nearest party/project/account by name similarity alone.

## 7. Core field-to-resource map

| Request field                                                         | Target                                 | Required behavior                                                        |
| --------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `party_id`                                                            | Generic party master ID                | Used by party roles                                                      |
| `client_party_id`                                                     | Party with client role                 | Used by projects                                                         |
| `project_id`                                                          | Project ID                             | Used by contracts and master-data milestones indirectly                  |
| `contract_id`                                                         | Contract ID                            | Used by milestones                                                       |
| `partyId`                                                             | Party ID                               | Commercial-document counterparty                                         |
| `lines[].dimensions.projectId` or allocation `dimensions.projectId`   | Project stable `id`                    | Project attribution; resolve project code to its stable ID first         |
| `lines[].dimensions.contractId` or allocation `dimensions.contractId` | Contract stable `id`                   | Optional; requires project attribution and must belong to that project   |
| `payeePartyId`                                                        | Party ID                               | Expense payee; unresolved identity stays reviewable                      |
| `employeePartyId`                                                     | Party ID                               | Required for employee reimbursement                                      |
| `primaryAccountCode`, `postingAccountCode`, `counterAccountCode`      | Account `code`                         | Must exist and be allowed by posting rules                               |
| `taxAccountCode`, `vatAccountCode`                                    | Account `code`                         | Optional only when tax treatment permits                                 |
| `taxCode`                                                             | Effective tax-code version             | Resolve using document/expense date                                      |
| `dimensions`                                                          | Map of dimension `kind -> code`        | Every pair must resolve; JSON storage is not permission to invent values |
| `originalDocumentId`                                                  | Existing commercial-document ID        | Required for credit/correction relationship                              |
| `ledgerAccountCode`                                                   | Account `code`                         | Links financial account to ledger control account                        |
| `financialAccountId`                                                  | Financial-account response `accountId` | Required by bank import                                                  |
| `allocations[].targetId`                                              | `documentId` or `expenseId`            | Must match `targetType` exactly                                          |
| `reversalOfId`                                                        | Posted journal ID                      | Application creates linked reversal history                              |
| `resourceType + resourceId`                                           | Canonical resource                     | Evidence generic link; application validates ownership/type              |

## Owner personal cash withdrawal

Use `POST /api/v1/organizations/{organizationId}/banking/owner-cash-withdrawals` with an idempotency
key. Supply the active `financialAccountId`, withdrawal date, positive `amountMinor`, matching account
currency and a human note. Do not send ledger accounts or journal lines. ERP resolves the approved
Owner Current mapping and creates the negative bank/cash transaction, balanced posted journal and
canonical evidence together. The resulting movement appears as `owner_personal_withdrawal` and reduces
the confirmed owner-settlement position; it is not an expense and does not affect profit.
| `serviceLineCode` | Service-line dimension code | Required by service plans; resolve the canonical code before create |
| `customerPartyId` | Party with explicit `client` role | Required by customer subscription |
| `servicePlanId` | Active service-plan stable ID | Required by customer subscription; retain from plan create/read |
| subscription `projectId` | Project stable ID | Optional; project `client_party_id` must equal `customerPartyId` |

## 8. Canonical recipes

### 8.1 Party → project → contract → milestone

1. Lookup party by stable ID, verified tax ID or external identity.
2. Ensure the appropriate party role exists.
3. Create project with `client_party_id=<party.id>`; retain `project.id`.
4. Create contract with `project_id=<project.id>`; retain `contract.id`.
5. Create milestone with `contract_id=<contract.id>`; retain `milestone.id`.

Generic resource updates use an encoded composite key where required. Obtain keys from list/get
responses rather than constructing them from assumptions.

### 8.1A Client → service plan → customer subscription

This workflow records a service the customer has used, is using or will use. It is commercial
management data; it does not itself create an invoice, revenue-recognition event, receivable,
payment, journal or tax effect.

1. Resolve the customer party and verify its explicit `client` role. Retain `party.id`.
2. Resolve the canonical service-line dimension code when the source supplies one. Quick creation
   may omit it; the application service then selects an active code using the documented policy
   order `RETAINER_FEE`, `SYSTEM_MAINTENANCE`, then lexical code order. It never guesses from the
   plan name.
3. Lookup the service plan by stable ID or unique code. Create it only from verified plan terms and
   retain `data.id`; a deactivated plan remains readable for history but cannot activate a new
   subscription. For quick creation, send `schemaVersion`, `name` and `defaultUnitPriceMinor`; code,
   currency, recurrence and audit reason receive canonical application-service defaults.
4. If the subscription belongs to a project/contract, resolve the project and verify
   `project.client_party_id === party.id`. Never infer a project from an invoice, similar name or
   amount. No separate `contractId` is accepted.
5. Create the subscription using exact decimal strings for `quantity` and `unitPriceMinor`. Omitted
   price/currency/recurrence fields snapshot the reviewed service-plan defaults at creation.
6. Retain the returned subscription `id`, `resourceVersion` and `nextActions`.
7. Activate, pause, resume, cancel or expire only through the typed action endpoint with the latest
   `If-Match`, a stable `Idempotency-Key`, `effectiveOn` and a nonblank reason. PATCH is only for a
   draft subscription.
8. Use `schedule-preview` only to inspect service periods and scheduled commercial value. If an
   invoice is needed, create a separate canonical sales invoice for the same customer/project and
   preserve the invoice's own lifecycle. Never mark a preview period as invoiced by assumption.

CLI examples:

```text
naai-erp service-plans list --organization <org> --service-line <code> --active-only
naai-erp service-plans create --organization <org> --data '<typed JSON>' --idempotency-key <key>
naai-erp customer-service-subscriptions create --organization <org> --data '<typed JSON>' --idempotency-key <key>
naai-erp customer-service-subscriptions pause --organization <org> --key <id> --version <version> --data '{"schemaVersion":1,"effectiveOn":"2026-09-01","reason":"Customer request"}' --idempotency-key <key>
naai-erp customer-service-subscriptions schedule-preview --organization <org> --key <id>
```

### 8.2 Customer – project – invoice relationship

The three links have different meanings and must be validated together:

```text
party.id ──< project.client_party_id
party.id ──< commercial_document.partyId
project.id ──< line/allocation dimensions.projectId
```

- For a `sales_invoice`, `partyId` is the customer being invoiced. Every allocated `projectId` must
  resolve to a project whose `client_party_id` equals the same `partyId`.
- For a `purchase_invoice`, `partyId` is the supplier while `dimensions.projectId` is the project
  receiving the cost. The project's customer is normally different from the supplier.
- For a `credit_note`, `partyId` must match the original document and project allocations must remain
  inside the original eligible allocation scope.

Safe sales-invoice resolution:

1. Resolve the customer and retain `party.id`.
2. Resolve the project by stable ID or unique code.
3. Verify `project.client_party_id === party.id` inside the same organization.
4. Put `party.id` in document `partyId`.
5. Put `project.id` in `lines[].dimensions.projectId` or allocation `dimensions.projectId`.
6. For multiple projects, verify every project belongs to that customer and allocations total the
   line amount.
7. On mismatch, stop; never silently replace the customer or move the project.

The create API has no top-level `projectId` or `contractId`. Relationship attribution uses the exact
camelCase keys `projectId` and optional `contractId` inside line/allocation dimensions. The list
endpoint's `?projectId=` filter searches project attribution. When an allocation omits one of these
keys, the application may inherit the corresponding line dimension; it never guesses a different
project or contract.

### 8.3 Project revenue position: five independent axes

For a project-revenue read, retain and label these five values independently:

| Axis               | Canonical meaning                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Contract value     | Reviewed value of the project's contracts, plus or minus approved revenue-impacting scope changes included at the cutoff |
| Invoiced           | Net eligible sales-invoice allocations less effective credit-note allocations                                            |
| Recognized         | Posted revenue-recognition events only                                                                                   |
| Collected          | Completed reconciliation/payment allocations to eligible sales invoices only                                             |
| Remaining contract | `contract value - invoiced`; commercial value not yet invoiced                                                           |

All five values use the same explicit `asOf` date. Resolve the organization timezone first and apply
the cutoff to each source by its canonical business date: contract/scope-change eligibility,
invoice or credit document date, recognition `effectiveOn`, and collection/reconciliation date.
Never combine an all-time value from one axis with a cutoff value from another. A missing `asOf`
must be treated according to the exact API contract; an AI should send it explicitly rather than
assuming today's date.

These axes answer different questions:

- `remaining contract` is not invoice outstanding; invoice outstanding is invoiced less allocated
  collections and credits under the AR rules;
- `invoiced - recognized` may indicate billing ahead of recognition, but is not automatically
  deferred revenue without the configured posting policy;
- `recognized - invoiced` may indicate unbilled recognized work, but must not be turned into an
  invoice automatically;
- collected cash never creates recognized or invoiced revenue by itself.

Current implementation boundary: invoice line/allocation data stores project attribution through
`dimensions.projectId` and may store an explicitly selected canonical contract through
`dimensions.contractId`. The contract must resolve inside the organization and belong to that
project. The application still enforces the issued-invoice ceiling at the project aggregate level;
the explicit contract link supports relationship-preserving input and drill-down but does not by
itself claim per-contract consumption or cap enforcement. `milestoneId` is not persisted, so an AI
must not infer a milestone from name/date similarity.

### 8.4 Sales invoice → posting → receipt

Prerequisites: client party, accounts, applicable tax version, dimensions, and optional project,
contract or milestone.

Create body shape:

```json
{
  "type": "sales_invoice",
  "partyId": "party-client-1",
  "documentNumber": "INV-2026-001",
  "series": "INV",
  "fiscalYear": 2026,
  "documentDate": "2026-08-07",
  "dueDate": "2026-08-21",
  "currency": "VND",
  "netMinor": "10000000",
  "taxMinor": "1000000",
  "grossMinor": "11000000",
  "controlAccountCode": "131",
  "externalReference": {
    "system": "paperless",
    "externalId": "document-123",
    "canonicalUrl": "https://paperless.example/documents/123"
  },
  "lines": [
    {
      "description": "Dịch vụ thiết kế",
      "quantity": "1",
      "unitPriceMinor": "10000000",
      "netMinor": "10000000",
      "taxMinor": "1000000",
      "grossMinor": "11000000",
      "primaryAccountCode": "511",
      "taxCode": "VAT10",
      "taxAccountCode": "3331",
      "dimensions": {
        "projectId": "project-stable-id-001",
        "contractId": "contract-stable-id-001",
        "service_line": "DESIGN"
      },
      "allocations": [
        {
          "id": "allocation-1",
          "amountMinor": "10000000",
          "dimensions": {
            "projectId": "project-stable-id-001",
            "contractId": "contract-stable-id-001"
          }
        }
      ]
    }
  ]
}
```

Then:

1. Verify `project-stable-id-001.client_party_id === party-client-1`.
2. Verify `contract-stable-id-001.project_id === project-stable-id-001`.
3. Retain `data.documentId` and `resourceVersion`.
4. Follow only actions returned in `nextActions`, normally validate/issue/post according to type.
5. Retain `journalId` returned by posting.
6. Import the receipt under a resolved financial account.
7. Match with allocation `{ "targetType": "commercial_document", "targetId": "<documentId>" }`.
8. Reconcile and read back invoice outstanding plus journal/payment links.

### 8.5 Purchase invoice

Use a party with supplier role. The source remains a `purchase_invoice`; do not create an additional
invoice-backed expense. Typical lifecycle is capture → verify → approve → post. Payment allocation
targets the returned `documentId`.

For project-attributed supplier cost, keep the supplier in `partyId` and place the receiving
project's stable ID in `dimensions.projectId`. An optional `dimensions.contractId` must belong to
that project. Do not require the project client to equal the supplier.

#### One-call minimal purchase-invoice ingestion

Use this operation when Paperless/n8n or another trusted integration has a basic supplier invoice
but does not yet have a supplier party ID:

```http
POST /api/v1/organizations/{organizationId}/commercial-documents/purchase-invoice-ingestion
Authorization: Bearer <token>
Idempotency-Key: paperless-246-v1
X-Correlation-Id: <correlation-id>
```

The first-party CLI exposes the identical application service:

```bash
naai-erp quick-purchase-invoices create \
  --organization naai \
  --idempotency-key paperless-246-v1 \
  --data '{"schemaVersion":1,"supplierTaxId":"0110660175","supplierName":"Nhà cung cấp A","documentNumber":"00250571","documentDate":"2026-07-27","category":"Thuê pin và sạc xe điện","description":"Phí dịch vụ tháng 7","grossMinor":"408601"}'
```

The operation performs one organization-scoped relationship sequence:

1. Normalize `supplierTaxId`, then resolve the same-organization party by that stable tax identity.
2. Create the supplier party when absent and ensure its explicit `supplier` role.
3. Resolve the active expense category from the optional OCR category label or description, then
   apply its reviewed payable/expense account mappings. Exact code/name matches win; a similar label
   is accepted only when it has one strong, unique match.
4. Create exactly one canonical `purchase_invoice` and return the supplier and document outcomes.

Retain `data.supplier.partyId`, `data.document.documentId`, `resourceVersion`, `auditEventId` and
`nextActions`. Retry the exact payload with the exact `Idempotency-Key`; a changed payload under the
same key is a conflict. The operation does not also create an Expense, does not guess a project or
payment account, and records gross as management cost with zero input VAT and unreviewed tax state
until real VAT evidence is supplied. Follow only returned `nextActions`: solopreneur owner policy may
finish the record as posted or paid atomically, while controlled/integration mode can return a draft.

#### Deleting an accidental draft

An accidental commercial document may be deleted only while its canonical state is `draft`:

```http
DELETE /api/v1/organizations/{organizationId}/commercial-documents/{documentId}
If-Match: <resourceVersion>
Idempotency-Key: <stable-delete-key>
Content-Type: application/json

{"reason":"Duplicate draft created during corrected import"}
```

The command is organization-scoped, authorized, version-checked, audited and retry-safe. It rejects
non-draft records. Issued, posted, partially paid, paid or cancelled history is never hard-deleted;
use the applicable cancel, credit, reverse or replacement workflow instead.

### 8.5.1 One-call sales/revenue ingestion

For a basic customer sale, integrations use the matching one-call sales operation instead of
coordinating party, customer-role and invoice mutations themselves. The API resolves the customer
by normalized tax ID (or reuses the supplied external identity), creates the explicit `client` role
when needed, and creates the canonical sales document in one idempotent command:

```http
POST /api/v1/organizations/{organizationId}/commercial-documents/sales-invoice-ingestion
Authorization: Bearer <token>
Idempotency-Key: sales-246-v1
X-Correlation-Id: <correlation-id>
Content-Type: application/json

{"schemaVersion":1,"customerTaxId":"0312345678","customerName":"Khách hàng A","documentNumber":"INV-246","documentDate":"2026-08-22","description":"Phí dịch vụ tháng 8","grossMinor":"1100000","category":"Dịch vụ"}
```

The first-party CLI uses the same application service:

```bash
naai-erp quick-sales-invoices create \
  --organization naai \
  --idempotency-key sales-246-v1 \
  --data '{"schemaVersion":1,"customerTaxId":"0312345678","customerName":"Khách hàng A","documentNumber":"INV-246","documentDate":"2026-08-22","description":"Phí dịch vụ tháng 8","grossMinor":"1100000","category":"Dịch vụ"}'
```

The response returns the resolved customer `partyId`, canonical `documentId`, `journalId` when
posted, `resourceVersion`, `auditEventId` and `nextActions`. Callers retain those IDs and follow
only the returned actions. The backend derives safe defaults and matches organization-scoped
customers/categories; callers do not provide ledger account IDs, project IDs or payment-account
IDs for the quick path. Use the full sales-document contract when VAT lines, allocation,
recognition policy or other accounting detail is known. Repeating the exact request with the same
idempotency key is safe; a changed payload under that key is rejected.

### 8.6 Non-invoice expense

Create an expense only after confirming it is not a supplier invoice already represented as a
purchase invoice.

Use the validated request shape in
[`cash-heavy-business-ingestion.md#non-invoice-cash-expense`](./cash-heavy-business-ingestion.md#non-invoice-cash-expense).

Retain `data.expenseId`, then submit/review/approve/post. If paid through an imported bank
transaction, reconciliation uses `targetType=expense` and `targetId=<expenseId>`.

For a direct project cost, keep the supplier in `payeePartyId`, put the receiving project in
`lines[].allocations[].dimensions.projectId`, and optionally put a contract from that project in
`dimensions.contractId`. The payee is not remapped to the project's customer. A draft PATCH that
omits `lines` preserves the stored lines and allocations; sending `lines` is an explicit replacement,
so clients must read back and resend allocation IDs, amounts and all dimensions they intend to keep.

### 8.7 Bank import and reconciliation

1. Resolve account code, then create/read the financial account and retain `accountId`.
2. Dry-run the import.
3. Commit with `financialAccountId=<accountId>` and retain `importId`.
4. Read imported transactions and select the exact `transactionId`.
5. Match only to posted/eligible canonical sources.

```json
{
  "schemaVersion": 1,
  "baseAmountMinor": "10000000",
  "allocations": [
    {
      "targetType": "commercial_document",
      "targetId": "document-id-from-create",
      "targetAmountMinor": "10000000",
      "targetCurrency": "VND",
      "baseAmountMinor": "10000000"
    }
  ]
}
```

Allocation totals may not exceed the transaction or target outstanding amount. A reconciled
transaction is corrected by authorized unreconcile with reason, then rematch.

### 8.8 Credit, reversal and replacement

- Draft resource: PATCH with the latest version.
- Unissued document: use cancel when permitted.
- Issued invoice: create a credit note linked by `originalDocumentId` and reason.
- Posted journal effect: reverse once; create a replacement in an open period when required.
- Policy/forecast/export version: retire or supersede.
- Referenced master data: deactivate rather than delete.

Never change a posted source's party, project, lines, amount or journal relationship in place.

#### One-command metadata correction

Web, REST and CLI expose one canonical correction operation for the business metadata users manage
day to day: customer or supplier/payee, project, category and description. The request expresses the
desired final metadata; callers do not patch parties, roles, allocations and documents through a
sequence of APIs.

The backend resolves supplied stable IDs or business identifiers, performs normalized exact
matching, checks organization scope and validates project/customer compatibility. Missing and
ambiguous matches return structured field errors with zero mutation. It never guesses between
multiple candidates.

#### Simple input contract

For day-to-day administration, prefer one business payload and one canonical command. The backend
owns matching and safe orchestration; clients do not need separate calls to create a party, assign a
role, resolve a project/category and then create the document. Send a stable ID when known, or one
human-readable business key (for example tax ID or exact category code/name) when it is not.
The service returns the effective IDs, warnings and `nextActions`. If matching is missing or
ambiguous, it returns field-level errors and performs no mutation. Technical options remain
progressive-disclosure fields in the UI and are not required for the quick path.

- Draft: update the existing resource with `If-Match`, reason and idempotency key.
- Issued/posted: plan and atomically execute the applicable credit/reversal plus a linked replacement
  in an open period. The original resource and journal remain immutable.
- Retry: the same idempotency key returns the original correction result and cannot create another
  reversal or replacement.
- Response: effective resource ID/version, audit event, original/reversal/replacement IDs and
  permitted `nextActions`.

Changing amount, tax treatment, ledger accounts or payment/reconciliation effects is a financial
correction and remains subject to its canonical workflow. The unified UI may present it as one user
action, but the service still enforces balancing, period locks, evidence, RBAC and audit rules.

### 8.9 Relationship backfill for final documents and expenses

Use this workflow only when an issued/posted commercial document or posted expense lacks canonical
project/contract attribution. It is not a bulk guessing endpoint and it never mutates final history
in place.

Inventory first:

```http
GET /api/v1/organizations/{organizationId}/commercial-documents/relationship-backfill/inventory
GET /api/v1/organizations/{organizationId}/expenses/relationship-backfill/inventory
```

Each inventory item includes top-level `projectIds: string[]` and `contractIds: string[]`, aggregated
from line and allocation dimensions. Empty arrays mean missing attribution, not permission to infer a
project from similar names, dates or amounts.

For one reviewed record:

1. Read the canonical detail and retain its current `version`.
2. Build the complete replacement create payload, including every amount, line, allocation, evidence
   reference and the reviewed `projectId`/optional `contractId` values to retain.
3. Dry-run with `If-Match: <version>` and a nonblank reason:

```http
POST /api/v1/organizations/{organizationId}/commercial-documents/{id}/relationship-backfill/dry-run
POST /api/v1/organizations/{organizationId}/expenses/{id}/relationship-backfill/dry-run
```

```json
{
  "replacement": { "...": "full canonical create payload" },
  "reason": "Bổ sung liên kết dự án/hợp đồng đã được rà soát"
}
```

The zero-mutation response returns `dryRun: true`, deterministic `planHash`, `originalId`,
`originalState`, the normalized `replacement`, and planned `effects`. Document effects are
`reverse_original_journal`, `cancel_original`, `create_replacement_draft`; expense effects are
`reverse_original_journal`, `reverse_original`, `create_replacement_draft`.

4. Review the normalized replacement and effects. Do not commit if the source version, mapping or
   reason changes.
5. Commit the exact plan with the same `If-Match`, the returned `planHash`, and a stable
   `Idempotency-Key`:

```http
POST /api/v1/organizations/{organizationId}/commercial-documents/{id}/relationship-backfill/commit
POST /api/v1/organizations/{organizationId}/expenses/{id}/relationship-backfill/commit
```

```json
{
  "replacement": { "...": "same normalized business payload" },
  "reason": "Bổ sung liên kết dự án/hợp đồng đã được rà soát",
  "planHash": "<sha256 from dry-run>"
}
```

The hash covers normalized `{id, expectedVersion, replacement, trimmed reason}`. A stale version or
different payload/reason is rejected; a hash mismatch returns a structured conflict. Commit follows
the normal reverse/replacement service, period locks, authorization, audit and idempotency rules.
Eligible commercial-document states are `issued`, `posted`, `partially_paid` and `paid`; eligible
expenses must be `posted`. The original document becomes `cancelled`, the original expense becomes
`reversed`, and the replacement is a draft. Durable external identity transfers to the replacement;
active-only uniqueness permits the replacement document to reuse the original invoice number.

CLI resources use the same REST application services:

```text
naai-erp commercial-document-relationship-backfill inventory --organization <org>
naai-erp commercial-document-relationship-backfill dry-run --organization <org> --key <id> --version <version> --file mapping.json
naai-erp commercial-document-relationship-backfill commit --organization <org> --key <id> --version <version> --file mapping-with-plan-hash.json --idempotency-key <key>

naai-erp expense-relationship-backfill inventory --organization <org>
naai-erp expense-relationship-backfill dry-run --organization <org> --key <id> --version <version> --data '<JSON>'
naai-erp expense-relationship-backfill commit --organization <org> --key <id> --version <version> --data '<JSON>' --idempotency-key <key>
```

Non-inventory actions require `--key`, `--version` and explicit JSON through `--file` or `--data`;
commit additionally requires `--idempotency-key`.

### 8.10 Workbook review row → canonical resource

The review row is staging evidence, not a report source.

1. Dry-run import and obtain stable `sourceIdentity`.
2. Review raw/mapped data and resolve all parents.
3. PATCH only the review proposal using optimistic versioning.
4. Create the canonical resource through its normal API.
5. Retain the canonical response ID and write only through the audited linkage workflow available
   for that resource.
6. Reports use the posted canonical source, never `mappedData` or `proposedResourceId` directly.

If no canonical promotion operation exists, stop and report the missing capability; do not use SQL.

## 9. Application-validated relationships

Some relationships are intentionally not database foreign keys and therefore need extra care:

- Transactional `dimensions`: validate every `kind/code` pair through master-data reads.
- Evidence `resourceType/resourceId`: validate target type, organization and permission.
- Project-cost `sourceType/sourceId/sourceLineId`: resolve the polymorphic canonical source through
  application services.
- Workbook `proposedResourceId`: treat as an untrusted proposal until canonical readback succeeds.
- Recognition/account policy codes: resolve effective account and policy versions before posting.

## 10. Error and retry behavior

- Validation error: correct named fields; do not retry unchanged input.
- Missing/ambiguous reference: stop or keep in review; never guess.
- Idempotent retry: reuse the exact payload and idempotency key.
- Version conflict: GET latest resource, reconcile intent, then retry with the new version.
- Locked period: do not backdate around it; use the approved reopen/correction workflow.
- API/CLI gap: stop and create a scoped implementation task.
- Invalid inbound Paperless/n8n payload: zero business mutation; n8n owns correction/retry. Do not
  create an ERP replay or review lifecycle that is not in the current contract.

## 11. Final AI checklist

- [ ] Correct organization and authorization established.
- [ ] All parent IDs/codes resolved uniquely in the same organization.
- [ ] Party roles and resource types are compatible.
- [ ] Tax/dimension/account versions are effective for the transaction date.
- [ ] Amounts are exact minor-unit strings and allocations balance.
- [ ] External identity and idempotency key are both present where applicable.
- [ ] Response IDs and versions are retained for downstream steps.
- [ ] Lifecycle follows `nextActions`; no posted record is edited.
- [ ] Bank allocations target the exact document/expense ID and do not exceed outstanding values.
- [ ] Final readback verifies canonical links, audit reference, journal and payment status.
