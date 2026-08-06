# ERP-740 Summary

Added non-root API/web/worker/migrate images, persistent migrate-once Compose, main/SHA GHCR release workflow, and a versioned real-workbook import pipeline with dry-run, transaction safety, stable source identity and cross-sheet reconciliation.

Mapping v2 reconciles the legacy explicit-month control independently from calendar-year accounting totals, records per-row evidence for mixed-year inclusion and recurring-personnel exclusion, and disallows aggregate variance waivers. The supplied workbook now passes dry-run without unexplained variance; database commit remains pending a PostgreSQL target.
