---
title: "ERP-740 real workbook import Antigravity packet"
doc_type: implementation-task
project: NAAI ERP
status: active
tags: [erp-740, antigravity, xlsx, import, reconciliation]
---

# ERP-740 real workbook import slice

Work only in `/Volumes/DATA/Coding Projects/NAAI ERP`.

Source workbooks are read-only:

- `/Users/admin/Library/CloudStorage/CloudMounter-Personal/01. WORK/NAAI STUDIO/NAAI STUDIO Knowledge/.attachments/agent-naai-studio-knowledge-telegram-group-1004363908628-topic-59/media-group-14287751785233341-254-255/Project-Managements.xlsx`
- `/Users/admin/Library/CloudStorage/CloudMounter-Personal/01. WORK/NAAI STUDIO/NAAI STUDIO Knowledge/.attachments/agent-naai-studio-knowledge-telegram-group-1004363908628-topic-59/media-group-14287751785233341-254-255/2025_Tho-ng_ke-_doanh_thu-_chi_phi-_lo-i_nhua-n.xlsx`

Implement the bounded import capability required by ERP-740:

1. Inventory workbook sheets, headers, row counts, formulas and representative typed values without modifying either workbook.
2. Create a versioned, explicit mapping spec from source sheets/columns to NAAI ERP invoices, non-invoice expenses, parties, projects/categories and control totals.
3. Implement a CLI/script dry-run that performs zero database mutations and emits structured row-level validation errors plus sheet/control totals.
4. Implement explicit commit mode with organization scope, stable source identity, idempotent retry and transaction safety.
5. Emit a reconciliation report covering every source sheet/row and annual revenue, expense and profit controls. Unmapped or ambiguous rows must be reported, never silently skipped.
6. Add tests for dry-run zero mutation, repeat import idempotency, organization isolation, rollback on invalid commit and exact control-total reconciliation.

Constraints:

- Preserve original numeric/date types and exact money semantics.
- Do not modify the source workbooks.
- Do not hardcode user-specific absolute paths into runtime defaults; accept paths as CLI arguments and use the listed paths only for verification.
- Do not implement OCR, file storage, approval workflow or UI.
- Do not modify Docker/Compose, existing migrations, ERP-002/003/004 evidence or unrelated modules.
- Do not commit or push.
- Reuse existing workspace spreadsheet dependencies if present; do not install random global packages.

Run targeted unit/integration tests, a real dry-run against both provided workbooks, formatting and typecheck. End with a concise tmux report of files, sheet inventory, control totals, tests and blockers.
