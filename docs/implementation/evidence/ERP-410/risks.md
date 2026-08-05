# ERP-410 risks and follow-ups

- Local PostgreSQL/Docker were unavailable. Migration, locks, constraints, concurrent over-allocation and reversal readback must pass exact-commit GitHub CI before task completion.
- Internal-transfer pairing is deliberately excluded and belongs to ERP-420.
- Full foreign-currency ledger reporting will eventually require transaction-currency fields on journal lines; ERP-410 persists reviewed base amounts and exchange-rate identity without mixing foreign minor units into base journal columns.
- Suspense is an explicit visible exception, not a balancing plug. Gate G4 cannot pass while unexplained suspense remains.
- Bank-statement session closing balance and AR/AP control-account tie-out are completed across ERP-420/430 and Gate G4, not claimed by ERP-410 alone.
