# ERP-922 tests

- `pnpm test:docs` — passed (11 accepted ADRs, 12 rule references, 29 AI relationship resources).
- `pnpm exec prettier --check README.md docs/product/business-rules.md docs/product/business-workflows.md docs/api/data-relationships-and-ingestion.md docs/testing/test-specification.md docs/testing/test-catalog.yaml docs/implementation/task-ledger.yaml` — passed after formatting.
- `git diff --check` — passed.
