# ERP-335 Summary

Replaced the generic JSON-only console with operational admin screens for modules already backed by REST v1.

- Commercial documents and expenses now have friendly Vietnamese list, search, detail, create, allocation, review and lifecycle controls.
- Ledger/master data now expose journals, account management, resource browsing, Trial Balance and General Ledger.
- Evidence and inbound webhooks now expose upload, review, signed-download, inbox filtering/detail and explicit replay.
- Mobile navigation remains accessible through a horizontally scrollable icon menu.
- All mutations continue through REST v1 with bearer auth, organization scope, correlation IDs and idempotency keys.
