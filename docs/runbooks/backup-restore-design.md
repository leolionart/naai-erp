# Backup and Restore Design

## Scope

- PostgreSQL database.
- S3-compatible evidence objects and version metadata.
- Deployment release manifest and migration version.
- Runtime configuration inventory without secret values.

## Baseline

- Encrypted scheduled database backups with defined retention.
- Object storage versioning/backup appropriate to the provider.
- Backup metadata records time, schema version, release digest and checksum.
- Restore occurs into an isolated target before production use.

## Restore verification

1. Restore database and evidence objects.
2. Verify migration/schema version.
3. Verify evidence metadata/object checksums.
4. Run Trial Balance and financial control totals when available.
5. Run API readiness and smoke tests.
6. Record duration, exceptions and approval in evidence.

Exact scripts, retention and RPO/RTO are finalized with Docker/production infrastructure tasks.
