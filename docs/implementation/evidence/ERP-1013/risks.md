# ERP-1013 — Risks & Follow-ups

- Existing inbound webhook sources configured with environment-variable `secretRef` names (such as `PAPERLESS_WEBHOOK_SECRET`) remain 100% supported alongside new AES-256-GCM `sealed:` secrets; operators may rotate any legacy source to a managed secret via `POST /integration-sources/:id/rotate-secret` or the Web UI at their convenience.
- Production deployments require `SESSION_SECRET` (≥32 characters, already mandatory for Web/API login sessions and Telegram bot encryption) when issuing or verifying `sealed:` webhook signing secrets.
