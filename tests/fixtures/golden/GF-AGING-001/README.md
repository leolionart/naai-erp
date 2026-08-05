# GF-AGING-001

Independent exact-VND aging oracle for Gate G4.

It proves:

- current and every overdue bucket boundary;
- partial settlement amounts;
- customer credit and supplier advance separation;
- AR and AP subledger totals tie exactly to their control accounts;
- no mixed-currency or current-state shortcut is required by the oracle.

All amounts are integer VND minor units and the expected rows are maintained independently from production code.
