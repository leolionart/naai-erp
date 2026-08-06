# ERP-650 risks and follow-up

- Snapshot reproducibility depends on retaining the selected formula/mapping versions and source cutoff semantics; later report-engine changes must not silently reinterpret a stored snapshot.
- `review_required` exports are intentionally available for accountant review, but every consumer must continue honoring `isFinal: false`.
- XLSX byte determinism depends on controlled workbook metadata and ZIP timestamp normalization; library upgrades require the cross-process deterministic-export integration test to remain blocking.
- Export content is stored in PostgreSQL for the current scale. Object storage, retention and encryption-at-rest policy can be introduced later without weakening the immutable manifest/content-hash contract.
- Accountant/statutory snapshots are in ERP-650 scope. Executive metrics remain management-report attachments unless a later task explicitly adds them to the statutory package.
- Exact-commit PostgreSQL and Playwright proof is green for `8d7cc481f1606e63d912c1d6b76522721d011f30` at https://github.com/leolionart/naai-erp/actions/runs/31071139349; no ERP-650 acceptance boundary remains open.
