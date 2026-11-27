# ERP-994 — Acceptance

- `BR-SIZE-001` (all new modules ≤500 non-blank/non-comment lines; baseline strictly lowered): verified via `pnpm check:file-size` and `scripts/file-size-baseline.json` (57 → 31).
- `T-INT-SPLIT-001` (public facades preserved, no behavior regressions): verified via `pnpm typecheck`, `pnpm test`, and `pnpm build`.
