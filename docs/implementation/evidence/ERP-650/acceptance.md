# ERP-650 acceptance evidence

Current acceptance coverage:

- Pass locally: snapshots are append-only and versioned by organization, ID and version; canonical request/result, formula versions, mapping versions, ledger cutoff, source manifest, mappings and unresolved items contribute to the stored snapshot boundary.
- Pass locally: idempotent retry is checked before mutable report execution and again under a transaction lock; the same request/source boundary reuses the captured snapshot, while changed mapping/source boundaries produce a distinct version or hash.
- Pass locally: reproduction uses the stored request and controlled cutoff and reports request, result and reproducibility agreement without changing the snapshot.
- Pass locally: CSV and XLSX use one neutral workbook model; deterministic XLSX ZIP normalization is proven across separate generations and does not scan or mutate compressed payload bytes blindly.
- Pass locally: `review_required` snapshots can produce accountant packages but `isFinal` remains false. Mapping, unresolved and source sections are present in both formats.
- Pass locally: export bytes remain immutable and downloadable after the only allowed audited transition, `generated -> superseded`.
- Pass locally: organization-scoped reads and downloads return an exact not-found result when authenticated with a valid credential from another organization.
- Pass locally: OpenAPI/capability discovery and CLI cover all nine ERP-650 operations with exact positive-version validation and explicit binary-output semantics.
- Pass locally: dedicated admin pages use Sheet, Dialog and Drawer patterns; authenticated errors remain visible and do not silently fall back to demo data; full Playwright passes 55/55.
- Pass locally: `pnpm check`, `pnpm db:check`, `pnpm test:fixtures`, focused PostgreSQL integration, `pnpm test:e2e` and `git diff --check` pass.

Final acceptance remains pending exact-commit GitHub CI.
