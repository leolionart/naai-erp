# ERP-906 acceptance

- Portable workbooks contain no sheet solely because a database table exists or is empty.
- Empty, embedded-child and operational resources remain explicitly inventoried with stable
  manifest exclusion reasons.
- Export retention is organization-scoped, concurrency-safe and preserves metadata, hashes, audit
  history and canonical accounting rows.
- Downloading pruned content produces an explicit HTTP 410 instead of an ambiguous missing-resource
  response.
- Migration 0052 succeeds on fresh and upgraded PostgreSQL databases.
- `pnpm prod:update` enforces `latest`, propagates migration failure and cannot restart application
  services before migration succeeds.
- Storage reporting is read-only; `VACUUM FULL` requires exact relation confirmation, backup evidence
  and an additional remote-production opt-in.
- Full formatting, lint, typecheck, tests, documentation, fixture and build gates passed.
