# ERP-868 risks

- The production API still runs the previous code until an explicitly authorized push/deployment.
- The production draft policy cannot be approved by the current single actor before that deployment.
- Database-backed integration suites remain CI-gated; the reused local fixture database contains
  fixed IDs and the local PostgreSQL role cannot create an isolated database.
