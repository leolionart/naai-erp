# GF-BANK-001

Independent exact-VND reconciliation oracle for Gate G4.

It proves:

- a `110,000,000` receivable is settled by two receipts of `60,000,000` and `50,000,000`;
- the first receipt is a partial payment and the second is a many-to-one completion of the same invoice;
- an outgoing statement amount of `110,000,000` is explained by `109,000,000` payable principal plus a separately posted `1,000,000` bank fee;
- every payment journal balances independently;
- no fee is hidden inside the supplier invoice allocation.

All amounts are integer VND minor units. The expected files are maintained independently from production code.
