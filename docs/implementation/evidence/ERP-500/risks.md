# ERP-500 risks and follow-ups

- The owner still needs to confirm whether NAAI Studio primarily records clock-based time, weekly allocation or both. The model supports both, but organization policy should decide allowed modes and whether mixed usage is ever permitted.
- The selected labor-cost basis—gross salary, fully loaded cost or blended rate—is configurable. Production reporting must label the basis and should not imply that alternatives are interchangeable.
- Employee/freelancer parties and authenticated users are distinct records. Workforce-profile identity mapping must be organization scoped and unique enough to prevent one user acting for another worker.
- Raw labor rates are sensitive compensation inputs. Ordinary project managers and timesheet users should receive derived labor cost only; logs, exports, UI payloads and audit metadata must not leak raw rates.
- PostgreSQL exclusion/concurrency constraints must independently prevent overlapping timed entries and overlapping approved rate ranges. Application validation alone is insufficient under concurrent requests.
- Project lifecycle and project-date validation belongs in the database/API integration path because the standalone domain receives only normalized time input. Closed projects must reject new time or adjustment allocation.
- Period closing/locking must coordinate with approved timesheets. Later tasks must not silently add time into a locked accounting/allocation period.
- Adjustment billing effects require ERP-520 or invoicing integration policy. A billed-time correction may require a credit or supplemental billing action; ERP-500 preserves the adjustment but does not create the commercial document.
- Exact-commit CI, PostgreSQL integration and browser E2E remain required before ERP-500 closure.
