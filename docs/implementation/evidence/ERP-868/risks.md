# ERP-868 risks

- Database-backed integration suites remain CI-gated; the reused local fixture database contains
  fixed IDs and the local PostgreSQL role cannot create an isolated database.
- Production follows the user-selected rolling `latest` channel rather than an immutable Compose
  tag. Deployment readback therefore records the exact OCI revision and digest for traceability.
- Liquidity runway remains `missing_reviewed_burn` until the underlying cash-flow review is complete.
  ROI remains empty until real ROI definitions and input facts exist; no placeholder values were added.
