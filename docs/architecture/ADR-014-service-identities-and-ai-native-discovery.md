# ADR-014: Isolated Service Identities, One-Time Secret Issuance and AI-Native Discovery

- Status: Accepted
- Date: 2026-11-28
- Task: ERP-1013
- Rules: BR-AI-001, BR-AI-002, BR-AI-007, BR-UI-008

## Context

Prior iterations blurred human browser sessions, machine credentials, and developer API documentation in three ways:

1. **Session-Credential Conflation**: `/auth/automation-token` unsealed the human owner's browser login cookie and revealed the root owner credential for external automation use, conflicting with dedicated `api_credentials` service identities, collapsing audit attribution onto the owner, and preventing per-integration revocation.
2. **Incomplete Self-Service Credential Lifecycle**: `api_credentials` supported listing and toggling `autoRecord`, but lacked self-service creation, secret rotation, and revocation; meanwhile `integration_sources` required operators to type server environment variable names (`secretRef`) instead of issuing managed signing secrets.
3. **Static cURL Walls vs Machine-Native Discovery**: Embedding hundreds of lines of static cURL and JavaScript templates in the Web UI burdened business owners with developer prose while providing no value to AI agents, which discover schemas and capabilities programmatically via `/api/v1/capabilities`, `/api/v1/openapi.json`, and `naai-erp discovery`.

## Decision

1. **Strict Separation of Human Sessions and Service Identities**:
   - Browser login sessions remain `HttpOnly` cookie-bound human sessions and never disclose underlying credentials to browser scripts or clipboard endpoints (`/auth/automation-token` is retired with HTTP `410 Gone`).
   - External tools (AI agents, CLI profiles, n8n workflows) authenticate exclusively with dedicated non-owner **Service Keys** (`api_credentials`, roles restricted to `accountant`, `finance_admin`, `approver`, `viewer`), preserving distinct `actorId` audit trails, per-key `autoRecord` controls, rotation, and instant revocation without affecting human login. Internal owner session rows (`isOwnerCredential`) cannot be mutated, rotated, or revoked through integration-key endpoints.

2. **One-Time Secret Issuance for Service Keys and Webhooks**:
   - `POST /api-credentials` and `POST /api-credentials/:id/rotate` generate cryptographically random `naai_sk_...` tokens, persist only SHA-256 `token_hash` values, redact secrets from audit and idempotency replay records, and return `secretToken` once at issuance.
   - `POST /integration-sources` and `POST /integration-sources/:id/rotate-secret` generate `naai_whsec_...` HMAC signing secrets when `secretRef` is omitted, store them sealed with AES-256-GCM (`sealed:v1...`), never disclose ciphertext on `GET` reads, and return `signingSecret` once at issuance while keeping legacy environment-variable `secretRef` bindings compatible.

3. **Machine-Native Discovery Surface**:
   - `/settings/automation` manages Service Keys, Inbound Webhooks, and a concise machine-discovery card pointing AI agents and automations to `/api/v1/capabilities`, `/api/v1/openapi.json`, and `naai-erp discovery`, removing hardcoded business cURL templates from the Web UI bundle.

## Consequences

- Every AI agent, CLI installation, and webhook integration operates under its own revocable, least-privilege identity with accurate audit attribution.
- Business owners configure integrations self-service without touching server environment variables or exposing root owner credentials.
