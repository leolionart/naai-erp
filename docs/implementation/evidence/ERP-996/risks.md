# ERP-996 — Risks & Follow-ups

- UI Load-more controls (50 rows per increment), server-side search (`q`), `T-E2E-READ-003`, and the dashboard `LIMIT_INVALID` fix (`withPagingParams` in `apps/web/src/lib/api/client.ts` and removing hardcoded `limit=500` in `dashboard-workspaces.tsx`) are implemented and verified.
- Optional future enhancement: replace client-side `dataAll` aggregation in `useExpenseOverviewData` with a dedicated `(month, category)` server summary endpoint if organization expense volume exceeds the 10,000-row safety cap.
