# NAAI ERP Overnight Codex Runbook

This runbook defines safe autonomous progress. “Overnight” means resumable sequential work with hard gates, not unlimited authority.

## 1. Startup sequence

Read completely:

1. `AGENTS.md`
2. Sequential Coding Plan
3. Business Rules Catalog
4. Executable Test Specification
5. `docs/implementation/task-ledger.yaml`
6. Referenced ADR/specs and current `git status`

Validate:

- repository/worktree state;
- current branch and upstream if configured;
- required commands/runtime;
- no unresolved merge/conflict;
- task ledger schema and next ready task.

## 2. Task selection algorithm

1. Find tasks with `status: ready`.
2. Remove tasks whose dependencies/gate are not `done`.
3. Remove tasks with `status: deferred`; they are outside the active MVP.
4. Select lowest task ID in the dependency spine.
5. If multiple parallel tasks are explicitly allowed, assign disjoint file ownership.
6. If no task remains, stop with a blocker report; never invent a task.

## 3. Per-task loop

1. Create checkpoint: task ID, HEAD SHA, worktree status and planned files.
2. Mark task `in_progress` with agent/time.
3. Resolve all referenced BR and test IDs.
4. Activate/write failing tests first where practical.
5. Implement the smallest behavior that satisfies the task.
6. Run targeted tests.
7. Run affected module regression.
8. Run repository quality gates required at the current phase.
9. Create evidence folder with summary/tests/acceptance/risks.
10. Update docs/contracts/migrations/runbooks.
11. Review diff for secrets, unrelated edits and license contamination.
12. Commit one task using its ID.
13. Mark `review`; mark `done` only after acceptance/gate proof.
14. Re-evaluate next ready task from the ledger.

## 4. Repair policy

- Attempt scoped repairs for test/build failures.
- Preserve failing command, error and attempted fixes.
- After the same blocking condition repeats three times, stop and mark `blocked`.
- Never weaken an invariant, security control, golden output or acceptance criterion to obtain green status.
- Never silently skip a failing test.

## 5. Mandatory stop conditions

Stop when:

- owner/accountant decision is required;
- a tax/accounting policy is ambiguous;
- golden oracle conflicts with intended behavior;
- destructive/incompatible migration is required;
- license/security issue is unresolved;
- credentials or external authority are missing;
- production mutation/push/deploy was not explicitly authorized;
- scope would cross into a blocked task/phase;
- work belongs to Paperless file management, OCR/n8n orchestration or another deferred enterprise task;
- worktree changes overlap unknown user work;
- gate repair has failed three times.

## 6. Git and checkpoint policy

- Preserve unrelated changes.
- No reset/clean/history rewrite/force push.
- One logical task per commit.
- Commit message includes task ID.
- Record before/after SHA in evidence.
- A local commit is not a remote push; report separately.
- Do not push, publish image or deploy without explicit authorization and verified credentials.

## 7. Resumability

At the end of every task or interruption, update:

- `current_task` and task status in ledger;
- evidence path;
- last successful command/test suite;
- remaining acceptance items;
- blocker and required decision;
- local commit SHA;
- next suggested ready task.

Another Codex session must be able to resume using only repository files and Git state.

## 8. Overnight result report

Produce a concise summary:

- start/end SHA;
- completed/review/blocked tasks;
- current gate;
- tests passed/failed/skipped and commands;
- evidence paths;
- commits created;
- remote push/image/deploy state, only if verified;
- next ready task;
- owner/accountant decisions required.

## 9. What “complete” means

- A task is complete only when Definition of Done is satisfied.
- A phase is complete only when its gate passes.
- A product is not complete because code generation stopped.
- MVP release readiness requires exact-commit CI, healthy persistent Compose startup, verified `main` and immutable SHA images, and exact workbook-import reconciliation.
