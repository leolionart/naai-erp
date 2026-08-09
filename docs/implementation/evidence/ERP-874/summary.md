# ERP-874 summary

Implemented deterministic import mapping and dashboard cutoff protection.

- Explicit historical `asOfDate` values are preserved while report query ends clamp to the cutoff.
- The workbook mapper uses a reviewed alias for WATA Tech/WATAtek without fuzzy-matching unrelated customers.
- Reviewed web labels map to canonical service line `WEB`; unsupported or missing labels remain explicit review flags.
- Workbook project import validates active organization service-line master data and persists the reporting fallback.

No production data migration or deployment was performed.
