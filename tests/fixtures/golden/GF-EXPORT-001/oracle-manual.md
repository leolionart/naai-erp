# Independent review notes

The August snapshot represents one immutable P&L result at the exact 31 August ledger boundary. Both accountant mappings are approved and no unresolved items exist, therefore it may be labelled final.

Canonical JSON sorts object keys recursively before hashing. The reviewed request and result hashes are calculated independently with Node SHA-256. Reordering request keys must not alter the hash. Changing net profit from 38,000,000 to 39,000,000 must fail reproduction and requires a new snapshot version rather than mutation of `snapshot-august-v1`.

The workbook rows are renderer-neutral. CSV and XLSX generators must consume the same sheet, column and typed-cell model; the workbook model, not a renderer-specific byte stream, is the reproducibility boundary.
