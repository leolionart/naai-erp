# ERP-650 summary

- Task: ERP-650 — Accountant export and report snapshots
- Gate: G6 — Planning and management reporting
- Status: in progress

ERP-650 will persist immutable, reproducible report snapshots and generate audited accountant exports in CSV and XLSX formats. Snapshot manifests will retain the organization, report kind, period, dimensions, basis/framework, selected mapping/formula versions, ledger cutoff/fingerprint, canonical request/result hashes and readiness state.

Exports will reference a captured snapshot rather than recomputing an unversioned report. Mapping gaps and unresolved review items remain visible, and an export cannot be labeled final when the approved confidence thresholds fail.
