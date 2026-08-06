---
title: "ERP-740 workbook import audit Antigravity packet"
doc_type: implementation-task
project: NAAI ERP
status: active
tags: [erp-740, antigravity, audit, reconciliation]
---

# ERP-740 workbook import audit

Perform a read-only audit of the uncommitted workbook-import implementation in `/Volumes/DATA/Coding Projects/NAAI ERP`.

Do not edit, format, generate evidence, change the ledger, commit, push, or install dependencies.

Verify with concrete file/line evidence:

1. Both provided workbooks were actually inventoried and every relevant sheet/row is accounted for.
2. Dry-run performs zero mutations, including audit/idempotency tables.
3. Commit is organization-scoped, transactional and idempotent with a stable source identity.
4. Posted invoices/expenses and journal entries preserve exact money, VAT, dates and balanced double entry.
5. Reconciliation totals match the source workbooks and unmapped/ambiguous rows cannot be silently dropped.
6. Tests genuinely execute PostgreSQL paths rather than passing while skipped.
7. Runtime dependency and CLI changes follow workspace conventions and do not introduce unsafe `process.exit` behavior.

Run read-only tests/commands where useful. Report every high/medium issue, missing acceptance criterion, exact source totals and recommended fixes in tmux output. Do not claim completion if evidence is indirect.
