# ERP-900 acceptance

- Every OpenAPI POST/PATCH/DELETE endpoint is present exactly once.
- Each row declares effect, current reason/checker/version/idempotency mechanics, desired behavior
  and retained safeguards.
- Dynamic routes use their maximum known severity: direct-cost, recognition and overhead post/reverse
  routes are `correction`; timesheet lock/bill routes are also conservatively `correction`.
- UI action families cover expense, documents, time, allocation, planning, subscriptions, banking,
  reconciliation and technical-field presentation.
- Controlled mode remains unchanged and the inventory changes no runtime behavior.
- Main review accepted all `122/122` rows and the final effect distribution; ERP-901 may now use
  this matrix to resolve concrete one-click lifecycle candidates.
