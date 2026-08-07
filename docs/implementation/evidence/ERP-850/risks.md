# ERP-850 Risks

- Resource coverage must be generated from a maintained registry; a hand-maintained workbook list can drift.
- Large organizations may require streamed workbook generation and bounded import batches.
- Package schema upgrades need explicit forward-compatibility and migration policy.
- This package is a portable application replay format, not a substitute for encrypted database backup.
- Complete row coverage does not imply complete edit coverage: non-master-data resources remain
  read-only until each canonical lifecycle adapter has rule/test evidence.
