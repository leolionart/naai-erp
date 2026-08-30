# NAAI ERP Agent Instructions

These instructions apply to every coding agent working in this repository.

## Mandatory reading order

Before modifying code, read these files completely in order:

1. `docs/product/business-rules.md`
2. `docs/testing/test-specification.md`
3. `docs/implementation/task-ledger.yaml`
4. ADRs and specifications referenced by the selected task.

Do not start implementation if any mandatory file is missing, unreadable, or contradictory. Record the blocker in the task ledger.

## Task selection

- Work only on a task whose status is `ready` or `in_progress`.
- All task dependencies must be `done`.
- Prefer the lowest-numbered ready task in the dependency spine.
- Do not bypass an acceptance gate.
- One agent owns one task scope at a time unless the task explicitly permits parallel file ownership.
- If no task is ready, stop and report the exact missing dependency or decision.
- Tasks marked `deferred` can now be implemented as the MVP phase is complete.

## Post-MVP Phase

- The active MVP boundary has been lifted. All business resources must now be fully supported via CLI and API.
- NAAI ERP receives structured invoice/expense data. Paperless-ngx owns source files and search; n8n/OCR owns extraction, normalization and retry orchestration.
- Do not implement OCR, document archiving, an OCR review inbox, onboarding wizard, replay/dead-letter orchestration or broad enterprise workflows.
- Invalid inbound payloads return structured field errors. n8n handles retry; users edit ERP drafts directly. Do not add a separate review/approval lifecycle for ingestion.
- Prefer Antigravity/Gemini for bounded mechanical CRUD, client, test-boilerplate, Docker and documentation work when available; Codex integrates and verifies accounting/API gates.

## Skill coordination and environment boundaries

Use the NAAI ERP skills as a coordinated workflow, not as interchangeable shortcuts:

- `naai-erp-prod-data-ops` is the entry point for PROD data audit, clone and correction. It owns
  organization scope, evidence, mutation safety and API-only business-data writes.
- `naai-erp-backup-restore` is mandatory before any PROD or local database restore, clone import or
  corrective mutation. Record the backup path, checksum, schema/version checks and row-count controls.
- `naai-erp-deploy-monitor` is used only for code/image release: inspect the worktree and gates, push
  only when authorized, wait for the exact `Release main images` workflow, create the required release,
  update Dockge and verify runtime image revisions and health.
- `dockge-container-ops` is the infrastructure transport for stack status, logs, restart/update and
  Compose operations. It must not be used as an alternative business-data mutation path.
- `caddy-route-manager` is used only when reverse-proxy routes, TLS or public service exposure change;
  verify the route before and after reload.

For a task involving both code and data, follow this order: (1) read-only audit with
`naai-erp-prod-data-ops`; (2) backup with `naai-erp-backup-restore`; (3) data correction through the
authenticated PROD REST API/CLI and read back the resource; (4) code change and tests; (5) deploy and
monitor with `naai-erp-deploy-monitor` plus `dockge-container-ops`; (6) repeat API, ledger and
dashboard reconciliation. SQL/Docker access is limited to backup, schema discovery and read-only
queries; never mutate business rows directly. Report data-correction evidence separately from image
deployment evidence.

## Required execution loop

For each task:

1. Mark it `in_progress`, recording agent, timestamp and planned files.
2. Read the task's business-rule IDs and test IDs.
3. Write or update failing tests before behavior changes where practical.
4. Implement only the stated deliverables.
5. Run the task test set, then the affected module suite, then repository quality gates.
6. Save evidence under `docs/implementation/evidence/<task-id>/`.
7. Update documentation concurrently with code changes ("code tới đâu update docs tới đó"). This includes updating `docs/product/business-rules.md`, APIs, schemas, ADRs, migrations and runbooks affected by the change.
8. Mark `review` only when acceptance evidence is complete.
9. Mark `done` only after review/gate requirements pass.

## Accounting invariants

- Posted journal entries are immutable.
- Debit equals credit for every posted journal in base currency.
- Reversal entries preserve history and net to the intended correction.
- Closed periods reject posting unless reopened through the approved workflow.
- Recognized, invoiced and collected revenue are separate measures.
- Management validity and tax eligibility are independent states.
- Financial mutations are organization-scoped, authorized, audited and idempotent.
- Reports derive from posted ledger/read models, never directly from unapproved drafts.

Any implementation that violates an invariant must stop; do not weaken a test to make it pass.

## AI-native interface invariant

- Every business resource must be readable and writable, where permitted, through versioned REST/OpenAPI and the first-party CLI.
- CLI, UI and optional AI/MCP adapters call the same application services; none use direct PostgreSQL access as an integration path.
- AI/service identities never bypass organization scope, RBAC, audit, idempotency, period locks or accounting rules. Existing accounting lifecycle controls remain intact, but external ingestion has no additional review workflow.
- A feature is not `done` if it only has schema/domain/UI without its applicable machine-readable contract.

## Testing requirements

- Every business rule change needs a linked test ID.
- Bug fixes require a regression test that fails before the fix.
- Ledger changes require unit, property and integration coverage.
- API/webhook changes require contract and idempotency tests.
- Database changes require empty-database migration and upgrade-path tests.
- User-facing financial flows require E2E drill-down evidence.
- Docker/release changes require Compose validation and smoke tests.

## Worktree and Git safety

- Preserve unrelated user changes.
- Do not reset, clean, force-push or rewrite history.
- Never commit secrets, `.env`, database dumps or customer financial data.
- Use anonymized fixtures.
- Commits must reference the task ID, for example `feat(ERP-200): add balanced journal posting`.
- Do not push or deploy unless the user explicitly requests it and the relevant gate passes.

## Image release notes

- Before pushing, determine whether the pushed commit range matches an image-building path in
  `.github/workflows/release-main.yml`.
- When a push builds and publishes Docker images, wait for the `Release main images` workflow for
  the pushed SHA to complete successfully.
- After the image workflow succeeds, use the authenticated GitHub CLI (`gh release create`) to
  create a GitHub release and generated release notes targeting that exact pushed SHA. Do not use a
  browser-only or manually drafted substitute when `gh` is available.
- Use tag `release-<YYYYMMDD>-sha-<12-character-sha>` unless the user specifies another version.
- Include the immutable `sha-<12-character-sha>` image tag and the published image set in the
  release notes. Report the workflow URL, release URL and image tag in the final handoff.
- Write release notes for product users and business owners. Describe the features delivered, the
  business behavior or accounting logic that changed, and the practical before/after outcome.
- Explain important safeguards, limitations or actions users may need to take, using product and
  business language. Make clear when existing data is unchanged and only future behavior changes.
- Do not fill release notes with implementation details such as filenames, internal classes, SQL,
  frameworks, test counts or refactoring mechanics. Include technical detail only when it is an
  operational requirement for installation, migration, compatibility, rollback or security.
- Do not create a GitHub release for docs-only pushes or pushes where the image workflow does not
  publish an image.

## Overnight autonomy boundaries

Agents may continue sequentially while:

- the next task is `ready`;
- dependencies and required decisions are resolved;
- tests pass or failures can be fixed within current scope;
- no external approval, production mutation or credential is required.

Stop and mark `blocked` when:

- accounting/tax policy requires owner or accountant choice;
- a destructive or incompatible migration is required;
- a license or security issue is unresolved;
- a gate fails three consecutive repair attempts;
- external credentials, GitHub repository authority or production approval are missing;
- proceeding would expand scope beyond the selected task.

## Evidence contract

Each completed task evidence folder must contain:

- `summary.md`: outcome, files changed and decisions.
- `tests.md`: exact commands and results.
- `acceptance.md`: each acceptance criterion with proof.
- `risks.md`: remaining risks, follow-ups and migrations.

Machine outputs may be attached as additional text/JSON files, but must not contain secrets.

## Final handoff

Report:

- tasks completed and current gate;
- tests and validation results;
- commits created, without claiming remote push unless verified;
- next ready task;
- blockers or decisions required;
- Docker image/digest and deployment readback only when actually built/published/deployed.
