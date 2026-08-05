# ERP-001 Risks and Follow-ups

- Full linting currently uses TypeScript validation as a baseline; ESLint/format/security tooling belongs to ERP-003.
- Database migration tooling is intentionally not selected before ERP-002 ADRs.
- Dockerfiles and Compose runtime are intentionally deferred to ERP-800+.
- Current interactive shell defaults to Node 26; repository pins Node 22 and verification used installed Node v22.21.1.
- GitHub repository, branch protection and remote CI must be verified separately after the first push.
