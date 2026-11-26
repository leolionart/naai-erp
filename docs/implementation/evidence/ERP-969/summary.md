# ERP-969

Reported: records added through the API were missing from the activity log and Telegram did not notify.

Root causes found in code: the inbound webhook route (n8n) is not organization-scoped so it was never written to the activity timeline and a quarantined payload creates no record; Telegram only notified on posted journals while API ingestion creates drafts; delivery failures (e.g. worker without SESSION_SECRET) were invisible.

Changes: `inbound` source in the unified timeline; Telegram notifies drafts (setting, migration 0071); settings page shows delivery health; runbook troubleshooting.
