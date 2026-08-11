# ERP-906 summary

Portable organization exports now use reviewed resource dispositions instead of emitting every
organization-scoped table as a worksheet. Empty resources, embedded child rows and operational
event/attempt/staging/read-model resources remain explicit in the manifest but no longer create
blank or duplicate user-facing sheets.

Generated portable-package and accountant-workbook blobs now use bounded organization-scoped
retention. Metadata, hashes, manifests and audit history remain; an expired binary returns
`EXPORT_CONTENT_PRUNED` with HTTP 410. Defaults keep at most five recent blobs per export class and
prune older non-latest blobs after 30 days.

Production remains on `latest`. The supported `pnpm prod:update` command pulls images, stops runtime
services, runs the one-shot migration to successful completion, then recreates and health-checks the
application. Storage diagnostics are available through `pnpm db:storage-report`; lock-heavy reclaim
requires exact confirmation and backup evidence.

Two ERP-905 temporary local databases were removed. No production mutation was performed by this
task.
