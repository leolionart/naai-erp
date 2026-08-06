# ERP-630 risks and follow-up

- Account root types alone cannot distinguish direct cost, OPEX, other items or cash-flow classes. Reports require explicit approved mapping versions and must surface unmapped values.
- Balance Sheet current/unclosed earnings must be a transparent ledger-derived line, never an unexplained balancing plug.
- A direct Cash Flow classifier can misstate financing as operations. Owner contribution, owner/company loan and withdrawal policy needs fixture and PostgreSQL proof.
- Purchase and expense tax treatment must preserve exact eligible amounts and reviewer/evidence metadata; accounting recognition never implies CIT or VAT eligibility.
- Foreign-currency journal lines cannot be consolidated safely unless base-currency semantics are explicit. Unsupported lines must block readiness rather than be silently converted.
- Reproducibility needs one cutoff/source fingerprint shared by all statements. ERP-650 will persist formal snapshots, but ERP-630 reads must already disclose their source boundary.
- A cash-basis P&L cannot be derived safely by filtering journals that touch bank accounts because AR/AP settlement would lose revenue/expense lineage. ERP-630 therefore rejects `basis=cash` for P&L and exposes cash movements through the separately labeled direct Cash Flow report.
- Fixture data is synthetic/anonymized and must not contain the user's real workbook contents.
- Local non-PostgreSQL, fixture, build and 47/47 Playwright proof is green. Exact-commit PostgreSQL integration remains the final unverified durability/read-model boundary.
