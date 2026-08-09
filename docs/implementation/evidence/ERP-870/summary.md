# ERP-870 summary

Implemented organization-scoped customer service subscription management across domain, database,
REST/OpenAPI, first-party CLI, portable data packages and the web application.

Delivered:

- reusable service-plan catalog with exact pricing, recurrence and deactivation;
- customer subscriptions linked to an active client, service plan and optional matching project;
- audited and idempotent draft edits plus typed activate, pause, resume, cancel and expire actions;
- deterministic accounting-neutral schedule preview;
- `/subscriptions` workspace with canonical selectors, filters, lifecycle dialogs and responsive UI;
- AI relationship documentation and portable export/edit/import support through canonical services.

Subscription schedules do not create invoices, revenue, receivables, cash or ledger entries.
