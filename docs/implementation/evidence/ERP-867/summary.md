# ERP-867 summary

Completed the API-backed executive metrics readiness flow.

- Added `owner_loan` parity across TypeScript and OpenAPI.
- Added indexed validation for policy semantic mappings.
- Removed all executive-metric development fixtures from report pages.
- Replaced hardcoded 2026 dates with the current Vietnam calendar year/date.
- Added an actionable missing-policy state and an honest unconfigured-ROI state.
- Added `/settings/executive-metrics` for policy coverage, mapping version creation and
  maker-checker approval.
- Source dialogs now show the API report cutoff/fingerprint rather than demo text.

Production was audited read-only. No production configuration or financial record was mutated.
