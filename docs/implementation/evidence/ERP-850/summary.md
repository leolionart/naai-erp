# ERP-850 Summary

Status: done; full UI/API/CLI/OpenAPI workflow and live edited round-trip are verified locally.

Goal: export a complete, Excel-editable organization data package and safely re-import it through
versioned REST/application services without bypassing accounting controls.

Implemented so far:

- Portable Data Package v1 contracts, manifest, row operations and completeness validation.
- Persistent PostgreSQL export/import staging with organization scope, audit and idempotency.
- XLSX export of every organization-scoped table discovered in the live schema, with explicit
  exclusions for credentials, replay controls and generated package bytes.
- Editable master-data resources route through canonical master-data services. Commercial documents
  and expenses support complete create reconstruction, draft update, cancel and transactional
  reverse-and-replace. Posted journals, child history, audit and resources without a safe lifecycle
  adapter remain explicitly read-only rather than accepting raw-table writes.
- CLI export, inventory, download, upload, dry-run, status and commit commands.
- Self-contained workbooks embed inventory and schemas, so later import does not depend on retaining
  the original export staging row.
- Web workspace `/settings/data-package` covers export/download, upload, inventory, dry-run row
  review and explicit commit confirmation.
