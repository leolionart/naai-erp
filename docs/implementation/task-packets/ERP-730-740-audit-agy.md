---
title: "ERP-730 and ERP-740 release audit Antigravity packet"
doc_type: implementation-task
project: NAAI ERP
status: active
tags: [erp-730, erp-740, audit, seed, docker]
---

# ERP-730/740 read-only audit

Audit the current uncommitted TT133 seed and Docker/Compose packaging in `/Volumes/DATA/Coding Projects/NAAI ERP`.

Do not edit files, install packages, generate evidence, update the ledger, commit or push.

Verify:

1. Fresh PostgreSQL migrations plus opt-in TT133 seed run twice idempotently.
2. Seeded organization can load P&L, Balance Sheet, direct Cash Flow and VAT reports without missing mappings.
3. Seed data respects schema constraints and does not weaken production safety.
4. All Docker images build non-root and the Compose stack is healthy and persistent.
5. Compose defaults point to the actual GitHub owner/repository and immutable SHA deployment is documented.
6. Secrets are required or safely handled; no insecure production defaults.
7. Identify anything still missing for main-branch GHCR release images and exact-commit verification.

Run read-only checks and report concrete high/medium findings with file/line evidence. Do not claim completion from indirect evidence.
