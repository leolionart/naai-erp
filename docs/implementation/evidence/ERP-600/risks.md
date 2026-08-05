# ERP-600 risks and follow-up

- ERP-600 versions planning identity and lifecycle only. Revenue/expense composition, weighted pipeline, payroll/OPEX and cash forecast belong to ERP-610.
- Different fiscal calendars may later require fiscal-quarter/year target boundaries; this task intentionally uses explicit calendar periods from the accepted plan.
- A published target revision supersedes its prior current version while retaining history; reports must select the latest published series member deterministically.
- Month-end snapshots are historical accuracy evidence and must never be edited or deleted. Corrections require a new reviewed version.
- Actual basis labels must remain visible in comparisons so recognized, invoiced and collected values are not presented as interchangeable.
- Optional dimension quality affects management usefulness; missing team/service-line/owner dimensions should be surfaced rather than silently inferred.
- Live API use requires an authenticated organization-scoped token. Local unauthenticated readback correctly returns `AUTH_REQUIRED`.
- Exact-commit GitHub CI is still required before final acceptance.
