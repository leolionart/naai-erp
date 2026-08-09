# ERP-874 acceptance

- Supplied full-year URL retains `asOfDate=2026-08-09`: proven by dashboard regression test.
- Future cutoffs clamp to today without rewriting the selected reporting period: proven by dashboard regression test.
- WATA Tech/WATAtek resolve to one reviewed identity while VIOD/OCD remain distinct: proven by CLI unit test.
- Reviewed web labels map to `WEB`; missing and unsupported values stay reviewable: proven by CLI unit test.
- Unknown or inactive service-line codes reject before project mutation: proven by DB integration test.
- A valid active service-line code persists to `projects.default_service_line_code`: proven by DB integration test.
