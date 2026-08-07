# ERP-810 Acceptance

- [x] AI clients have one canonical guide for input order and relationship resolution.
- [x] A machine-readable manifest defines dependencies, reference fields, identities and stages.
- [x] Party, project, contract, milestone, document, expense, account, journal, bank and
      reconciliation ID propagation is documented.
- [x] Customer–project–invoice consistency is explicit for sales invoices, purchase invoices and
      credit notes, including the exact `dimensions.projectId` API field.
- [x] Sales, purchase, non-invoice expense, banking, correction and workbook promotion recipes are
      documented.
- [x] Organization scope, exact money, idempotency, correlation and optimistic concurrency rules are
      explicit.
- [x] Posted/issued correction paths prohibit relationship rewrite and hard delete.
- [x] Application-validated polymorphic/JSON relationships are distinguished from trusted FKs.
- [x] Documentation tests fail on broken relationship metadata.
