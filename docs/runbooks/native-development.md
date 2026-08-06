# Native Development Setup Guide (Dockerless)

This runbook documents the reproducible native-development database workflow using Homebrew PostgreSQL 16 on localhost.

## Prerequisites

- macOS (Intel or Apple Silicon)
- Node.js >= 22
- pnpm >= 10
- Homebrew

## 1. Install PostgreSQL 16

Install PostgreSQL 16 using Homebrew:

```bash
brew install postgresql@16
```

Ensure it is added to your path. The setup script will automatically search for it in your environment path and standard Homebrew directories:

- Apple Silicon: `/opt/homebrew/opt/postgresql@16/bin/pg_config`
- Intel: `/usr/local/opt/postgresql@16/bin/pg_config`

## 2. Environment Configuration

Before setting up, configure your local environment variables. Create a `.env` file in the project root if it does not already exist, and define your developer token:

```env
# Required for creating your local owner API credential
NAAI_ERP_TOKEN=your-secure-development-token
```

> [!IMPORTANT]
> The setup script reads `NAAI_ERP_TOKEN` to insert a local API credential with the `owner` role. Never hardcode tokens in the codebase.
> If the setup script runs and a local owner API credential already exists in the database, and `NAAI_ERP_TOKEN` is not provided, the script will preserve the existing credential.

### Configurable Environment Variables

The setup and status scripts support customization via the following environment variables (with safe developer defaults):

| Environment Variable | Description                                                                      | Default Value                   |
| :------------------- | :------------------------------------------------------------------------------- | :------------------------------ |
| `NAAI_ERP_TOKEN`     | Developer token used to generate or update the local owner API credential.       | _None (Required for new setup)_ |
| `NAAI_DB_ROLE`       | The PostgreSQL login role/username to create and configure (strictly validated). | `naai_erp`                      |
| `NAAI_DB_PASSWORD`   | The password for the PostgreSQL role (safely escaped/encoded).                   | `naai_erp`                      |
| `NAAI_DB_NAME`       | The PostgreSQL database name (strictly validated).                               | `naai_erp`                      |
| `NAAI_ORG_ID`        | The organization ID for database seeding and API credential.                     | `naai`                          |
| `NAAI_CREDENTIAL_ID` | The unique ID of the generated local API credential.                             | `local-owner-cred-id`           |
| `NAAI_ACTOR_ID`      | The unique actor ID associated with the API credential.                          | `local-owner-actor`             |

> [!NOTE]
> Database role and name identifiers must strictly match `/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/` to prevent injection and syntax errors.
> Passwords containing quotes, semicolons, and other special characters are safely escaped and handled. They are passed directly via stdin to prevent leakage in command arguments and processes.

## 3. Database Setup

Run the automated setup script to detect PostgreSQL 16, start the service, create the database and role idempotently, run migrations, and seed default TT133 statutory mappings for fiscal years 2025 and 2026:

```bash
pnpm db:native-setup
```

This command executes the following steps:

1. Detects Homebrew PostgreSQL 16.
2. Starts the PostgreSQL service via `brew services` if it is offline.
3. Idempotently creates the configured role (e.g., `naai_erp`) with password and the database.
4. Performs a preflight check: verifies that `NAAI_ERP_TOKEN` is provided, or that a local owner API credential already exists in the database. If neither is true, setup fails immediately _before_ migrations or seeding run.
5. Executes the database migrations (`drizzle-kit migrate`).
6. Seeds the TT133 accounting structure for both **2025** and **2026**.
7. Idempotently ensures the configured actor user (`NAAI_ACTOR_ID` / default: `local-owner-actor`) exists in the `users` table, maps them to the seeded organization in `organization_memberships`, and grants them the `owner` role in `membership_roles` (immediately after TT133 seeding and before configuring the API credential).
8. Creates a local owner API credential using the `NAAI_ERP_TOKEN` environment variable. If no token is provided but a credential already exists, it is preserved.

> [!NOTE]
> The script will print an explicit notification stating:
> `Loading environment variables from .env file: ...`
> followed by a list of loaded keys. This prevents silent loads of secret values. Raw credentials and tokens are never printed in logs or error messages.

## 4. Check Database Status

To verify the database, connection status, migrations, and owner credentials without performing any mutation on the database, run the strictly read-only status command:

```bash
pnpm db:native-status
```

This command will output:

- PostgreSQL installation details and service running status.
- Database and role existence checks.
- Migration status (count of files on disk vs applied migrations).
- Actor user existence, organization membership, and owner role check.
- Status of the owner API credential (active/mismatched/not found) by checking database existence and validating it against `NAAI_ERP_TOKEN` if provided, without exposing any secrets in logs.

> [!IMPORTANT]
> The status command returns a failure exit code (exit 1) if any of the checks fail, including:
>
> - PostgreSQL is offline or not installed.
> - The database role or database name does not exist.
> - Database connection fails.
> - There is a migration mismatch.
> - The actor user, organization membership, or owner role configuration is incomplete.
> - The owner API credential is missing or mismatched.

## 5. Starting API and Web Applications

Once the setup is successful, you can start the development servers with the `DATABASE_URL` pointing to your local PostgreSQL instance.

Copy `apps/web/.env.example` to the ignored `apps/web/.env.local` and set the same local token used by `NAAI_ERP_TOKEN`. The development web app then opens tenant `naai` with its local credential automatically; no manual browser storage setup is required. This public client-side fallback is enabled only by a development build and must never be used for a deployed environment.

Define your connection URL:

```env
DATABASE_URL=postgresql://naai_erp:naai_erp@localhost:5432/naai_erp
```

Start the application services:

```bash
# Start all services (API, Web, Worker) in dev mode
DATABASE_URL=postgresql://naai_erp:naai_erp@localhost:5432/naai_erp pnpm dev

# Or start only the Web and API services
DATABASE_URL=postgresql://naai_erp:naai_erp@localhost:5432/naai_erp pnpm dev:preview
```
