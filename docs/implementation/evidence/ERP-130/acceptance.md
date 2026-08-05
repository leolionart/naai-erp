# ERP-130 acceptance

- [x] One party can explicitly act as client, supplier, freelancer and/or employee.
- [x] Optional tax IDs, bank accounts and external references have organization-scoped uniqueness.
- [x] Party merge preserves source identity through a merge link; no financial-history hard delete is introduced.
- [x] Project captures client, owner, contract type, currency, exact budget and dates.
- [x] Project lifecycle validates transitions and closed projects reject new allocations.
- [x] Closed project reopen requires explicit approved command input.
- [x] Contracts and milestones are organization scoped and use exact minor units.
- [x] Test aliases `T-PTY-001` and `T-PRJ-001` are registered.
- [x] Exact-commit PostgreSQL migration and all seven integration tests pass.

ERP-130 is complete. ERP-140 is ready to add AI-native API/CLI coverage before Gate G1 can close.
