# ERP-600 acceptance evidence

Current acceptance coverage:

- Pass locally: monthly, quarterly and yearly target calendar boundaries are validated.
- Pass locally: target amount uses exact minor units and each series selects recognized, invoiced or collected actual basis explicitly.
- Pass locally: target series are scoped by organization, period, basis, currency and optional team/service-line/owner dimensions.
- Pass locally: a target revision must reference the latest published version and retains the superseded version.
- Pass locally: base, best, worst and named custom forecast scenarios are separate version series.
- Pass locally: target and forecast records do not contain or overwrite actual accounting amounts.
- Pass locally: published month-end snapshots require a true calendar month end, are independently addressable and cannot be superseded in place.
- Pass locally: versioned REST contracts preserve money as decimal strings, selected basis, dimensions, lifecycle state and next actions.
- Pass locally: first-party API/CLI operations apply organization scope, RBAC, idempotency, audit reason and optimistic resource version controls.
- Pass locally: admin navigation exposes target/scenario queue pages and dedicated detail pages; creation/publish uses Dialog, filters use URL-backed Sheet and supersede uses a reason-required AlertDialog.
- Pass locally: desktop and mobile planning journeys pass without body overflow.
- Pass locally: `GF-FORECAST-001` independently verifies 4 target versions, 3 latest target controls, 3 actual bases, 4 scenarios and 3 retained month-end snapshots with zero control difference.

Exact-commit GitHub CI passed for `1e84c0d2ebd6b31231128a0332eb2bf945734ce5`: https://github.com/leolionart/naai-erp/actions/runs/31056116463.
