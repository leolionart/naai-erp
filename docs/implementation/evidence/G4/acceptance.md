# Gate G4 acceptance evidence

ERP-440 implementation complete locally; exact-commit PostgreSQL CI pending.

The closure package must prove:

- Pass in authored controls/integration proof: imported statement control totals and disposition counts.
- Pass: reconciled statement movement must equal posted bank-ledger movement before close.
- Pass: unexplained, pending or rejected suspense blocks close; approved/resolved exceptions retain owner, reason and review/resolution evidence.
- Pass through `GF-TRANSFER-001` and integration coverage: transit finishes at zero and principal has zero P&L impact.
- Pass through `GF-AGING-001` and expanded PostgreSQL fixture: AR/AP tie control accounts with credits/advances separate.
- Pass: historical settlement/reversal cutoffs are journal-date effective.
- Pass locally: OpenAPI/capabilities/CLI parity and usable desktop/mobile UI routes.
