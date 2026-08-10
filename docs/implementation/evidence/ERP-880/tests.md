# ERP-880 tests

## Commands and results

- `pnpm --filter @naai-erp/web exec vitest run src/components/layout/app-navigation.test.tsx`
  - PASS: 1 file, 2 tests.
- `pnpm --filter @naai-erp/web typecheck`
  - PASS: TypeScript emitted no errors.
- `pnpm exec eslint apps/web/src/components/layout/app-navigation.tsx apps/web/src/components/layout/app-navigation.test.tsx apps/web/src/components/ui/hover-card.tsx apps/web/e2e/admin-navigation.spec.ts`
  - PASS: no lint findings.
- `pnpm --filter @naai-erp/web exec playwright test e2e/admin-navigation.spec.ts --project=desktop-chromium --grep "collapsed sidebar"`
  - PASS: 1 desktop Chromium test.
- `pnpm test:docs`
  - PASS: 11 ADRs, 12 rule references and 29 AI relationship resources verified.
- `git diff --check`
  - PASS: no whitespace errors.

## Rendered browser readback

- URL: `http://localhost:3000/banking/owner-current`
- Page title: `Đối chiếu công nợ chủ | NAAI ERP`
- Sidebar collapsed successfully.
- Hovering `Doanh thu & Chi phí` exposed both destinations.
- Moving onto `Quản lý chi phí` and waiting 500 ms retained the visible submenu.
- No framework error overlay was present. Existing duplicate React-key errors in the Owner Current
  data table are unrelated to the navigation component and remain a separate follow-up risk.
