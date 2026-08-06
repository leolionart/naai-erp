---
title: "ERP-720 backend draft-edit Antigravity packet"
doc_type: implementation-task
project: NAAI ERP
status: active
tags: [erp-720, antigravity, invoice, expense, draft-edit]
---

# ERP-720 backend draft-edit slice

Work only in `/Volumes/DATA/Coding Projects/NAAI ERP`.

Read `AGENTS.md`, the active sequential plan, and the existing uncommitted ERP-710 changes first.

Implement only the backend support needed by the focused ERP-720 UI:

1. Add organization-scoped update commands for draft commercial documents and draft expenses.
2. Expose explicit `PATCH` endpoints on stable resource URLs.
3. Require optimistic resource version and idempotency/correlation headers following existing API conventions.
4. Allow changes only while the resource is draft/unposted. Never mutate issued, posted, cancelled, reversed, or otherwise locked accounting records.
5. Preserve external references unless explicitly replaced with a valid organization-scoped reference.
6. Return structured validation/conflict errors and updated resource readback.
7. Add API/service/store tests for successful draft update, organization isolation, stale version, non-draft rejection, and idempotent replay.
8. Update OpenAPI and CLI only for these two PATCH commands.

Do not change UI, Docker, seed files, financial reports, historical migrations, or unrelated modules. Do not commit or push. Do not edit ERP-002/003/004 evidence. Run targeted API/CLI tests, typecheck, formatting, and DB integration if available. End with a concise report in tmux output.
