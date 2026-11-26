# ERP-988 — Risks and Follow-ups

- **Database migrations**: None required; existing `business_categories`, `expense_categories`, `expense_lines`, and `commercial_document_lines` schemas and triggers support canonical metadata corrections.
- **Follow-ups**:
  - `ERP-989` builds one-click draft recording (`POST .../record` and batch `POST /drafts/record`) on top of these edit/error foundations.
  - `ERP-991` converts the real-UI Playwright verification harness into CI Playwright specs against a scratch PostgreSQL database.
