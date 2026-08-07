# ERP-821 Tests

Validation completed on 2026-08-07:

- `pnpm test:docs` — passed; verified 10 accepted ADRs, 11 rule references and 27 AI
  relationship resources.
- `jq empty docs/api/data-relationship-manifest-v1.json` — passed.
- `git diff --check -- <ERP-821 files>` — passed.
