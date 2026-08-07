---
name: manage-naai-erp
description: Inspect, create, update, lifecycle-manage, reconcile, report, import, and administer NAAI ERP through the repository's first-party CLI and versioned REST API. Use for any request to read or mutate NAAI ERP organizations, master data, customers, suppliers, projects, invoices, expenses, owner-paid costs, banking, journals, periods, workforce, planning, reports, exports, webhooks, or system capabilities; also use to diagnose API/CLI gaps and verify financial mutations safely.
---

# Manage NAAI ERP

Operate only through the first-party CLI or `/api/v1`. Never access PostgreSQL as an integration
path.

## Establish the live contract

1. Work from the NAAI ERP repository root.
2. Read `docs/product/business-rules.md` for affected rules.
3. Read `docs/api/resource-coverage.md` and the relevant OpenAPI operation in
   `docs/api/openapi-v1.json`.
4. Read `docs/api/data-relationships-and-ingestion.md` before linked writes. Also read
   `docs/api/cash-heavy-business-ingestion.md` for owner money, personal-account payments, invoices
   or expenses.
5. Query `discovery capabilities` before relying on a live deployment. Treat runtime capabilities
   and OpenAPI as stronger evidence than examples.
6. Read [references/operations.md](references/operations.md) for command patterns, safety levels and
   verification requirements.

Do not call an operation listed as unavailable in `docs/api/data-relationship-manifest-v1.json` or
under known parity gaps in `docs/api/resource-coverage.md`.

## Select the interface

Prefer the CLI for normal administration because it supplies the official client behavior and emits
JSON:

```bash
pnpm cli <resource> <action> --organization <organization-id> [options]
```

Use REST when the CLI has no matching operation, for contract testing, or when the caller explicitly
needs HTTP. Derive the exact method, path, headers and schema from `docs/api/openapi-v1.json`; do not
infer them from names.

Read credentials only from `NAAI_ERP_TOKEN`, `NAAI_ERP_ORGANIZATION` and `NAAI_ERP_BASE_URL`. Never
print tokens, place them in commands shown to the user, or save them in files.

## Execute every request

1. Identify organization, resource, desired final state and whether the operation is read-only,
   reversible, lifecycle-sensitive or financially posting.
2. Read current state and resolve all parent IDs/business keys in the same organization. Require one
   exact match; never invent or fuzzy-select IDs, account codes, tax codes or dimensions.
3. For a mutation, state the intended resource and accounting effect. Use exact minor-unit strings,
   a stable idempotency key and a correlation ID. Read the latest resource version before a versioned
   update.
4. Prefer canonical business sources: invoice/expense first, then lifecycle actions, generated
   journal, bank import, matching and reconciliation. Never create a manual journal to bypass a
   supported business workflow.
5. Execute the smallest scoped command. Preserve returned IDs, resource versions, audit event IDs,
   journal IDs and allowed next actions.
6. Read the resource back. For financial changes, also verify the relevant journal/report or
   reconciliation state. Report local command success separately from verified live state.
7. If the API/CLI lacks the operation, stop and report the exact gap. Do not fall back to direct SQL.

## Enforce accounting safety

- Never edit or delete posted journals or issued financial history. Use cancel, reverse,
  replacement, retire, supersede or deactivate according to the lifecycle.
- Require balanced debits and credits, an open period, organization scope, authorization and
  idempotency for posting.
- Keep recognized, invoiced and collected revenue separate.
- Keep management validity and tax eligibility separate.
- Derive reports from posted ledger/read models, not drafts.
- Treat owner funding as financing, owner withdrawal as an owner-balance movement, owner-paid company
  costs as a company cost credited to the reviewed owner current account, and reimbursement as
  liability settlement. Never import the owner's personal bank account as a company account.
- Do not guess whether an owner balance is loan, equity, payable, receivable or withdrawal; require
  the configured accounting policy.

## Handle consequential actions

Read-only operations may run immediately. Before a consequential financial mutation, confirm the
target and current state through read-only calls. Obtain explicit user confirmation before posting,
reversing, closing/reopening a period, deactivating referenced master data, committing an import, or
otherwise changing financial truth unless the user's request already clearly authorizes that exact
action.

Never push, deploy, expose credentials or mutate production configuration unless explicitly asked.

## Return evidence

Report:

- organization and live base URL without credentials;
- CLI/API operation used;
- resource IDs and final lifecycle state;
- idempotency replay/readback result;
- journal, reconciliation or report verification when applicable;
- unsupported gaps or required accounting decisions.

Do not claim success from an HTTP/CLI response alone when a readback is available.
