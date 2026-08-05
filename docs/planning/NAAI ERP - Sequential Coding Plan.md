---
title: "NAAI ERP - Sequential Coding Plan"
doc_type: project-doc
project: "NAAI ERP"
status: active
tags:
  - coding-plan
  - accounting
  - docker-compose
  - github-actions
  - ghcr
created: 2026-08-05
sources:
  - "NAAI ERP - Product Discovery and Development Plan.md"
---

# NAAI ERP - Sequential Coding Plan

> Đây là tài liệu điều phối implementation. Agent/developer phải thực hiện task theo dependency và acceptance gate, không nhảy thẳng sang dashboard hoặc tính năng business khi accounting kernel chưa được chứng minh đúng.

## 1. Cách sử dụng plan

1. Đọc theo thứ tự bắt buộc trong `AGENTS.md`: coding plan, business rules, test specification, overnight runbook và task ledger.
2. Chỉ lấy task có trạng thái `ready` và tất cả dependency đã `done`.
3. Trước khi code, tạo hoặc cập nhật ADR/spec được task yêu cầu.
4. Implement trong phạm vi task ID; không gộp scope của phase sau.
5. Chạy test và lưu evidence theo acceptance criteria.
6. Chuyển task qua `review`; chỉ mark `done` sau khi gate tương ứng đạt.
7. Nếu phát hiện thay đổi accounting policy, dừng task và cập nhật blueprint/ADR trước.
8. Business feature chỉ hoàn tất khi có API/CLI machine-readable contract, authorization và audit behavior; database/UI riêng lẻ là chưa đủ.

Trạng thái hợp lệ:

- `blocked`: thiếu input hoặc dependency.
- `ready`: đủ điều kiện bắt đầu.
- `in_progress`: đang thực hiện.
- `review`: đã code, đang verify/review.
- `done`: acceptance criteria và evidence đầy đủ.

## 2. Fixed decisions và guardrails

- Greenfield modular monolith.
- PostgreSQL là source of truth.
- REST/OpenAPI trước; async worker dùng transactional outbox.
- AI-native: mọi feature có versioned REST/OpenAPI và first-party CLI; UI không bao giờ là interface duy nhất.
- AI/service identities chịu organization scope, RBAC, audit, idempotency và cùng accounting invariants như người dùng.
- Suggested stack: pnpm monorepo, TypeScript, NestJS/Fastify, Next.js, PostgreSQL, Redis/BullMQ, S3-compatible storage.
- Mọi quyết định stack quan trọng phải được ghi ADR trước khi scaffold.
- Tách riêng `booked`, `tax_eligible`, `cash_settled`, `forecast`, `statutory_export`.
- Tách riêng recognized revenue, invoiced revenue và collected cash.
- Posted journal là immutable; chỉ reverse/repost.
- Debit luôn bằng credit.
- Closed period từ chối posting nếu không reopen đúng quyền và audit.
- Mọi mutation tài chính phải có organization scope, RBAC, audit và idempotency.
- Sản phẩm là management accounting + accountant export, không tự nhận là phần mềm kê khai thuế Việt Nam được chứng nhận.
- Không copy code GPL/AGPL vào core nếu chưa có license review.

## 3. Target repository layout

```text
naai-erp/
├── apps/
│   ├── web/
│   │   ├── Dockerfile
│   │   └── .dockerignore
│   ├── api/
│   │   ├── Dockerfile
│   │   └── .dockerignore
│   └── worker/
├── packages/
│   ├── domain/
│   ├── database/
│   ├── contracts/
│   ├── config/
│   ├── observability/
│   └── test-fixtures/
├── db/
│   ├── migrations/
│   └── seed/
├── deploy/
│   ├── compose.yaml
│   ├── compose.dev.yaml
│   ├── compose.prod.yaml
│   ├── compose.observability.yaml
│   ├── env/.env.example
│   ├── scripts/migrate.sh
│   ├── scripts/backup-db.sh
│   ├── scripts/restore-db.sh
│   ├── scripts/smoke-test.sh
│   └── README.md
├── docs/
│   ├── architecture/
│   ├── product/
│   ├── api/
│   └── runbooks/
├── .github/workflows/
│   ├── ci.yml
│   ├── release-images.yml
│   ├── security.yml
│   └── deploy.yml
├── docker-bake.hcl
├── pnpm-workspace.yaml
├── Makefile
└── README.md
```

## 4. Dependency spine

```text
P0 Foundation
  → P1 Master Data
  → P2 Accounting Kernel
  → P3 Documents and Webhooks
  → P4 Banking and AR/AP
  → P5 Project Economics
  → P6 Forecast and Reporting
  → P7 UX and Production Hardening
  → P8 Packaging and Release
  → P9 Migration and Go-live
```

Infrastructure research, fixture preparation và UI shell có thể song song. Không business module nào được bypass Gate G2 của accounting kernel.

## 5. P0 — Repository and architecture foundation

### ERP-000 — Project organization

- Objective: chuẩn hóa tên `NAAI ERP` và liên kết discovery/coding plan.
- Deliverables: folder project, discovery doc, coding plan, decision log.
- Dependencies: none.
- Acceptance: mọi metadata dùng `project: NAAI ERP`; không còn active path tên cũ.

### ERP-001 — Create repository and monorepo

- Objective: tạo GitHub repo và skeleton theo target layout.
- Deliverables: apps/packages/deploy/docs, workspace config, README.
- Dependencies: ERP-000.
- Tests: clean clone install; workspace dependency graph hợp lệ.
- Acceptance: `pnpm install --frozen-lockfile` và baseline commands chạy được.

### ERP-002 — Architecture Decision Records

- ADR-001 stack và modular monolith.
- ADR-002 organization isolation và auth.
- ADR-003 accounting invariants.
- ADR-004 transaction/outbox/idempotency.
- ADR-005 storage/evidence.
- ADR-006 reporting/read models.
- ADR-007 license policy.
- Dependencies: ERP-001.
- Acceptance: ADR được review trước khi tạo domain schema.

### ERP-003 — Engineering toolchain

- Lint, format, typecheck, unit test, integration test.
- Environment validation và `.env.example`.
- Migration CLI, local seed và test fixtures.
- Pre-commit/commit convention.
- Acceptance: CI baseline green; không có secret trong repo.

### ERP-004 — Security and operations baseline

- RBAC roles, organization scoping, audit schema.
- Threat model, secret policy, backup/restore design.
- Health/live/readiness contract.
- Acceptance: security checklist và restore approach được duyệt.

### Gate G0

- Clean clone boot thành công.
- CI green.
- Migration empty database chạy được.
- Health/readiness hoạt động.
- ADR và threat model được duyệt.

## 6. P1 — Platform and master data

### ERP-100 — Organization, identity and fiscal setup

- Organization, membership, roles.
- Fiscal years/periods, base currency và exchange rates.
- Org isolation tests bắt buộc.

### ERP-110 — Chart of Accounts and tax codes

- Account hierarchy và account type.
- Mapping TT133/TT200 configurable.
- Tax code có effective date; không hard-code policy vĩnh viễn.
- Import/export reference data.

### ERP-120 — Dimensions and mappings

- Cost centers, service lines và categories.
- Default account/tax/project mapping.
- Versioned mapping và audit.

### ERP-130 — Parties and commercial references

- Client, supplier, freelancer, employee.
- Project, contract và milestone master data.

### ERP-140 — AI-native master data API and CLI

- Versioned REST/OpenAPI for organization, fiscal setup, accounts, tax codes, dimensions, mappings, parties, projects, contracts and milestones.
- First-party `naai-erp` CLI using the REST API with JSON-default output.
- Cursor pagination, filters, organization-scoped auth, correlation IDs, optimistic versions and structured errors.
- Idempotent create/update/deactivate commands and audit/next-action metadata.
- Bulk import/export dry-run contract for reference data.

### Gate G1

- Tenant/org isolation pass.
- Maker-checker permissions pass.
- Reference-data import/export pass.
- Mọi mutation master data có audit.
- Master data is readable/writable through API and CLI without direct database access.

## 7. P2 — Accounting kernel

### ERP-200 — Journal aggregate and balanced posting

- Journal Entry, Journal Line và dimensions.
- Balanced transaction constraint.
- Monetary rounding/currency policy.
- Database transaction và concurrency tests.

### ERP-210 — Posting rule engine

- Rule versions và effective dates.
- Mapping document lines sang journal lines.
- Project/client/cost-center/service-line/tax dimensions.

### ERP-220 — Accounting workflow

- Draft → approve → post → reverse/repost.
- Posted records không update/delete.
- Approval separation theo role.

### ERP-230 — Period close/reopen

- Close period, reason, approver và audit.
- Reject backdated posting.
- Reopen cần quyền riêng và event log.

### ERP-240 — Core ledger reports

- Trial Balance.
- General Ledger.
- Opening balance import.
- Reconciliation với golden fixtures.

### Gate G2

- Property test `debit = credit`.
- Reversal net effect bằng zero.
- Idempotency và concurrent posting pass.
- Posted record không thể mutate.
- Closed-period enforcement pass.
- Golden dataset khớp independent oracle/manual accountant fixture, không còn chênh lệch không giải thích.

## 8. P3 — Documents, expenses and integrations

### ERP-300 — Sales and purchase documents

- Sales Invoice, Purchase Invoice, Credit Note.
- Allocation một line cho nhiều project/dimension.
- Status và payment terms.

### ERP-310 — Expense workflow

- Expense có và không có hóa đơn.
- Reimbursement, freelancer, bank fee, platform, overseas vendor và petty cash.
- Management validity độc lập với tax eligibility.

### ERP-320 — Evidence management

- PDF/XML/image upload.
- Hash/fingerprint, duplicate detection.
- Review status, reason, reviewer và timestamp.
- Authorized signed download.

### ERP-330 — Inbound API and webhooks

- HMAC/API key, timestamp và replay protection.
- Schema version, `external_id`, `Idempotency-Key`.
- Inbox, quarantine, retry/replay và dead-letter.
- Invalid payload không tạo business document.

### ERP-340 — Outbound event delivery

- Transactional outbox.
- Retry/backoff, delivery log và dead-letter.
- Event contract versioning.

### Gate G3

- Mỗi document approved sinh journal đúng fixture.
- Gửi lại webhook không tạo duplicate.
- Invalid payload được quarantine.
- Attachment authorization pass.
- Drill-down document → payment → journal → evidence đầy đủ.

## 9. P4 — Banking, cash and AR/AP

### ERP-400 — Bank and cash accounts

- Bank/cash accounts và CSV import adapters.
- Import fingerprint và duplicate prevention.

### ERP-410 — Reconciliation

- Match amount/date/reference/party.
- Partial payment, fee và FX difference.
- Manual override có audit.

### ERP-420 — Internal transfers

- Transfer giữa account không tính revenue/expense.
- Match/unmatch có kiểm soát.

### ERP-430 — AR/AP aging

- Due/overdue buckets.
- Collection/payment status.
- Control accounts tie về ledger.

### Gate G4

- Sample bank statement reconcile hoàn toàn hoặc có exception được giải thích.
- Cash, AR và AP tie về ledger.
- Partial/FX/fee/internal-transfer tests pass.

## 10. P5 — Project economics

### ERP-500 — Timesheet and cost rates

- Timesheet hoặc weekly allocation.
- Internal cost rates có effective date.
- Billable/available hours.

### ERP-510 — Direct costs

- Freelancer/vendor/tool cost allocation.
- Project-specific và shared costs.

### ERP-520 — Budget and revenue recognition

- Project budget, milestone và scope changes.
- Policy recognized/invoiced/collected riêng biệt.

### ERP-530 — Overhead allocation

- Versioned rules: hours, revenue hoặc headcount.
- Xem margin trước và sau overhead.

### ERP-540 — Profitability reports

- Project/client/service-line/account-owner margin.
- Realized hourly rate, utilization và overrun alerts.

### Gate G5

- Project totals tie về GL dimensions.
- Independent project-margin fixture khớp.
- Thay rate/allocation version không rewrite lịch sử đã post.

## 11. P6 — Planning and management reporting

### ERP-600 — Targets and forecast versions

- Monthly/quarterly/yearly targets.
- Base/best/worst scenarios.

### ERP-610 — Revenue and expense forecast

- Committed milestones, weighted pipeline và recurring revenue.
- Payroll/OPEX forecast.

### ERP-620 — Performance comparisons

- Actual vs target.
- MoM, YoY và forecast variance.
- Null/zero denominator policy.

### ERP-630 — Financial statements

- P&L, Balance Sheet và direct Cash Flow.
- VAT input/output reconciliation.
- Tax-ineligible/missing-evidence expenses.

### ERP-640 — Executive metrics

- Accumulated loss và Equity Consumed %.
- Runway và net burn.
- ROS, ROE, ROA và purpose-specific ROI.
- Mỗi metric lưu formula version, period và dimensions.

### ERP-650 — Accountant export and snapshots

- CSV/XLSX export.
- Reproducible report snapshot theo ledger version.
- Export action có audit.

### Gate G6

- Financial statements tie Trial Balance.
- Balance Sheet thỏa Assets = Liabilities + Equity.
- Ba revenue axes hiển thị riêng.
- Timezone/fiscal cutoff tests pass.
- Snapshot tái tạo được cùng kết quả.

## 12. P7 — UX and production hardening

### ERP-700 — Dashboard and drill-down

- Executive dashboard.
- Project profitability và finance review queues.
- Mỗi card drill-down tới source transaction/evidence.

### ERP-710 — Onboarding and error operations

- Setup wizard, import mapping.
- Review/quarantine/replay UI.
- User-readable errors và remediation.

### ERP-720 — Observability

- Structured logs, correlation ID, metrics và traces.
- Alerting và baseline SLOs.

### ERP-730 — Security hardening

- OWASP review, rate limiting và dependency scans.
- Encryption, retention và access audit.

### ERP-740 — Quality and resilience

- Performance, accessibility và responsive QA.
- Backup và restore drill.

### Gate G7

- Critical E2E pass.
- Không còn unresolved Critical/High security findings nếu chưa có exception phê duyệt.
- p95 targets đạt.
- Restore drill thành công.
- Owner/accountant UAT sign-off.

## 13. P8 — Docker packaging, CI/CD and releases

### ERP-800 — Production Dockerfiles

- Multi-stage `deps/build/runtime`.
- Frozen lockfile và deterministic build.
- Minimal pinned base image; verify native modules trước khi dùng Alpine.
- Runtime chỉ có compiled output và production dependencies.
- Non-root UID/GID; read-only root filesystem nếu khả thi.
- Không đưa secrets vào ARG/ENV layer.
- OCI labels: source, revision, version, created và license.
- Build `linux/amd64` trước; thêm arm64 sau compatibility tests.

### ERP-810 — Docker Compose contract

Canonical services:

- `postgres`: named volume, internal network, `pg_isready`, không expose port trong prod.
- `redis`: internal only, auth và healthcheck.
- `api`, `web`, `worker`; optional `scheduler`.
- `migrate`: one-shot service dùng đúng API image và command migration.
- Local `minio` chỉ qua dev/tools profile; production dùng S3-compatible storage.

Compose requirements:

- `compose.dev.yaml`: bind mount/hot reload/debug ports.
- `compose.prod.yaml`: chỉ pull GHCR images, không build/mount source.
- Health endpoints: API `/health/live`, `/health/ready`; web `/health`; worker heartbeat.
- `restart: unless-stopped`, `init: true`, graceful stop và log rotation.
- Drop capabilities, không mount Docker socket.
- Mandatory secrets dùng `${VAR:?required}` hoặc Docker secrets.
- Deploy sequence chạy `docker compose run --rm migrate` một lần trước app rollout.
- Fresh host start bằng documented command và `.env`.

Image variables:

```text
ghcr.io/<owner>/naai-erp-api:${IMAGE_TAG}
ghcr.io/<owner>/naai-erp-web:${IMAGE_TAG}
ghcr.io/<owner>/naai-erp-worker:${IMAGE_TAG}
```

Worker có thể dùng chung API image với command khác nếu code/runtime giống nhau.

### ERP-820 — Pull request CI

`.github/workflows/ci.yml` chạy trên PR và main:

1. Checkout và setup pinned Node/pnpm.
2. Frozen install + cache.
3. Format, lint, typecheck và unit tests.
4. Start test PostgreSQL/Redis.
5. Migrate empty DB và integration tests.
6. Validate Compose config.
7. Build images bằng Buildx và smoke test containers.
8. Schema drift/migration safety checks.
9. Secret, dependency và source scans.

Branch protection bắt buộc CI pass trước merge; không direct push tùy tiện vào main.

### ERP-830 — Main image release

`.github/workflows/release-images.yml` trigger khi push/merge vào `main`:

- Build một lần từ commit đã pass CI.
- Push GHCR image tags:
  - `main`
  - `sha-<12-char-git-sha>` — immutable identity cho deploy/rollback.
  - `main-YYYYMMDD.<run_number>`.
- Generate SPDX/CycloneDX SBOM.
- Scan image digest bằng Trivy/Grype.
- Generate provenance/attestation.
- Sign digest bằng Cosign OIDC và verify signature.
- Lưu manifest gồm image digest, Git SHA và migration version.
- Không auto-deploy production chỉ vì main build thành công.

Workflow permissions tối thiểu:

- `contents: read`
- `packages: write`
- `id-token: write`
- `attestations: write`
- `security-events: write`

### ERP-840 — Semantic release images

Khi push Git tag `vX.Y.Z`:

- Publish immutable tags `X.Y.Z`, `X.Y`, `X` và optional `stable`.
- Không overwrite semver tags.
- Create GitHub Release với changelog, migration notes, checksums, SBOM và digest manifest.
- Production Compose pin version/digest, không dùng `latest` hoặc moving `main`.

### ERP-850 — Deploy and rollback workflow

- GitHub Environments: staging và production.
- Production có required reviewer và protected secrets.
- `deploy.yml` bắt đầu bằng `workflow_dispatch`, nhận environment + immutable tag/digest.
- Preflight: verify signature, compose config, DB connectivity, disk và backup state.
- Acquire deploy lock.
- Encrypted DB backup.
- Run migrations.
- `docker compose up -d --remove-orphans`.
- Wait readiness và smoke tests.
- Save release manifest.
- Rollback app bằng previous image digest.
- Database dùng expand/contract migrations; image rollback không được coi là DB rollback.
- Nếu migration không compatible, dùng explicit forward-fix/down migration hoặc restore backup đã test.

### Gate G8

- Fresh host deploy chỉ bằng Compose/env và published images.
- Empty DB migrate thành công và services healthy.
- Main push tạo signed/scanned GHCR images cùng immutable SHA tags, SBOM và provenance.
- `compose.prod.yaml` không cần source checkout/build.
- Digest readback khớp release manifest.
- Upgrade và rollback rehearsal thành công.
- Không secret xuất hiện trong git, image history, log, SBOM hoặc artifact.

## 14. P9 — Migration and go-live

### ERP-900 — Import inventory and templates

- Opening balances, parties, projects, invoices, expenses, payments và bank history.
- Mapping rules, validation và reject format.

### ERP-910 — Dry-run import

- Duplicate keys, reject report và control totals.
- Accountant review/sign-off.

### ERP-920 — Parallel run

- Chạy song song 1–2 kỳ đã khóa.
- Reconcile Trial Balance, P&L, Balance Sheet, cash, AR/AP và project margins.

### ERP-930 — Pilot and cutover

- Owner/accountant pilot.
- Freeze window, final backup/import và control totals.

### ERP-940 — Hypercare

- Monitoring, incident ownership và rollback decision.
- Archive source imports và signed reconciliation evidence.

### Gate G9

- Không còn variance không giải thích.
- Opening balance journal được duyệt.
- Owner và accountant phê duyệt go-live.
- Release manifest, backup và rollback target được lưu.

## 15. Required test matrix

- Unit: domain rules, formulas và state machines.
- Property: balanced entries, reversal net-zero, allocation sums và idempotency.
- Integration: database constraints/transactions, queue/outbox, storage và migrations.
- Contract: OpenAPI/webhook schema versions và backward compatibility.
- E2E: invoice → approval → posting → payment → reconcile → report.
- E2E: expense không hóa đơn và tax review.
- E2E: reversal, period close, project margin và forecast.
- Golden accounting fixtures + independent oracle.
- Organization isolation và security tests.
- Performance tests.
- Backup/restore và Compose smoke tests.

## 16. Definition of Done cho mọi task

- Scope và acceptance criteria hoàn thành.
- Code được review.
- Lint/typecheck/tests pass.
- Migration có forward/rollback compatibility strategy.
- OpenAPI/schema/docs được cập nhật.
- RBAC, audit, idempotency và observability được xử lý nếu liên quan.
- Không có secret hoặc source license không được phép.
- Docker build vẫn thành công.
- User-facing flow có E2E evidence.
- Task liên kết commit/PR/test evidence.
- Phase chỉ `done` khi gate tương ứng đạt.

## 17. Release policy

- `main` luôn deployable nhưng không đồng nghĩa tự động production deploy.
- Mỗi main build có immutable `sha-*` image.
- Production chỉ deploy immutable semver hoặc digest.
- Moving tags `main`/`stable` chỉ để thuận tiện, không dùng làm rollback identity.
- Migration phải backward-compatible theo expand/contract.
- Giữ tối thiểu 3–5 release manifests và backup tương ứng.
- Mọi deploy production cần approval và smoke-test readback.

## 18. First execution queue

Thứ tự bắt đầu sau khi plan được duyệt:

1. `ERP-001` — Create GitHub repository and monorepo.
2. `ERP-002` — Write ADRs.
3. `ERP-003` — Toolchain and CI baseline.
4. `ERP-004` — Security/operations baseline.
5. Verify Gate G0.
6. Chỉ sau G0 mới bắt đầu `ERP-100`.

Không scaffold accounting tables trước khi ADR-003 và accounting blueprint được duyệt.
