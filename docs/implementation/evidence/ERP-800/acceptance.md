# ERP-800 Acceptance

- Every project, sales, expense, zero-value marker and owner/personal movement source row has one stable review record.
- Review rows retain source coordinates, raw values, mapped values, flags, status and eventual canonical resource identity.
- Generic client/payee, missing project, missing budget, zero-value and owner-movement cases remain explicit pending review.
- Review edits are organization-scoped, audited and protected by optimistic versioning.
- Import retry is idempotent and does not duplicate review rows or rewrite posted accounting history.
- Admin UI provides list filters and focused detail editing through a drawer or dedicated route.
- Real tenant `naai` contains exactly 288 review rows: 234 pending and 54 posted.
- The review UI loads the real data with no console errors and exposes familiar shadcn table/filter/drawer patterns rather than custom all-in-one forms.
- Project customer relation is editable and invoice/expense forms write the canonical `projectId` dimension while retaining legacy read fallback.
- API discovery and the first-party CLI expose review-row list/get/update operations for AI-native access.
