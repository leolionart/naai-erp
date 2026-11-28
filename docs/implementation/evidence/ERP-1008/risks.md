# ERP-1008 Risks & Follow-ups

- **Client pagination cap**: `createApiClient` enforces `DEFAULT_MAX_PAGES = 50` (`5,000` records at 100/page) with `meta.truncated` telemetry, preventing unbounded memory growth while comfortably covering organization master-data directories.
- **No database migration**: Frontend lookup change only; existing data requires no schema migration.
