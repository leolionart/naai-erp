# ERP-998 — Summary

- CLI list output controls (`--limit`, `--cursor`, `--view`, `--q`, `--sort`, `--include-total`, `--max-bytes` stdout budget with valid truncated JSON, `--all --output` NDJSON/CSV) implemented in `apps/cli/src/list-output.ts`.
- Added `discovery describe`, `discovery openapi --tag`, and `count`/`summary` actions for both `expenses` and `commercial-documents` in `apps/cli/src/list-output.ts` and `apps/cli/src/resource-descriptions.ts`.
- Split `apps/cli/src/client.ts` routing into `apps/cli/src/legacy-route.ts` pinned by the golden route table in `apps/cli/src/route-golden.test.ts` (`apps/cli/src/__fixtures__/route-golden.json`).
