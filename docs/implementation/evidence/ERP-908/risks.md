# ERP-908 risks

- Revealing a long-lived token in the browser is intentionally owner-triggered and increases the
  impact of a compromised authenticated browser session. The token should be copied once into an
  n8n Bearer credential and rotated if exposed outside the intended operator environment.
- Native development can read the existing `naai-erp-api-token` Keychain item only on macOS and only
  outside `NODE_ENV=production`; production containers cannot use this fallback.
- Example supplier, project, category and financial-account IDs are illustrative. n8n must resolve
  canonical organization-scoped IDs before mutation and must not guess relationships.
- `fundingSource` means an active company financial account. Owner-personal payment requires the
  canonical owner-current workflow and must not be represented as a company bank account.
