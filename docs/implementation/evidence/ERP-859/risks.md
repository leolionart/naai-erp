# ERP-859 risks

- Legacy contract and milestone rows remain backend compatibility/read-model storage because
  backlog and recognition reports still consume them.
- Editing contract reference, signed date and commercial value inside the project editor requires a
  later schema/service migration with optimistic concurrency and idempotency.
- Canonical production project/customer relationships may still need data cleanup where imported
  records are duplicated or linked incorrectly.
