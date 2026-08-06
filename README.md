# NAAI ERP

Invoice/expense data and financial reporting system for NAAI Studio.

Canonical repository: https://github.com/leolionart/naai-erp

## Current status

The accounting/reporting foundation through ERP-700 is complete. The active narrow MVP has four remaining tasks: Paperless-linked ingestion, focused invoice/expense UI, clean-install report setup, and Docker release with real-data import.

## Local development preview (no Docker build)

Use the pinned Node 22 runtime, install dependencies and start the web/API development servers directly:

```sh
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm install --frozen-lockfile
pnpm dev:preview
```

- Web preview: http://localhost:3000
- Web health: http://localhost:3000/health
- API live: http://localhost:3001/health/live
- API ready: http://localhost:3001/health/ready

The current preview does not require a database. Features that persist data will require a PostgreSQL `DATABASE_URL`, but still run as native development processes; production Docker image builds belong to Gate G8.

## AI-native API and CLI

The canonical machine interface is REST under:

```text
/api/v1/organizations/:organizationId/master-data/:resource
```

The first-party CLI calls that API and emits JSON by default:

```sh
export NAAI_ERP_TOKEN="<scoped API credential>"
export NAAI_ERP_ORGANIZATION="org-naai"
pnpm cli -- parties list
pnpm cli -- parties create --data '{"data":{"id":"party-1","display_name":"Client","status":"active"}}'
```

Supported resource families and operations are documented in [OpenAPI v1](./docs/api/openapi-v1.json) and the [AI-native interface contract](./docs/api/ai-native-interface-contract.md). The CLI never connects directly to PostgreSQL.

## Documentation

- [Sequential Coding Plan](./docs/planning/NAAI%20ERP%20-%20Sequential%20Coding%20Plan.md)
- [Product Discovery and Development Plan](./docs/planning/NAAI%20ERP%20-%20Product%20Discovery%20and%20Development%20Plan.md)
- [Business Rules Catalog](./docs/product/business-rules.md)
- [Executable Test Specification](./docs/testing/test-specification.md)
- [Overnight Codex Runbook](./docs/agent/overnight-runbook.md)
- [Machine-readable Task Ledger](./docs/implementation/task-ledger.yaml)

The sequential coding plan is the implementation source of truth. Historical enterprise scope is deferred unless the owner explicitly reactivates it.
