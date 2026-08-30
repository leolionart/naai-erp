# ERP-952 summary

The operating-dashboard read model now computes owner-custody cash as reconciled custody inflows less posted expenses and purchase invoices with an explicit `CASH-OWNER-CUSTODY` funding account. Personal advances remain owner payable and do not reduce custody. Company available cash excludes custody to prevent double counting. All homepage business metrics are supplied by the backend read model; the frontend only formats and renders values.

Changed files: `apps/api/src/operating-dashboard/pg-operating-dashboard.store.ts`, `apps/web/src/app/workspaces/dashboard-workspaces.tsx`.
