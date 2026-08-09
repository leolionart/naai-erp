# ERP-861 risks

- Twelve additional expenses using `3388-OWNER` remain provisional drafts and are intentionally
  excluded from finalized dashboard totals. Their funding classification is complete, but payee,
  employee and project relationships require payroll or transfer evidence before submission.
- Legacy owner-paid classification is compatibility behavior derived from the approved `owner_final`
  policy and Owner Current mapping. If per-record audit snapshots are later required, add an
  append-only funding-classification override resource rather than updating posted expense lines or
  journals.
- The in-app browser refused localhost automation under its URL policy. Localhost availability and
  production-backed values were verified through the development proxy and focused Playwright tests;
  the running tab is left available for manual refresh.
