# ERP-853 summary

Added an owner-authorized, idempotent API and first-party CLI workflow for restoring a Full ERP Data Package into an explicitly empty organization. Restore runs in one API-managed PostgreSQL transaction, preserves target authentication/bootstrap identity, maps confirmed source actors to the authenticated target actor, and restores canonical master, business, ledger, and bank rows.

Credentials, secrets, replay/package controls, outbound delivery state, and Paperless-owned evidence/binary tables are excluded.
