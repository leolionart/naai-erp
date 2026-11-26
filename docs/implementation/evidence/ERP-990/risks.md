# ERP-990 Risks & Safeguards

## Accounting & Security Safeguards Verified

1. **Zero secret disclosure (`BR-SEC-002`)**: `GET /integration-sources` and `GET /api-credentials` project metadata only (`id`, `name`, `actorId`, `roles`, `secretRef`, `status`, `autoRecord`, `version`), never `token_hash` or resolved environment secrets.
2. **Savepoint atomicity (`BR-LED-001`, `BR-LED-002`)**: When an ingested draft fails any recording check (closed/soft-locked period, missing evidence, inactive posting/counter account, missing sales contract coverage), `ROLLBACK TO SAVEPOINT` undoes any intermediate tax-default updates before persisting `draft_reasons` on the clean draft row.
3. **Controlled-mode maker-checker preserved (`BR-WFL-001`, `BR-WFL-002`)**: `attemptAutoRecordExpenseOnClient` and `attemptAutoRecordDocumentOnClient` check `operatingMode === 'solopreneur'` inside the database transaction; switching an organization to `controlled` immediately disables auto-recording without mutating integration source records.
4. **Notification deduplication (`BR-NOTIFY-003`)**: Auto-recorded items emit only the posted outbox event (`expense.posted` / `${type}.${finalState}`), preventing duplicate draft + posted Telegram notifications.

## Remaining Operational Notes

- Migration `0079_integration_auto_record_and_draft_reasons.sql` uses additive `ADD COLUMN IF NOT EXISTS ... DEFAULT ...` DDL and is online-safe for existing production data (`auto_record` defaults to `false` for all existing tokens and webhook sources until explicitly enabled by an owner or finance admin).
