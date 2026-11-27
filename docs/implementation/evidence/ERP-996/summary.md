# ERP-996 — Summary

- Migrated critical lists (`expenses`, `commercial-documents`, `journals`) to SQL keyset pagination with `view=summary` default and `view=full` cap.
- Added `/count` and `/summary` endpoints to both `expenses` (`apps/api/src/expenses/expense.controller.ts`) and `commercial-documents` (`apps/api/src/commercial-documents/commercial-document.controller.ts`), plus unit tests in `commercial-document.service.test.ts`.
- Updated `apps/web/src/lib/api/client.ts` and `apps/web/src/app/workspaces/load-all-pages.ts` to follow `page.nextCursor` and surface `meta.truncated` at the cap.
