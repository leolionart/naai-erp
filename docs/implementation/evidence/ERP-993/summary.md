# ERP-993 — File size ratchet

- `scripts/check-file-size.mjs`: dependency-free counter matching ESLint `max-lines` (skip blank lines and comments) over `apps/*/src`, `packages/*/src`, `scripts`; excludes tests, migrations, fixtures, snapshots, build output.
- `scripts/file-size-baseline.json`: 57 files currently above 500 lines (identical to the set ESLint warned on, excluding tests).
- Rules: unbaselined file > 500 fails; baselined file may not grow; shrinking requires lowering the baseline; file ≤ 500 must leave the baseline; `--update` only lowers/removes, never adds or raises; `--init` refuses to overwrite.
- Wired into `pnpm check`, `.githooks/pre-commit` and CI (via `pnpm check`). ESLint `max-lines` is `error` outside the baseline, `warn` for baselined and test files.
- Docs: `AGENTS.md` code-size rule, `BR-SIZE-001` now active, `T-UNIT-SIZE-001` in the test catalog.
- Note: plan measured 60 source files; the script (same counting as ESLint) finds 57.
