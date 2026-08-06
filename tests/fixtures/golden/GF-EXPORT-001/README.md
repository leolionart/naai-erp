# GF-EXPORT-001

Independent reviewed oracle for ERP-650 report snapshots and accountant exports. It proves canonical key ordering, immutable version identity, source-boundary hashing, review-required/final readiness, a CSV/XLSX-neutral workbook and reproduction mismatch detection.

The fixture is maintained separately from production domain code. `verify.mjs` uses Node's SHA-256 implementation and explicit expected rows.
