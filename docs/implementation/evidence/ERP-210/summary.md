# ERP-210 Summary

Implemented the versioned posting-rule engine.

- Effective-dated rule selection is organization/document scoped and deterministic by specificity, date, version and ID.
- Source lines map to exact balanced journal drafts and disclose the applied rule ID/version.
- Required project/client/cost-center/service-line/tax dimensions are enforced.
- Manual posting policy distinguishes ordinary, elevated and blocked control accounts.
- PostgreSQL stores append-oriented rule versions with effective dates, conditions and line templates.
- AI-native REST/OpenAPI and CLI expose rule-version CRUD and a side-effect-free evaluate operation.

Start commit: `b718806d4fb3b6d490a2b06fa9cf57d7b39a1fa7`.
