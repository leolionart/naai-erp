# ERP-1012 — Acceptance

- `BR-UI-008` / `ADR-013`: Verified by `pnpm test:docs` (`T-DOC-ERP-1012-002`, 12 accepted ADRs and 13 rule references) and `apps/web/src/components/dls-compliance.test.ts` (`T-UNIT-ERP-1012-001`).
- `/settings/telegram`: Full-width KPI summary cards, 2-column `Card` form, `Switch` controls, `CardFooter` submit/test actions, `Skeleton` hydration state, and `sonner` toasts verified.
- `/settings/automation`: Dedicated screen renders `IntegrationAutoRecordSection` (with `Switch`) and inline `AutomationApiReferenceSection` directly without any header popup trigger.
- `BR-SIZE-001`: `automation-api-dialog.tsx` removed from `scripts/file-size-baseline.json` and `ledger-master-workspace.tsx` baseline lowered via `pnpm check:file-size --update`.
