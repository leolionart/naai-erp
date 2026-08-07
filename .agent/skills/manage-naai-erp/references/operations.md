# NAAI ERP operation patterns

## Source map

| Need                                           | Source of truth                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| Available resources and gaps                   | `docs/api/resource-coverage.md`                                     |
| Exact HTTP method/path/schema                  | `docs/api/openapi-v1.json`                                          |
| Relationship and creation order                | `docs/api/data-relationships-and-ingestion.md`                      |
| Machine-readable dependency graph              | `docs/api/data-relationship-manifest-v1.json`                       |
| Owner-paid and owner-current-account flows     | `docs/api/cash-heavy-business-ingestion.md`                         |
| Authentication, idempotency and response shape | `docs/api/ai-native-interface-contract.md`                          |
| Inbound/outbound integration                   | `docs/api/inbound-webhooks-v1.md`, `docs/api/outbound-events-v1.md` |

## Environment and discovery

```bash
export NAAI_ERP_BASE_URL="http://localhost:3001"
export NAAI_ERP_ORGANIZATION="<organization-id>"
# NAAI_ERP_TOKEN must come from the user's secure environment.

pnpm cli discovery openapi
pnpm cli discovery capabilities
pnpm cli master-data-resources list --organization "$NAAI_ERP_ORGANIZATION"
```

Never echo or interpolate `NAAI_ERP_TOKEN` into diagnostic output.

## Generic CLI shapes

```bash
pnpm cli <resource> list --organization "$NAAI_ERP_ORGANIZATION"
pnpm cli <resource> get --organization "$NAAI_ERP_ORGANIZATION" --key <id-or-key>
pnpm cli <resource> create --organization "$NAAI_ERP_ORGANIZATION" \
  --data '<json>' --idempotency-key '<stable-key>'
pnpm cli <resource> update --organization "$NAAI_ERP_ORGANIZATION" \
  --key <id-or-key> --version <latest-version> --data '<json>' \
  --idempotency-key '<stable-key>'
pnpm cli <resource> <lifecycle-action> --organization "$NAAI_ERP_ORGANIZATION" \
  --key <id> --version <latest-version> --idempotency-key '<stable-key>'
```

Use only action names confirmed by capabilities/OpenAPI. Generic master data supports list/get,
create, update and deactivate; transactional families have their own lifecycle verbs.

## REST shape

```http
Authorization: Bearer <token>
Idempotency-Key: <stable-command-key>
X-Correlation-Id: <workflow-correlation-id>
If-Match: <latest-resource-version-when-required>
Content-Type: application/json
```

Organization-scoped routes begin with
`/api/v1/organizations/{organizationId}`. Discovery is available at `/api/v1/openapi.json` and
`/api/v1/capabilities`.

## Safety levels

| Level                | Examples                                              | Minimum verification                                                                    |
| -------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Read-only            | list/get, reports, capabilities, export preview       | Validate organization and filters                                                       |
| Draft mutation       | create/update draft, dry-run import                   | Read resource back and verify links/version                                             |
| Reversible lifecycle | submit, approve, cancel, deactivate                   | Read state, inspect `nextActions`, then read back                                       |
| Financial truth      | post, reverse, reconcile, close/reopen, import commit | Confirm authority, read current state, mutate idempotently, verify journal/report/audit |

## Relationship rules

- Resolve party before project; project before contract/milestone; all master data before documents.
- Sales invoice: invoice `partyId` is customer and each project must belong to that customer.
- Purchase invoice: `partyId` is supplier; project identifies the customer work receiving the cost.
- Expense: use `payeePartyId`; use project dimensions only after resolving the project ID.
- Bank allocation `targetId` must be the returned `documentId` or `expenseId` matching `targetType`.
- Store response IDs. Never construct UUIDs or choose records by approximate names.

## Correction rules

- Draft: use the documented versioned update if available.
- Eligible unissued document: cancel.
- Posted accounting effect: reverse and, when necessary, create a corrected replacement source.
- Referenced master data: deactivate instead of delete.
- Policies/versions: retire or supersede.
- Never reuse an idempotency key with a changed payload.

## Owner-operated business model

| Event                                         | Treatment                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Owner pays company invoice/expense personally | Keep supplier/payee/project; credit reviewed Owner Payable/current account           |
| Owner transfers funds into company bank       | Debit company bank; credit reviewed owner loan/current account/equity; never revenue |
| Company pays supplier after owner funding     | Settle AP from company bank; do not duplicate expense or funding                     |
| Company transfers money to owner              | Debit reviewed owner balance/withdrawal; credit company bank; not operating expense  |
| Company reimburses owner                      | Clear Owner Payable/current account; not a second expense                            |

If the reviewed owner account classification or required API is unavailable, stop and report the
gap rather than posting an invented journal.

## Scenario: unpaid supplier invoices and owner funding

Define the cutoff first: organization timezone, `asOf` date, presentation currency, whether the user
wants only posted outstanding AP or also unposted purchase documents. Report these as two distinct
sets:

1. Posted unpaid/part-paid invoices: query AP aging because it derives outstanding balances from
   posted ledger effects.
2. Unposted purchase invoices: list commercial documents, retain only `purchase_invoice`, and group
   separately by lifecycle state. Never call these posted AP.

```bash
pnpm cli discovery capabilities
pnpm cli commercial-documents list --organization "$NAAI_ERP_ORGANIZATION"
pnpm cli ap-aging list --organization "$NAAI_ERP_ORGANIZATION" \
  --as-of <YYYY-MM-DD> --payment-status outstanding --limit <n>
```

Confirm supported payment-status values from OpenAPI/runtime before using the example. Paginate to
completion. Include part-paid items and present original, settled and outstanding amounts; account
for supplier credits/advances separately rather than netting invisibly.

The CLI does not currently provide reliable AP party/item drill-down. For an AP item, use the
documented REST fallback only after confirming it exists in live capabilities:

```text
GET /api/v1/organizations/{organizationId}/reports/ap-aging/items/{itemId}?asOf=YYYY-MM-DD
GET /api/v1/organizations/{organizationId}/commercial-documents/{documentId}
```

Use the returned source/document reference to join to the exact `documentId`; never join by amount
or approximate supplier name. If the detail response cannot establish the source ID, report the
item as unresolved.

Before explaining or executing owner funding and payment, read:

- company `bank-accounts` and its `ledgerAccountCode`;
- generic master data `accounting-workflow-policy`;
- relevant `accounts` for the reviewed owner current/loan/equity code and AP control account;
- the purchase invoice, current AP-aging detail and fiscal-period state.

Then branch on real bank evidence:

- If the owner-to-company receipt and company-to-supplier payment already exist from an authentic
  company-bank import, match/reconcile them to the reviewed owner-funding treatment and exact
  purchase `documentId`, without exceeding outstanding AP.
- If either bank movement has not been imported, do not fabricate a bank transaction or import a
  synthetic statement. Direct bank transaction creation and the owner contribution/withdrawal/loan
  lifecycle are currently unavailable. Stop and report the gap unless an organization-approved,
  authorized manual-journal procedure is explicitly documented and the user authorizes that exact
  action.

Verify these deltas after an authorized workflow:

- owner funding: company bank increases, reviewed owner balance increases, revenue does not change;
- supplier payment: company bank decreases and AP outstanding decreases by the allocated amount;
- invoice expense/asset and eligible VAT are not created again;
- reconciliation targets the exact document and allocation does not exceed outstanding;
- owner balance changes only according to the reviewed classification;
- journal is balanced, posted in an open period and visible in audit/report readback.

If the required environment variables or credentials are absent, report that live inspection was
not performed. Before any live call, identify whether `NAAI_ERP_BASE_URL` is local, staging or
production; never infer the environment from the hostname alone when it is ambiguous.
