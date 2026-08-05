# ERP-345 Tests

## Automated

- `pnpm --filter @naai-erp/web test` — PASS, 9 files / 20 tests.
- `pnpm --filter @naai-erp/web typecheck` — PASS.
- `pnpm --filter @naai-erp/web build` — PASS; all admin routes prerendered.
- `pnpm check` — PASS, including repository format, lint, typecheck, tests and builds.
- `git diff --check` — PASS.
- Raw control audit over implemented workspaces found no remaining raw `button`, `input`, `select`, `table` or `label` elements and no inline style objects.

## Rendered QA

Browser plugin selection failed with `No browser is available`; the approved local Playwright fallback was used against `http://localhost:3000`.

- Desktop 1280×720: dashboard shell, active navigation, documents list and document creation form rendered without a framework overlay.
- Mobile 390×844: dashboard reflowed to one column; the accessible Sheet menu opened and exposed all available/planned destinations.
- Interaction: Dashboard → Hóa đơn changed the URL to `/documents`; `+ Tạo mới` displayed the operational invoice form.
- Console error check after the successful reload and interactions returned no application errors.
- Temporary Playwright snapshots were removed after verification.

Exact implementation commit `b2ad82fafcc1235864ddff12fb2cbd2f9c20a1f0` passed CI: https://github.com/leolionart/naai-erp/actions/runs/31003226750
