# ERP-892 tests

- Focused Vitest navigation/workspace set: 3 files, 7 tests passed.
- Full web unit suite: 22 files, 61 tests passed.
- Focused route-navigation Playwright set: 10 desktop tests passed.
- Admin navigation Playwright set: 5 desktop/mobile tests passed.
- `pnpm --filter @naai-erp/web typecheck`: passed.
- `pnpm --filter @naai-erp/web lint`: passed.
- `pnpm check`: passed after one transient CLI timeout and one formatting correction; final rerun
  completed formatting, lint, typecheck, docs, security, fixtures, native DB, package tests and build.
- `git diff --check`: passed.
- Environment warning only: Node v26 was active while the repository declares Node `>=22 <25`.
