# ERP-992 — Risks & Follow-ups

- `apps/api/src/aging/` (`pg-aging.store.ts` and `aging.integration.test.ts`) was intentionally left untouched in this branch so `ERP-984` can land its AP aging store and test changes cleanly without merge conflicts.
- Older integration tests outside the ERP-992 target set that still insert static organization IDs continue to pass on single-run CI scratch databases; if developers re-run the full API integration suite repeatedly on one persistent database without recreating it, migrating remaining legacy fixtures to `randomUUID()` can be done incrementally after parallel P17 branches merge.
