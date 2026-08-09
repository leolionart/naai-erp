# ERP-863 risks

- Draft discard removes the source rows and retains the action in audit/outbox history; restoring the
  drafts would require recreating them rather than changing a lifecycle state back.
- The deleted rows were provisional estimates without payroll or transfer evidence and had never
  affected posted journals or official reports.
