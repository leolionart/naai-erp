# ERP-850 Risks

- Resource coverage must be generated from a maintained registry; a hand-maintained workbook list can drift.
- Large organizations may require streamed workbook generation and bounded import batches.
- Package schema upgrades need explicit forward-compatibility and migration policy.
- This package is a portable application replay format, not a substitute for encrypted database backup.
- Raw posted journal, audit, outbox and child history sheets intentionally remain read-only. Their
  business corrections are driven from canonical parent resources, never by direct row overwrite.
- Large multi-row batches containing an accounting effect require an atomic lifecycle service;
  non-posting master-data and draft edits can batch, while accounting correction adapters execute
  their reversal and replacement within one database transaction.
