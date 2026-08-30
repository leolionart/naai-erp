# ERP-954 — Cash and owner-custody reconciliation

The audit found two independent sources of conflict: the company cash and owner-custody financial
accounts share ledger account `111-CASH`, and historical expenses were sometimes classified by a
shared ledger code instead of an explicit funding account. The dashboard now treats the remaining
physical custody balance as a separate control from Owner Current settlement and only reduces custody
when an expense explicitly references `CASH-OWNER-CUSTODY`.

No posted production journal or amount was changed by this code correction.

The PROD bank audit also identified a concrete ledger duplication: four internal transfer journals
(`45m`, `40m`, `27.32m`, `23m`) already credit `112-BANK` to move money into owner custody, while
four `owner-repayment-import-*` journals credit `112-BANK` again for exactly the same dates and
amounts. This duplicates `135.32m` of bank outflows and is sufficient to explain why the bank ledger
shows `-56,986,340₫`. It must be corrected through a posted reversal/replacement workflow, not by
changing historical journal rows.

After the pre-correction backup, the four duplicate `owner-repayment-import-*` journals were
reversed through the authenticated journal API using idempotent correction requests. Reversal IDs:

- `13a84fb8-7791-4943-a53d-ce4e00d3ad16`
- `382c2c1a-2347-4183-8910-b05c91a1af4e`
- `fbb23cbc-632f-4a3c-b441-de92ed77eeac`
- `b7ec9e3c-8dd4-449d-bfa1-485b539b526e`

The backup used before this mutation is
`/home/backups/naai-erp/naai-erp-20260830-194650-pre-erp954-bank-correction.dump` with SHA-256
`c14bdd83c31755d9bc4c27f314905eac88ce42737a170c16033a32492a8dde00`.
