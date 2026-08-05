# ERP-430 risks and follow-ups

- Current commercial documents do not persist a document-to-base posting rate/base gross snapshot. Unsupported foreign-currency control tie must be reported as an exception rather than silently combined.
- Opening AR/AP data needs a durable due date; missing due dates belong in an explicit unclassified exception bucket and block a clean G4 tie claim.
- Matched reconciliation attempts are reservations only and must never reduce accounting aging before a posted settlement journal exists.
- Customer/supplier credits and advances remain separate balance kinds; netting them into overdue invoice buckets would conceal collection/payment risk.
