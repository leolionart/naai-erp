# Gate G4 acceptance evidence

ERP-440 and Gate G4 are accepted. The latest exact-commit PostgreSQL CI passed at https://github.com/leolionart/naai-erp/actions/runs/31031720108 for proof commit `602d9f8ce8b96acb21f5f414ccbb9c9acbd9b2e5`.

The closure package must prove:

- Pass in authored controls/integration proof: imported statement control totals and disposition counts.
- Pass: reconciled statement movement must equal posted bank-ledger movement before close.
- Pass: unexplained, pending or rejected suspense blocks close; approved/resolved exceptions retain owner, reason and review/resolution evidence.
- Pass through `GF-TRANSFER-001` and integration coverage: transit finishes at zero and principal has zero P&L impact.
- Pass through `GF-AGING-001` and expanded PostgreSQL fixture: AR/AP tie control accounts with credits/advances separate.
- Pass: historical settlement/reversal cutoffs are journal-date effective.
- Pass: OpenAPI/capabilities/CLI parity and usable desktop/mobile UI routes.
