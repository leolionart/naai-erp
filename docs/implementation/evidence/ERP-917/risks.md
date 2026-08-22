# ERP-917 risks and follow-ups

- The 30-day default is an operational safety default; deployments may choose a longer period, but
  retention must never be applied to immutable financial or audit evidence.
- High-volume installations should monitor activity-row counts and cleanup latency; bounded batches
  intentionally trade immediate deletion for database safety.
- Error summaries must remain useful after redaction. If a provider payload is needed for support,
  retain a separately authorized evidence artifact rather than expanding log contents.
