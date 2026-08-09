# ERP-863 tests

- Initial public and internal preflight documented the production HTTP 502 blocker.
- After API recovery, preflight confirmed 12/12 exact targets were drafts, total gross
  `187,000,000` VND.
- DELETE used current `If-Match`, stable idempotency keys, correlation IDs and an explicit reason.
- Each discard produced an audit event and outbox event; the first operation's replay returned
  `idempotencyReplayed=true` with the original audit event.
- Final draft listing contains zero target IDs.
- Operating dashboard remains `ownerPaidClassificationStatus=ready`, unclassified count `0`.
