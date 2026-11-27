# ERP-996 — Acceptance

- `BR-READ-001..005`: keyset pagination, `view=summary`, `/count`, `/summary` (`<= 120` groups), and web `nextCursor` auto-follow implemented.
- `T-INT-READ-002`: verified via `expense-list.integration.test.ts`, `commercial-document.service.test.ts`, and `apps/web/src/lib/api/client.test.ts`.
