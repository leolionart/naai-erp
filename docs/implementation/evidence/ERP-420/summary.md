# ERP-420 summary

- Task: ERP-420 — Internal transfers
- Start commit: `e544d67c941c06d5ba38b711b9a537cc635ccc59`
- Rule: BR-BNK-003
- Tests: T-BNK-003, T-INT-ERP-420-002, T-DOMAIN-ERP-420-003, T-CONTRACT-ERP-420-004

Implemented as a dedicated internal-transfer aggregate rather than a commercial payment reconciliation. Transfer principal posts only between organization-owned bank and transfer-transit asset accounts; embedded and separate-transaction fees remain explicit accounting lines and are never inferred from an amount mismatch.

The implementation supports one-sided pending transit, explainable candidate scoring, controlled pairing, immutable attempts/events, organization-scoped transaction claims, balanced direct or transit posting, and reasoned unmatch through reversal journals. Separate fee transactions are claimed, reversed and reset together with principal legs.

Human workflows use a queue route plus dedicated detail route. Headless consumers use the same versioned REST/OpenAPI, capability discovery and CLI contracts without exposing AI-specific controls or branding in the interface.
