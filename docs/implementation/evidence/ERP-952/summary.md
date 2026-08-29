# ERP-952 summary

The operating-dashboard read model now computes owner-custody cash as reconciled custody inflows less posted expenses paid from the custody account. All homepage business metrics are supplied by the backend read model; the frontend only formats and renders values.

Changed files: `apps/api/src/operating-dashboard/pg-operating-dashboard.store.ts`, `apps/web/src/app/workspaces/dashboard-workspaces.tsx`.
