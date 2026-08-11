# ERP-891 Tests

- `pnpm test:dev-data-source` — passed, 6/6 tests.
- `pnpm dev:local-data -- --check` — passed; local organization `naai`, API port `3001`.
- `pnpm dev:prod-data -- --check` — passed; production API profile `naai`, read-only.
- `pnpm test:docs` — passed.
- `pnpm format:check` — passed.
- `pnpm lint` — passed for all 10 packages.
- `git diff --check` — passed.

Existing listeners on ports 3000 and 3001 were inspected and left running; validation used check-only
commands and did not replace the user's localhost processes.
