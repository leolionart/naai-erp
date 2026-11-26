# ERP-982 Risks & Follow-Ups

- **Immutable Posted Journal VAT Split vs Post-Posting Payment Evidence**:
  - Per core accounting invariants, posted `journal_entries` and `journal_lines` are never mutated in place. When an unpaid `>= 5,000,000` VND purchase invoice or expense is posted initially with `vat_state = 'unreviewed'` (`vat_eligible_minor = 0`), its initial journal debits the expense account (`642`) rather than `1331-VAT`. When qualifying payment evidence or bank reconciliation arrives later, line tax states (`cit_state`, `vat_state`, `cit_eligible_minor`, `vat_eligible_minor`) and tax reports update immediately without altering historical journal lines; any ledger-account reclassification between expense and `1331` at period close remains an explicit accounting/close step (`ERP-987`).
- **Owner Funding / Repayment & AP Aging Follow-Ups**:
  - Preferred owner-funding (`Dr 112 / Cr 3388`) and repayment (`Dr 3388 / Cr 112`) workflows are tracked under `ERP-983` (`BR-PAY-004`), and AP aging separation of `331` vs `3388`/`1388` is tracked under `ERP-984` (`BR-AP-001`).
