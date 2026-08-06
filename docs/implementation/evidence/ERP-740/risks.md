# ERP-740 Risks

- The supplied `Tỷ suất lợi nhuận` sheet is a static legacy mixed-year rollup based on explicit `Tháng` fields, not a calendar-year accounting control. Mapping v2 preserves calendar totals separately and records every included/excluded legacy component with source coordinates and classification.
- The workbook has no reliable client field for most project rows. Five sales rows are linked to three reviewed projects; remaining projects stay on `Generic Client` with explicit warnings until an owner mapping is provided.
- The real import commit still requires a PostgreSQL target. Local development currently has no native PostgreSQL service and Docker remains disabled by user request.
- Docker/Compose was verified once, then stopped; local development remains native as requested.
