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

An additional explicit-provenance correction was then posted through the journal API:
`3e31eec1-b0cd-4f98-b004-392214f76109`, Dr `3388-OWNER` / Cr `111-CASH`, `120.233.150₫`. This
reclassifies the 20 expenses already marked as paid from owner custody, without changing their
expense amounts or tax treatment. The new journal was created, self-approved and posted with audit
events `b19f904a-88c3-4c8d-97db-4f38f1445886`, `bbcba825-e0e2-4248-82ec-5ab1d04acc01` and
`de7aa0ec-e686-468c-8c76-e92e42094a06`.

The immediate pre-reclassification backup was
`/home/backups/naai-erp/naai-erp-20260830-195401-pre-erp954-custody-reclass.dump`.

Per the owner's explicit instruction that the company bank is effectively empty and the remaining
funds were withdrawn/spent by the owner, a provisional, non-P&L correction was posted:
`50606dbf-0e35-4aef-a4f6-cdcdfaddba13`, Dr `3388-OWNER` / Cr `112-BANK`, `78.333.660₫`.
Its dimensions mark `provisional_owner_bank_withdrawal` and
`requires_bank_statement_reconciliation`; it is intended to be reversed/replaced if a bank
statement proves a different closing balance.

The backup immediately before this provisional correction is
`/home/backups/naai-erp/naai-erp-20260830-200449-pre-erp954-bank-residual.dump` with SHA-256
`bc4f28ef01107021b99b643fa33263f6e058e500d41bffea9aeed628a91cfbd6`.
