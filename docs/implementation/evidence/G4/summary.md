# Gate G4 summary

- Gate: G4 — Banking, cash and AR/AP
- Tasks: ERP-400, ERP-410, ERP-420, ERP-430, ERP-440
- Status: in progress

ERP-400 through ERP-430 are implemented and exact-commit CI verified. ERP-440 implements the remaining gate-level controls: statement opening/closing totals, zero unexplained suspense, full bank-to-ledger control proof, supplier-advance integration coverage and consolidated headless/UI evidence.

The statement-session workflow is server-derived from linked imports and bank transactions. It exposes draft → reviewed → closed lifecycle, explicit suspense ownership/review dates, approved/resolved/rejected exception history, exact close blockers and append-only audit events.
