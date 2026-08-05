# Gate G4 summary

- Gate: G4 — Banking, cash and AR/AP
- Tasks: ERP-400, ERP-410, ERP-420, ERP-430, ERP-440
- Status: done

ERP-400 through ERP-440 are implemented and exact-commit CI verified. ERP-440 closes the remaining gate-level controls: statement opening/closing totals, zero unexplained suspense, full bank-to-ledger control proof, supplier-advance integration coverage and consolidated headless/UI evidence.

The statement-session workflow is server-derived from linked imports and bank transactions. It exposes draft → reviewed → closed lifecycle, explicit suspense ownership/review dates, approved/resolved/rejected exception history, exact close blockers and append-only audit events.

Final G4 implementation: `5fadf5026964e2ec2db2fc1d90f56b199237b34d`.
Latest green proof commit: `602d9f8ce8b96acb21f5f414ccbb9c9acbd9b2e5`.
Exact-commit CI: https://github.com/leolionart/naai-erp/actions/runs/31031720108
