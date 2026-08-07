# ERP Data Package v1

## Purpose

This contract exports all portable organization data to an Excel-editable workbook and imports a
reviewed workbook through the same REST application services used by UI and CLI.

## Package contents

- `manifest.json`: package identity, organization, cutoff, schema version, workbook SHA-256,
  resource inventory, dependency order and per-sheet row counts/checksums.
- `organization-data.xlsx`: one controlled sheet per included resource family, plus Instructions,
  Inventory and Reconciliation sheets.
- No secrets, token hashes, signed URLs or binary evidence. Paperless-owned files are represented by
  stable external reference, canonical URL where durable, and checksum only.

Every canonical organization-scoped resource discovered by the package registry must have exactly
one inventory disposition:

- `included_editable`
- `included_read_only`
- `derived_rebuildable`
- `excluded_sensitive`
- `excluded_external_binary`

An absent disposition is a completeness error.

## Row envelope

Each business row preserves `id`, `externalReferences`, `resourceVersion`, `lifecycleState`,
`relationships` and exact string-valued data. Editable sheets include `operation` with one of:

`no_change`, `create`, `update`, `deactivate`, `cancel`, `reverse_replace`.

Spreadsheet formulas and display formatting are never authoritative input. Import reads normalized
cell values and verifies the manifest and workbook structure.

## Dependency order

1. Organization/fiscal configuration.
2. Accounts, taxes, dimensions, mappings and policies.
3. Parties and roles.
4. Projects, contracts, milestones and workforce.
5. Bank/financial accounts.
6. Commercial documents, expenses and evidence references.
7. Allocations, approvals, recognition, project costing and overhead.
8. Banking imports, transactions, transfers, matches and reconciliations.
9. Planning resources, snapshots and export metadata.
10. Posted journals, audit/outbox history and derived report controls as read-only or rebuildable.

## REST workflow

```text
POST /api/v1/organizations/{organizationId}/portable-data-packages/exports
GET  /api/v1/organizations/{organizationId}/portable-data-packages/exports/{packageId}
GET  /api/v1/organizations/{organizationId}/portable-data-packages/exports/{packageId}/inventory
GET  /api/v1/organizations/{organizationId}/portable-data-packages/exports/{packageId}/download
POST /api/v1/organizations/{organizationId}/portable-data-packages/imports/inventory
POST /api/v1/organizations/{organizationId}/portable-data-packages/imports/dry-run
POST /api/v1/organizations/{organizationId}/portable-data-packages/imports/{importId}/commit
GET  /api/v1/organizations/{organizationId}/portable-data-packages/imports/{importId}
```

Mutation calls require authorization, `Idempotency-Key` and `X-Correlation-Id`. Commit requires the
accepted dry-run ID and workbook hash; changing the workbook invalidates the dry run.

## Required acceptance behavior

- Export inventory has no unclassified canonical resource.
- Removing or adding an unknown required sheet fails inventory validation.
- Importing an unchanged package produces zero mutations.
- Dry-run returns row-level create/update/lifecycle/no-op diffs and structured field errors.
- Commit is retry-idempotent and rejects stale resource versions or a changed workbook.
- Posted/issued history cannot be overwritten; corrections use canonical lifecycle services.
- Cross-organization links, unresolved parents and closed-period effects are rejected.
- Post-commit counts and Trial Balance, P&L, Balance Sheet, cash, AR/AP, tax and project controls
  reconcile to the accepted change set.
