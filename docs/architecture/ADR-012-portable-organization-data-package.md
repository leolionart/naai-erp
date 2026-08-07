# ADR-012: Portable organization data package

Status: Accepted

## Context

The accountant export is a report artifact and the legacy workbook importer understands a limited
source workbook layout. Neither can export every canonical record, preserve relationships and allow
an Excel-edited package to be safely replayed into NAAI ERP.

## Decision

Introduce `ERP Data Package v1` as a separate application module. An export contains an XLSX workbook
and JSON manifest. The manifest is the completeness contract: every exportable resource is included
or explicitly excluded with a reason, and every included sheet has a row count, checksum, dependency
order and mutability classification.

Rows retain stable IDs, external references, resource versions, lifecycle states, exact minor-unit
strings and relationship keys. User-editable rows carry an explicit operation. Import is split into
inventory validation, zero-mutation dry-run and explicit idempotent commit. Application services,
not direct database writes, execute accepted changes.

Posted journals and issued financial history are exported for traceability but remain read-only.
Corrections use cancel, reverse and replacement workflows. Missing sheets, unknown resources,
cross-organization references, stale versions, closed-period effects and relationship ambiguity fail
before commit.

Secrets, credentials, signed URLs and evidence bytes are excluded. Paperless document references and
checksums are portable; Paperless-owned files are not embedded.

## Consequences

- The package can be inspected and edited in Excel without losing machine-readable integrity.
- A same-package round trip can prove a zero-change no-op.
- Schema evolution requires explicit package-version compatibility and migration rules.
- Full coverage is measurable from the resource inventory rather than inferred from workbook tabs.
- Restore from this package remains an application-level replay, not a physical database backup.
