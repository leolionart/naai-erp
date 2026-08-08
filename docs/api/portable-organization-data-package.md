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
POST /api/v1/organizations/{organizationId}/portable-data-packages/local-admin/reset
```

Mutation calls require authorization, `Idempotency-Key` and `X-Correlation-Id`. Commit requires the
accepted dry-run ID and workbook hash; changing the workbook invalidates the dry run.

## First-party CLI

The CLI calls only the versioned REST paths above. It requires `NAAI_ERP_TOKEN` and either
`--organization` or `NAAI_ERP_ORGANIZATION`.

```bash
naai-erp portable-data-export export --organization org-naai --as-of 2026-08-07 --idempotency-key export-2026-08-07
naai-erp portable-data-export status --organization org-naai --key package-1
naai-erp portable-data-export inventory --organization org-naai --key package-1
naai-erp portable-data-export download --organization org-naai --key package-1 --output organization-data.xlsx

naai-erp portable-data-import inventory --organization org-naai --file organization-data.xlsx --idempotency-key inventory-1
naai-erp portable-data-import dry-run --organization org-naai --file organization-data.xlsx --idempotency-key dry-run-1
naai-erp portable-data-import status --organization org-naai --key import-1
naai-erp portable-data-import commit --organization org-naai --key import-1 --dry-run-id dry-run-1 --workbook-sha256 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --idempotency-key commit-1
```

JSON is the default output. Export download refuses to write unless `--output` is explicit. Exact
money remains a minor-unit string in workbook cells and JSON; callers must not convert it to a
binary floating-point value.

### Dry-run response shape

```json
{
  "apiVersion": "v1",
  "requestId": "corr-1",
  "organizationId": "org-naai",
  "data": {
    "importId": "import-1",
    "state": "dry_run_valid",
    "dryRunId": "dry-run-1",
    "dryRun": {
      "dryRun": true,
      "mutationCount": 0,
      "valid": true,
      "totals": {
        "sheets": 12,
        "rows": 80,
        "ready": 1,
        "invalid": 0,
        "conflicts": 0,
        "unchanged": 79
      },
      "rows": [
        {
          "sheetName": "parties",
          "resourceType": "parties",
          "rowNumber": 2,
          "operation": "update",
          "disposition": "ready",
          "issues": [],
          "resolvedReferences": {}
        }
      ]
    }
  }
}
```

Errors and warnings are returned per row with stable `code`, `message`, optional `field` and
`severity`. A dry-run response always has `dryRun: true` and `mutationCount: 0`.

## Local organization reset

Reset is a destructive local-development recovery command, not an import shortcut. Before reset,
create and download a completed Full ERP Data Package and retain its package ID and workbook
SHA-256. The API must run outside production with `NAAI_ERP_LOCAL_RESET_ENABLED=1`, and the CLI base
URL must resolve directly to `localhost`, `127.0.0.1` or `::1`.

```bash
naai-erp portable-data-reset local \
  --organization naai \
  --confirm-organization naai \
  --key package-backup-1 \
  --workbook-sha256 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --idempotency-key reset-naai-20260808
```

All five arguments are mandatory. `--confirm-organization` must exactly equal the target
organization. The package must belong to that organization and its stored workbook hash must match
the supplied SHA-256. The response reports deleted row counts by table, preserved tables, audit event
ID and whether an idempotent retry was replayed.

The reset preserves organization identity, memberships, API credentials and approved baseline
configuration. Production, proxy/remote base URLs, missing backup evidence and mismatches are
rejected before destructive work.

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
