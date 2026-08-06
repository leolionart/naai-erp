---
title: "ERP-710 Antigravity implementation packet"
doc_type: implementation-task
project: NAAI ERP
status: active
tags: [erp-710, antigravity, paperless, webhook]
---

# ERP-710 bounded implementation task

Work in `/Volumes/DATA/Coding Projects/NAAI ERP` on the current `main` checkout.

Read `AGENTS.md`, `docs/planning/NAAI ERP - Sequential Coding Plan.md`,
`docs/product/business-rules.md`, and `docs/implementation/task-ledger.yaml` first.

Implement the smallest coherent ERP-710 slice:

1. Add a generic organization-scoped external reference for commercial documents and expenses with `system`, `externalId`, canonical URL, checksum/version, synced timestamp, and JSON metadata.
2. Enforce uniqueness on `(organization, system, externalId)` with a new forward migration; never rewrite historical migrations.
3. Preserve existing invoice/expense posting and accounting state machines.
4. Add focused schema/domain/API tests for uniqueness and organization isolation.
5. Do not implement OCR, binary file storage, approval inbox, manual replay, onboarding, UI work, Docker, or unrelated refactors.

Constraints:

- Preserve all unrelated dirty files, especially `docs/implementation/evidence/ERP-002`, `ERP-003`, and `ERP-004`.
- Do not commit, push, or delete existing accounting/reporting modules.
- Use exact money semantics and organization-scoped queries.
- Run targeted formatting, typecheck, unit tests, and DB integration tests when PostgreSQL is available.
- Finish with a concise summary of changed files, tests, assumptions, and blockers in the tmux output.
