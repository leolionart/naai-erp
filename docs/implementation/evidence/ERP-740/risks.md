# ERP-740 Risks

- The supplied `Tỷ suất lợi nhuận` sheet is a static legacy mixed-year rollup based on explicit `Tháng` fields, not a calendar-year accounting control. Mapping v2 preserves calendar totals separately and records every included/excluded legacy component with source coordinates and classification.
- The workbook has no reliable client field for most project rows. Five sales rows are linked to three reviewed projects; remaining projects stay on `Generic Client` with explicit warnings until an owner mapping is provided.
- The real import commit has been executed and verified natively on the PostgreSQL target, creating 14 parties, 14 roles, 29 projects, 41 sales invoices, 200 expenses, and 241 journals (482 lines) with balanced Trial Balance (987,753,157).
- Native execution required explicit `DATABASE_URL` environment configuration, and the temporary native API server has been stopped.
- CI/CD release pipeline, final OCI images, and git SHA references remain pending parent integration.
