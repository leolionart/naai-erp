# GF-TRANSFER-001

Independent exact-VND internal-transfer oracle for Gate G4.

It proves:

- transfer principal moves between organization-owned bank accounts without revenue or expense;
- a one-sided outgoing leg is explainable through the internal-transfer transit asset account;
- the later incoming leg clears transit without rewriting the original journal;
- an explicit bank fee remains separate from principal;
- match state has two immutable transaction references and zero transit balance;
- every journal balances independently.

All amounts are integer VND minor units. The expected files are maintained independently from production code.
