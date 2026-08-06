# ERP-720 Tests

- Backend service tests: 14/14 passed.
- Backend commercial, expense and inbound PostgreSQL integrations: 8/8 passed.
- Web unit tests: 25/25 passed.
- Full Playwright suite: 67/67 passed.
- Desktop and mobile coverage includes the narrowed menu, customer/project profiles, invoice and expense routes, AR/AP, financial reports, dashboard, performance, project profitability and accountant exports.
- Hydration coverage verifies protected requests wait for the session credential instead of issuing an initial unauthenticated request.
- CORS bootstrap/config tests verify the native web origin, credentials, allowed methods and authorization/content-type headers.
- Real-browser smoke verified 14 customers, 29 projects, 41 invoices and 200 expenses.
- VIOD drill-down verified receivables of `81,585,000` VND.
- Commercial document date readback verified stable `YYYY-MM-DD` serialization.
- Web production build passed with `/customers`, `/projects`, invoice and expense routes.
- Repository lint and TypeScript checks passed.

Final SHA and exact-commit CI proof remain pending until the implementation commit is pushed.
