# ERP-640 summary

- Task: ERP-640 — Executive metrics
- Gate: G6 — Planning and management reporting
- Status: implementation complete; exact-commit CI pending

ERP-640 exposes profitability ratios, purpose-specific returns, accumulated loss, Equity Consumed, operating net burn and runway from reviewed, versioned source semantics. Every metric retains its formula version, period, dimensions, numerator/denominator and source boundary.

Project ROI, marketing ROI, ROE and ROA remain distinct. Owner loans remain liabilities; owner funding is excluded from operating inflow; restricted cash is excluded from runway. Missing or non-positive denominators return a structured N/A state rather than zero or Infinity.

Approved executive-metric policies and semantic mappings define contributed capital, retained earnings, reviewed equity adjustments, owner withdrawals, owner loans and unrestricted/restricted cash. The selected policy version is explicit in the report contract and source fingerprint. Approved ROI definitions and reviewed ROI facts remain purpose- and version-specific. A policy must cover the complete requested reporting period, and ROI facts must remain within the definition's effective dates.

The REST API, canonical OpenAPI document, capability discovery and first-party CLI expose policy versioning, approvals, ROI definitions/facts and the aggregate plus five focused projections. The admin UI provides a report landing page and dedicated equity, liquidity, profitability, returns and ROI pages with URL-backed Sheet filters, source Drawers, structured Alerts and responsive exact-value tables. AI access remains underneath the UI through the same discoverable contracts.

`GF-EQUITY-001` independently verifies the formula boundary without importing production code. The integrated local worktree passes repository checks, all 33 migration-journal entries, all golden fixtures and 51/51 desktop/mobile Playwright journeys. PostgreSQL migration and executive-metric integration remain an exact-commit CI gate before acceptance.
