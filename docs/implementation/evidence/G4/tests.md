# Gate G4 test evidence

Planned consolidated PostgreSQL test:

- statement opening plus transaction movement equals closing balance;
- imported/duplicate/rejected counts and amounts explain every raw row;
- all accepted bank transactions are reconciled, ignored with reason, or linked to an approved exception;
- unapproved suspense balance is zero;
- settlement/reversal and transfer journals balance;
- AR/AP control variances are zero and supplier advance is exercised in PostgreSQL;
- cross-organization access is denied.

Final exact-commit CI and rendered UI evidence will be recorded before unlocking ERP-500.
