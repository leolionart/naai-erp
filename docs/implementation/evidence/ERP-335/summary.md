# ERP-335 Summary

Replaced the generic JSON-only console with operational admin screens for modules already backed by REST v1.

- Commercial documents and expenses now have friendly Vietnamese list, search, detail, create, allocation, review and lifecycle controls.
- Ledger/master data now expose journals, account management, resource browsing, Trial Balance and General Ledger.
- Evidence and inbound webhooks now expose upload, review, signed-download, inbox filtering/detail and explicit replay.
- Mobile navigation remains accessible through a horizontally scrollable icon menu.
- All mutations continue through REST v1 with bearer auth, organization scope, correlation IDs and idempotency keys.

Verified implementation commit: `7922cd6d42eff7e7fce303f8401eb6f7a992b586`.
Exact-commit CI: https://github.com/leolionart/naai-erp/actions/runs/30998376669
