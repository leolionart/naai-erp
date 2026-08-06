# ERP-800 Acceptance

- Every project, sales, expense, zero-value marker and owner/personal movement source row has one stable review record.
- Review rows retain source coordinates, raw values, mapped values, flags, status and eventual canonical resource identity.
- Generic client/payee, missing project, missing budget, zero-value and owner-movement cases remain explicit pending review.
- Review edits are organization-scoped, audited and protected by optimistic versioning.
- Import retry is idempotent and does not duplicate review rows or rewrite posted accounting history.
- Admin UI provides list filters and focused detail editing through a drawer or dedicated route.
- Real tenant `naai` contains exactly 399 review rows: 345 pending and 54 posted. This covers all 288 business rows plus 111 debt, profitability, planning, bonus, payroll-master and expense-category control rows.
- Project, sales and expense review rows retain every source workbook column needed for later mapping, including cash/receipt, invoice metadata, Paperless reference, funding source, department and project operational metadata.
- Payroll review rows exclude phone, identity number, birthday and email from the generic finance review queue.
- Reused Paperless invoice references are flagged for review and are never silently attached to multiple unrelated expenses.
- The review UI loads the real data with no console errors and exposes familiar shadcn table/filter/drawer patterns rather than custom all-in-one forms.
- Project customer relation is editable and invoice/expense forms write the canonical `projectId` dimension while retaining legacy read fallback.
- API discovery and the first-party CLI expose review-row list/get/update operations for AI-native access.
- The operating dashboard exposes every control/master row in a separate, explicitly non-canonical source-control read model and never mutates journal, document, expense or reconciliation counts while reading it.
- The dashboard chart uses exact monthly values, selects an imported period/basis with data, and does not hide the missing Executive Metrics policy behind demo KPI values.
- Financial-statement dynamic period/as-of route parameters are passed to canonical report APIs.
- Revenue trend uses the interactive shadcn Area Chart with exact tooltip values, 3/6/all-month
  selection, accessible value text and no 390px viewport overflow.
- Legacy expense replacement requires an exact source ID/date/party/amount/currency match and uses
  normal journal reversal plus purchase-invoice lifecycle APIs; it cannot silently bypass duplicate
  protection for a mismatched source.
