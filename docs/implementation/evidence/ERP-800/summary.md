# ERP-800 Summary

Implemented organization-scoped workbook review staging and a SaaS-style admin review queue. Every real business row now has a durable database record with source coordinates, raw evidence, proposed mapping, review flags, status, version and audit metadata.

The real `naai` import now contains 399 review rows. The original 288 business rows remain: 29 projects, 41 sales rows, 214 expense rows and 4 owner/personal movements. Mapping v3 additionally retains 111 source-control/master rows: 28 debt controls, 12 profitability controls, 12 planning controls, 42 bonus controls, 3 payroll-master rows and 14 expense-category controls. Of these, 345 remain `pending_review` and 54 are already tied to posted canonical data.

Mapping v3 retains every source column for project, sales and expense review evidence, including cash/actual receipt, invoice state, Paperless invoice link, funding source, department, project workload and source metadata. Payroll staging excludes phone, identity number, birthday and email. Duplicate Paperless references are flagged rather than attached automatically.

The UI at `/imports/review` uses the shared navigation, cards, filter toolbar, table, badges, selects and a focused drawer. Corrections use labeled party/project selectors or normal inputs; raw source fields remain read-only. Posted accounting history remains immutable.

The operating-dashboard API now exposes the 111 control/master rows through an organization-scoped `sourceControls` read model marked `unconfirmed_non_canonical`. Profitability, planning, debt, expense-category, payroll and bonus values are available for charts and drill-down without being mixed into canonical journals, AR/AP, bank reconciliation or revenue recognition.

Canonical invoiced performance facts were backfilled through the versioned API for 41 posted sales documents (402,371,725 VND total). The dashboard defaults to the latest workbook period with data and the `invoiced` basis, renders an exact-value 12-month chart, and explicitly reports unavailable executive metrics instead of substituting demo values. Dynamic financial-statement route periods now drive their API requests.

The revenue trend now uses the shadcn/Recharts interactive Area Chart with exact-value tooltip,
all/6/3-month filtering, screen-reader value summary and responsive rendering. Recharts remains behind
the existing dashboard dynamic import so non-chart content is not blocked by the chart bundle.

The controlled expense-to-purchase-invoice migration CLI links each replacement to an exact legacy
expense and date, creates the purchase invoice through the REST lifecycle, reverses the original
journal through the normal journal API, then posts the replacement. Dry-run performs no mutation.
