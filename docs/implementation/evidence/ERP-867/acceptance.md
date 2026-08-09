# ERP-867 acceptance

- Policy semantic contract includes `owner_loan`: proven by type, OpenAPI enum and unit regression.
- Invalid mapping payloads return stable indexed errors: proven by service tests.
- Financial UI never falls back to fixture values: proven by negative E2E/API-failure coverage.
- All five executive-metric routes remain reachable: proven by desktop E2E.
- Canonical API values, filters and source dialog render correctly: proven by mocked-contract E2E.
- Empty ROI is explicit rather than fabricated: proven by E2E.
- Policy coverage and maker-checker actions have a first-party UI: proven by settings E2E.
- Mobile layout remains within the viewport: proven by mobile Chromium E2E.
