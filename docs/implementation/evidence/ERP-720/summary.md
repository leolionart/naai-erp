# ERP-720 Summary

Delivered the narrowed invoice-management MVP while retaining the business relationships required for receivables: Customers, Projects, Invoices, Non-invoice Expenses, AR, AP and Reports remain available in the menu. Dedicated invoice and expense list/new/detail routes use stable URLs, real draft `PATCH` editing, lifecycle dialogs, optional Paperless source information and linked accounting references.

The local development runtime now waits for credential hydration before protected web requests, avoiding transient initial `401` responses. The `naai` tenant can hydrate its local development credential automatically, and CORS explicitly permits the native web origin without using a wildcard.

Real-browser verification against the imported NAAI data showed 14 customers, 29 projects, 41 sales invoices and 200 non-invoice expenses. The VIOD customer/project relationship drills through to receivables of `81,585,000` VND. Commercial document dates remain stable API/UI date-only values in `YYYY-MM-DD` format.

The final implementation SHA and exact-commit CI proof remain pending.
