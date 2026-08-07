# ERP-850 Summary

Status: implementation in progress; export and unchanged round-trip are live locally.

Goal: export a complete, Excel-editable organization data package and safely re-import it through
versioned REST/application services without bypassing accounting controls.

Implemented so far:

- Portable Data Package v1 contracts, manifest, row operations and completeness validation.
- Persistent PostgreSQL export/import staging with organization scope, audit and idempotency.
- XLSX export of every organization-scoped table discovered in the live schema, with explicit
  exclusions for credentials, replay controls and generated package bytes.
- Editable master-data resources route through canonical master-data services. Posted/history and
  resources without a safe mutation adapter remain read-only.
- CLI export, inventory, download, upload, dry-run, status and commit commands.
