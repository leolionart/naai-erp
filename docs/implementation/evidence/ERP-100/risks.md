# ERP-100 remaining risks and follow-ups

- PostgreSQL Row-Level Security remains defense-in-depth work planned after the initial schema/repository boundary; application services must always require organization context per ADR-002.
- Fiscal-period posting authorization and approved reopen audit are enforced by ERP-220/ERP-230 when posting workflows exist. ERP-100 supplies the states and valid domain transitions only.
- The domain helper creates a standard 12-month calendar year for onboarding. The database supports organization-defined dates and up to 53 periods for later configurable fiscal calendars.
- Exchange-rate ingestion, approval policy, realized FX and period-end revaluation belong to later document, banking and accounting tasks.
