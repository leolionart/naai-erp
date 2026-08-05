# ERP-340 Risks

- DNS rebinding cannot be fully prevented by URL validation alone; production deployment must also restrict worker egress and resolve/validate destination IPs at connection time.
- Delivery is intentionally at least once, so consumers must deduplicate by `X-NAAI-Event-Id`.
- Response bodies are truncated for evidence; endpoint payload logging and retention need later security/operations policy review.
