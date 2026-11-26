# ERP-961 — OWASP hardening: dependency upgrades, login throttling, security headers, SSRF

Upgraded Next/Fastify/NestJS/multipart/zod and pinned patched transitive packages (prod audit: 0 critical/high); added failed-login limiter, web/API security headers and a stricter webhook SSRF host blocklist.

See docs/security/owasp-review-2026-11.md and docs/runbooks/telegram-notifications.md where relevant.
