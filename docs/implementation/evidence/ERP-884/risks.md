# ERP-884 risks

- The 100,000,000 VND savings-transfer journal can become confirmed only after canonical bank evidence
  is linked or an authorized correction/replacement workflow is completed.
- Historical personal withdrawals are confirmed through exact embedded bank transaction IDs. Future
  withdrawals should use a first-class organization-scoped linkage rather than relying on legacy IDs.
- No production journal, bank transaction, reconciliation or expense record is mutated by this release.

