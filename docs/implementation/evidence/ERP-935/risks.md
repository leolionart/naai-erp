# ERP-935 risks

- The compatibility fallback selects the first non-empty category across lines. Multi-line invoices with conflicting categories still need a richer multi-category presentation contract; this change does not invent a single category for that case.
- E2E was run against the existing web server with `PLAYWRIGHT_SKIP_WEBSERVER=1`; the default Playwright web-server path was unavailable because port 3000 was already occupied.
