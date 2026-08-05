# ERP-300 Risks and Follow-ups

- ERP-310 will add the durable expense and tax-review workflow; ERP-300 currently requires a reviewed tax-state snapshot on tax-bearing purchase allocations before posting.
- ERP-320 will add evidence objects/hashes and signed access; purchase duplicate control currently uses supplier/document reference uniqueness.
- ERP-330 will add external IDs, signed inbound webhooks, replay protection and quarantine around the same document API.
- Payment allocation and derived partially-paid/paid states remain intentionally deferred to banking/reconciliation work; invoice issue/post does not create cash.
- Posting accounts are validated organization-owned inputs in this slice; richer rule-version linkage will be extended as document mapping policy matures.
