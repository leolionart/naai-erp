# ERP-906 risks and follow-ups

- Retention runs best-effort after a successful export. A transient pruning failure does not corrupt
  or fail the newly generated workbook; the next successful export retries retention.
- Existing blobs are pruned when a new export is generated. Installations that stop generating
  exports do not need pruning because their blob population is no longer growing.
- `VACUUM FULL` and `pg_repack` remain maintenance-window operations. ERP-906 provides diagnostics
  and guardrails but does not silently lock or rewrite production tables.
- Watchtower may still refresh individual `latest` application containers, but it cannot run an
  already-exited one-shot migrate service. Production updates must use `pnpm prod:update`.
