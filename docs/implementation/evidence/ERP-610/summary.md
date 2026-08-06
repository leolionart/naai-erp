# ERP-610 summary

- Task: ERP-610 — Revenue and expense forecast
- Gate: G6 — Planning and management reporting
- Status: implementation complete and locally verified; exact-commit CI pending

ERP-610 composes a forecast version from selected-basis actual-to-date, committed milestones, scheduled recurring revenue, weighted pipeline and reviewed manual adjustments. Revenue, expense and cash remain separate axes so an accrued expense and its later cash payment are not counted as two expenses.

Cash forecast discloses opening cash, expected collections, financing, payroll, AP due, recurring expenses, tax and capex. Owner funding is classified as financing rather than operating inflow or revenue.

Forecast components preserve exact minor-unit amounts, integer probability basis points, canonical source identity and source snapshots. Manual assumptions require maker-checker review. Published forecast snapshots are immutable, and a canonical commercial root/date cannot be included twice through contract, invoice or opportunity representations.

Publishing validates the complete component set, calculates composition and persists the published state plus composition snapshot inside one database transaction. Reads of a published version return that stored snapshot rather than recomputing from mutable source tables. The PostgreSQL integration case inserts a late backdated recognition event after publish and expects the original 90,000,000 projected-revenue snapshot to remain unchanged.

The usable admin UI, machine-readable API/OpenAPI/capabilities and first-party CLI are part of the same organization-scoped application-service contract. No AI/copilot surface is exposed in the UI.

`GF-FORECAST-002` is the independent exact-VND oracle for revenue 90,000,000, expense 44,000,000 and projected closing cash 22,000,000, including anti-double-count and owner-funding classification controls.

The integrated worktree passes repository quality/build checks, migration validation, all golden fixtures and 37/37 desktop/mobile Playwright journeys. Local PostgreSQL-specific integration was not run because no local PostgreSQL service was available; atomic snapshot and late-backdated readback execution remain exact-commit CI requirements.
