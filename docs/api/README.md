# API Contracts & Machine-Readable Interfaces

- [OpenAPI v1 Spec (`openapi-v1.json`)](./openapi-v1.json) - Full machine-readable API specification.
- [REST API and CRUD Coverage](./resource-coverage.md) - Human-readable endpoint families, CRUD/lifecycle matrix, CLI parity, and known gaps.
- [AI Data Relationships and Ingestion Guide](./data-relationships-and-ingestion.md) - Canonical lookup, dependency, ID propagation, lifecycle, correction, and end-to-end input recipes.
- [Data Relationship Manifest v1](./data-relationship-manifest-v1.json) - Machine-readable resource dependency DAG, reference fields, identities, stages, and recipes.
- [Cash-heavy Business Ingestion Guide](./cash-heavy-business-ingestion.md) - Output/input invoices, cashbook, petty cash, bank-to-cash transfer, owner movements, advances and unsupported workflow boundaries.
- [ERP Data Package v1](./portable-organization-data-package.md) - Complete XLSX plus manifest export, dry-run diff, dependency-safe import and reconciliation contract.
- [Accounting List Workbook Exports](./accounting-list-exports.md) - Filtered sales-invoice and purchase-invoice/expense XLSX contracts with CLI examples.
- [AI-Native Interface Contract](./ai-native-interface-contract.md) - Standardized REST and CLI interaction rules for automated/AI actors.
- [Inbound Webhooks Specification (v1)](./inbound-webhooks-v1.md) - Signature, payload, and retry protocol for incoming external events.
- [Outbound Events Specification (v1)](./outbound-events-v1.md) - Transactional outbox event catalog and delivery guarantees.
- [Health & Readiness Contract](./health-contract.md) - Container liveness and readiness probe contracts.
