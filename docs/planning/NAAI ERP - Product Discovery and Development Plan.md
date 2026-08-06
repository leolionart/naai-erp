---
title: "NAAI ERP - Product Discovery and Development Plan"
doc_type: project-doc
project: "NAAI ERP"
status: archived
tags:
  - accounting
  - invoice
  - project-profitability
  - product-plan
created: 2026-08-05
sources:
  - https://github.com/frappe/erpnext
  - https://github.com/Dolibarr/dolibarr
  - https://github.com/bigcapitalhq/bigcapital
  - https://github.com/flash-oss/medici
  - https://github.com/kimai/kimai
  - https://github.com/metabase/metabase
---

# NAAI ERP

> **Historical discovery document.** The active product boundary and implementation source of truth is now [NAAI ERP - Sequential Coding Plan](./NAAI%20ERP%20-%20Sequential%20Coding%20Plan.md). The active MVP excludes OCR, source-file storage, document review workflows and broad enterprise ERP scope. Paperless-ngx stores source documents; n8n/OCR sends structured data to NAAI ERP through API/webhooks.

## Product Discovery and Development Plan cho NAAI Studio

> Trạng thái: Draft để review. Đây là kế hoạch sản phẩm và checklist vận hành, không thay thế tư vấn kế toán, thuế hoặc pháp lý. Các rule thuế và biểu mẫu phải được kế toán/đại lý thuế xác nhận trước khi áp dụng production.

## 1. Executive decision

Không nên tiếp tục tìm một repo ERP duy nhất rồi chỉnh sửa toàn bộ cho NAAI Studio. Các repo đã kiểm tra đều rơi vào một trong ba nhóm:

1. ERP đầy đủ nhưng nặng, khó vận hành và vẫn phải custom nhiều.
2. Accounting core tốt nhưng không hiểu economics của agency/project.
3. Project/timesheet tốt nhưng không có sổ cái kép và báo cáo tài chính.

Hướng đề xuất là phát triển một **management accounting system riêng cho service studio**, theo kiến trúc modular monolith, đồng thời tái sử dụng pattern hoặc tích hợp những dự án open-source đã trưởng thành.

Sản phẩm không nên tự nhận là phần mềm kê khai thuế Việt Nam ở giai đoạn đầu. Nó là nguồn dữ liệu quản trị và công cụ đối soát, có khả năng xuất dữ liệu cho kế toán.

## 2. Các câu hỏi sản phẩm phải trả lời được

Owner phải có thể trả lời trong vài phút:

1. Tháng này đã ghi nhận doanh thu, đã xuất hóa đơn và đã thu tiền bao nhiêu?
2. Cuối tháng dự kiến đạt bao nhiêu phần trăm mục tiêu?
3. Project, client hoặc service line nào đang lời/lỗ và nguyên nhân là gì?
4. Tổng chi phí có hóa đơn, không có hóa đơn và chưa đủ điều kiện thuế là bao nhiêu?
5. Công nợ nào sắp đến hạn hoặc đã quá hạn?
6. Tiền mặt hiện tại đủ vận hành bao nhiêu tháng?
7. Lỗ lũy kế đã tiêu hao bao nhiêu phần trăm vốn góp?
8. VAT đầu vào, VAT đầu ra và khoản dự kiến phải nộp đang chênh bao nhiêu?
9. Mỗi số trên dashboard có truy ngược được tới chứng từ, payment và journal entry hay không?

## 3. Định vị nghiệp vụ

Hệ thống phải tách riêng năm trạng thái dữ liệu:

- `booked`: giao dịch đã ghi nhận trong sổ quản trị.
- `tax_eligible`: giao dịch/chứng từ được đánh giá đủ điều kiện thuế.
- `cash_settled`: đã thực thu hoặc thực chi.
- `forecast`: số dự kiến, không trộn với actual.
- `statutory_export`: dữ liệu chuẩn bị xuất cho kế toán kiểm tra.

Ba trục doanh thu phải hiển thị song song:

- Revenue recognized: doanh thu được ghi nhận theo policy/milestone.
- Invoiced revenue: giá trị đã xuất hóa đơn.
- Collected cash: tiền khách hàng đã thanh toán.

Không được coi ba số này là một.

## 4. Benchmark open-source

| Repo                                                          | Điểm mạnh có thể học/tái sử dụng                                                           | Khoảng trống với NAAI Studio                                                         | Vai trò đề xuất                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| [ERPNext](https://github.com/frappe/erpnext)                  | Kế toán kép, invoices, journal, project, timesheet, project profitability, REST API        | Nặng; forecast và KPI agency cần custom; tax/e-invoice Việt Nam chưa turnkey         | Reference nghiệp vụ và phương án fallback ERP           |
| [Dolibarr](https://github.com/Dolibarr/dolibarr)              | Invoice, expense report, project/task/timesheet, margin, REST API và webhook trong core    | Dashboard quản trị, forecast, equity burn và localization Việt Nam còn thiếu         | Reference MVP nhẹ                                       |
| [Bigcapital](https://github.com/bigcapitalhq/bigcapital)      | Headless double-entry accounting, invoices, bills, expenses, P&L, Balance Sheet, Cash Flow | Project/timesheet backend và forecast chưa đủ tin cậy                                | Reference API và financial reports                      |
| [Odoo Community](https://github.com/odoo/odoo)                | Project, timesheet, analytic accounting và localization `l10n_vn`                          | Nhiều tính năng/report/API/webhook thuận tiện gắn với Enterprise hoặc cần custom sâu | Reference localization và analytic accounting           |
| [Frappe Books](https://github.com/frappe/books)               | UX kế toán gọn, double-entry và báo cáo cơ bản                                             | Desktop/offline, thiếu project economics và integration platform                     | Reference UX nhập liệu                                  |
| [Akaunting](https://github.com/akaunting/akaunting)           | UI SMB, invoices, bills, banking, REST API                                                 | BSL giới hạn production; nhiều chức năng sâu là app trả phí                          | Không chọn làm nền                                      |
| [Invoice Ninja](https://github.com/invoiceninja/invoiceninja) | Invoice, quote, payment, project/time tracking và client portal                            | Không phải general ledger/accounting source of truth                                 | Reference invoicing/client portal                       |
| [Kimai](https://github.com/kimai/kimai)                       | Timesheet, rate, team/project reporting và invoicing                                       | Không có accounting ledger                                                           | Reference time-costing workflow                         |
| [Solidtime](https://github.com/solidtime-io/solidtime)        | Time tracking hiện đại, project/member workflow                                            | Không có financial accounting                                                        | Reference timesheet UX                                  |
| [Medici](https://github.com/flash-oss/medici)                 | Library double-entry cho Node.js                                                           | Dùng MongoDB, không cung cấp ERP/reporting hoàn chỉnh                                | Reference invariant của ledger, không dùng nguyên trạng |
| [Metabase](https://github.com/metabase/metabase)              | BI/dashboard nhanh trên PostgreSQL                                                         | Không phải transaction system; metric governance phải nằm trong app                  | Embedded BI ở giai đoạn đầu                             |
| [Lago](https://github.com/getlago/lago)                       | Metering, billing API, usage-based billing                                                 | Quá thiên SaaS subscription; không giải quyết bookkeeping/project costs              | Reference recurring billing nếu phát sinh               |

### Extended component benchmark

Các dự án dưới đây không nhất thiết phù hợp để fork, nhưng cung cấp pattern đã được kiểm chứng:

| Repo                                                         | License / trạng thái khi kiểm tra           | Pattern đáng nghiên cứu                                            |
| ------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------ |
| [LedgerSMB](https://github.com/ledgersmb/LedgerSMB)          | GPL-2.0, active 2026-08                     | GL, AR/AP, invoice, tax, project và audit/reporting model          |
| [Tryton](https://github.com/tryton/tryton)                   | Hệ sinh thái module GPL-3.0, active 2026-08 | Module boundaries, document workflow, project/timesheet/budget     |
| [FrontAccounting](https://github.com/FrontAccountingERP/FA)  | GPL, active 2026                            | SME posting flow, accounting dimensions và budget reports          |
| [OpenProject](https://github.com/opf/openproject)            | GPL-3.0, active 2026-08                     | Project, milestone, work package, time tracking, API/webhook       |
| [Actual Budget](https://github.com/actualbudget/actual)      | MIT, active 2026-08                         | Budget target, rules, import/reconciliation và local-first UX      |
| [Firefly III](https://github.com/firefly-iii/firefly-iii)    | AGPL-3.0, active 2026-08                    | Transaction categorization, rules, imports, recurring và dashboard |
| [Kill Bill](https://github.com/killbill/killbill)            | Apache-2.0, active 2026-08                  | Billing state machine, retry, plugin, audit và event architecture  |
| [SolidInvoice](https://github.com/SolidInvoice/SolidInvoice) | MIT, active 2026-08                         | Quote/invoice/payment lifecycle, PDF/email UX                      |
| [Beancount](https://github.com/beancount/beancount)          | GPL-2.0                                     | Independent accounting oracle và reproducible ledger test fixtures |

Không trộn trực tiếp code từ nhiều repo GPL/AGPL vào core. Ưu tiên nghiên cứu pattern, clean-room implementation hoặc tích hợp qua API; mọi tái sử dụng code phải được review license riêng.

### Kết luận benchmark

- Không fork toàn bộ ERPNext/Odoo/Viet-ERP làm codebase chính.
- Có thể dùng ERPNext làm benchmark acceptance về accounting/project.
- Tự xây ledger trên PostgreSQL với posting rules rõ ràng; không sao chép một accounting library nhỏ mà không audit invariant.
- Dùng Metabase cho dashboard nội bộ ban đầu, nhưng số liệu phải đến từ read model do hệ thống kiểm soát.
- Có thể học UX time tracking từ Kimai/Solidtime và invoice/client portal từ Invoice Ninja.
- Dùng Beancount hoặc một independent ledger implementation làm test oracle cho các kỳ mẫu, thay vì chỉ test code bằng chính công thức của hệ thống.

## 5. Phạm vi chức năng

### 5.1 Organization and accounting setup

- Organization, fiscal year, fiscal period và base currency.
- Chart of Accounts quản trị, hỗ trợ mapping TT133 hoặc TT200 theo cấu hình đã được kế toán duyệt.
- Cost center: Design, Development, Project Management, Sales, Admin.
- Service line: Branding, Website Design, Website Development, Web App, Maintenance, Hosting/Retainer.
- Tax code versioned theo thời gian.
- Category mapping sang account, cost center, service line và tax treatment.

### 5.2 Client, supplier and commercial

- Client, supplier, freelancer và employee.
- Proposal/opportunity, contract, project và milestone.
- Sales invoice, purchase invoice, credit note.
- Payment term, AR/AP và aging.
- Một invoice hoặc expense có thể phân bổ cho nhiều project.

### 5.3 Expense and evidence

- Chi phí có hóa đơn.
- Chi phí không có hóa đơn/chứng từ VAT nhưng vẫn là chi phí quản trị.
- Employee reimbursement, freelancer payment, bank fee, online platform, overseas vendor và petty cash.
- Upload PDF, XML, ảnh, hợp đồng và bằng chứng thanh toán.
- Hash/fingerprint để phát hiện trùng.
- Trạng thái chứng từ: `missing`, `pending_review`, `management_valid`, `tax_eligible`, `tax_non_deductible`, `rejected`.
- Lưu lý do, người đánh giá và effective rule version.

### 5.4 Banking and reconciliation

- Bank account và cash account.
- Import CSV trước; bank API triển khai sau.
- Auto-match theo amount, date, reference và counterparty.
- Partial payment, payment fee và FX difference.
- Internal transfer không được tính thành revenue/expense.
- Manual match/unmatch đều phải có audit.

### 5.5 Double-entry ledger

- Journal Entry và Journal Line.
- Tổng debit phải bằng tổng credit trong cùng currency/base currency.
- Document được approve mới được post.
- Posted entry không sửa/xóa; chỉ reverse và repost.
- Period close/reopen có maker-checker và lý do.
- Posting rules versioned từ invoice, expense, payment, payroll và capital transaction.

### 5.6 Project economics

- Project budget, milestone và revenue recognition policy.
- Timesheet hoặc weekly allocation.
- Internal cost rate theo người/role và thời gian hiệu lực.
- Freelancer/vendor direct cost.
- Overhead allocation rule có version.
- Actual vs budget vs forecast.
- Margin theo project, client, account owner và service line.
- Scope change và overrun warning.

### 5.7 Planning and forecast

- Target theo tháng/quý/năm.
- Committed revenue từ contract/milestone.
- Weighted pipeline từ opportunity.
- Recurring maintenance/hosting revenue.
- Payroll và operating-expense forecast.
- Scenario: base, best, worst.
- Actual vs target, MoM, YoY và forecast variance.

### 5.8 Reports

- P&L.
- Balance Sheet.
- Direct Cash Flow; indirect Cash Flow ở phase sau.
- Trial Balance và General Ledger.
- AR/AP aging.
- Project/client/service-line profitability.
- VAT input/output reconciliation.
- Expense không đủ chứng từ hoặc không đủ điều kiện thuế.
- Equity burn, cash runway, ROS, ROE, ROA và ROI theo mục đích.
- Export CSV/XLSX cho kế toán.

## 6. Chỉ số và công thức

### Profitability

- `Gross Profit = Recognized Revenue - Direct Cost`
- `Gross Margin % = Gross Profit / Recognized Revenue × 100`
- `Operating Profit = Gross Profit - Operating Expenses`
- `ROS = Net Profit / Net Revenue × 100`
- `Project Margin % = (Project Revenue - Direct Project Cost - Allocated Overhead) / Project Revenue × 100`
- `Realized Hourly Rate = Project Revenue / Billable Hours`
- `Utilization = Billable Hours / Available Delivery Hours × 100`

### Equity and cash

- `Closing Equity = Opening Equity + Capital Contributions - Withdrawals/Dividends + Net Profit`
- `Accumulated Loss = max(0, -Retained Earnings)`
- `Equity Consumed % = Accumulated Loss / Paid-in Capital × 100`
- `Remaining Net Equity = Paid-in Capital + Other Equity + Retained Earnings`
- `Monthly Net Burn = Operating Cash Outflows - Operating Cash Inflows`
- `Runway Months = Unrestricted Cash / Average Monthly Net Burn`

### Forecast

- `Target Attainment = Actual Recognized Revenue / Monthly Target × 100`
- `Forecast Revenue = Actual-to-date + Committed Milestones + Weighted Pipeline`
- `Weighted Pipeline = Σ Amount × Probability × Expected-in-period factor`
- `MoM Growth = (Current Month - Previous Month) / Previous Month × 100`
- `YoY Growth = (Current Month - Same Month Prior Year) / Same Month Prior Year × 100`

### ROI

Không có một ROI chung:

- Project ROI dùng direct cost/investment của project.
- Marketing ROI dùng incremental gross profit, không chỉ revenue.
- ROE dùng average equity.
- ROA dùng average total assets.

## 7. Data model cấp cao

### Master data

`organizations`, `fiscal_periods`, `currencies`, `exchange_rates`, `accounts`, `tax_codes`, `cost_centers`, `service_lines`, `categories`, `parties`, `users`, `roles`.

### Commercial and projects

`opportunities`, `contracts`, `projects`, `project_members`, `milestones`, `timesheets`, `cost_rates`, `project_budgets`, `allocations`, `revenue_targets`.

### Financial documents

`sales_invoices`, `sales_invoice_lines`, `purchase_invoices`, `purchase_invoice_lines`, `expenses`, `expense_lines`, `credit_notes`, `payments`, `bank_accounts`, `bank_transactions`, `reconciliations`, `attachments`, `evidence_reviews`.

### Accounting and planning

`journal_entries`, `journal_lines`, `posting_rules`, `period_closures`, `opening_balances`, `budget_versions`, `forecast_versions`, `forecast_lines`.

### Integration and audit

`integration_sources`, `api_keys`, `inbox_events`, `outbox_events`, `webhook_endpoints`, `webhook_deliveries`, `idempotency_keys`, `audit_logs`.

Mọi transaction line nên có dimensions: project, client, cost center, service line, tax code và category.

## 8. Webhook and event design

### Inbound flow

1. Client gọi endpoint nghiệp vụ hoặc `POST /v1/inbound-events`.
2. Xác thực HMAC/API key và timestamp.
3. Kiểm tra `Idempotency-Key`, `external_id` và fingerprint.
4. Lưu raw payload vào inbox.
5. Validate schema và mapping.
6. Tạo document ở `draft` hoặc `needs_review`.
7. Approver duyệt document.
8. Posting engine tạo journal trong cùng database transaction.
9. Outbox worker phát event và cập nhật reporting projection.

Yêu cầu: at-least-once delivery, idempotent consumer, exponential retry, dead-letter queue, replay có audit và chống replay attack.

Không cho webhook thường tạo journal line tùy ý.

### Core events

- `sales_invoice.approved|posted|voided`
- `purchase_invoice.approved|posted|voided`
- `expense.approved|rejected|posted`
- `payment.received|paid|reconciled`
- `bank_transaction.imported|reconciled`
- `project.milestone.completed`
- `forecast.updated`
- `period.closed|reopened`

## 9. Technical architecture

### Recommended stack

- Frontend: Next.js, TypeScript, shadcn/ui.
- Backend: NestJS modular monolith.
- Database: PostgreSQL.
- ORM: Prisma/Drizzle cho CRUD; SQL transaction rõ ràng cho ledger/reporting.
- Queue: Redis + BullMQ.
- Object storage: S3-compatible/MinIO.
- Reporting: materialized views + Metabase embedded trong giai đoạn đầu.
- Auth: Auth.js, Keycloak hoặc Supabase Auth tùy hạ tầng triển khai.
- Observability: OpenTelemetry, Sentry, Prometheus/Grafana.
- Deployment: Docker Compose trước; managed PostgreSQL hoặc backup/PITR bắt buộc.

Kiến trúc là **modular monolith + transactional outbox**, không dùng microservices sớm.

### Modules trong monolith

```text
identity
organization
commercial
projects
documents
expenses
banking
ledger
planning
reporting
integrations
audit
```

## 10. Security and accounting controls

- RBAC: Owner, Finance Admin, Accountant, Project Manager, Approver, Viewer, Integration.
- Maker-checker cho approve, post, void và close period.
- API key scope theo action/resource.
- Append-only audit log.
- Journal posted không update/delete.
- Attachment hash, malware scan và signed URL.
- Encryption in transit/at rest.
- Backup, PITR và restore drill.
- Period lock.
- Secrets không lưu plaintext.
- Export tài chính phải ghi audit.

## 11. Vietnam accounting and tax boundary

Hệ thống phải hỗ trợ lưu và đối soát, nhưng không tự kết luận pháp lý nếu chưa được kế toán xác nhận:

- VAT đầu vào/đầu ra theo kỳ tháng hoặc quý.
- Expense deductible/non-deductible cho TNDN.
- Hóa đơn điện tử: phát hành, điều chỉnh, thay thế, hủy/sai sót theo lifecycle của provider và quy định hiện hành.
- Thanh toán cho nhà cung cấp/freelancer/nhà thầu nước ngoài cần tax flags riêng.
- Mapping BCTC theo TT133 hoặc TT200.
- Hồ sơ năm: P&L/KQKD, Balance Sheet, Cash Flow nếu áp dụng, notes/export support.
- Evidence retention và full audit trail.

Các deadline, mẫu biểu, ngưỡng, điều kiện khấu trừ và policy phải versioned/configurable; không hard-code như chân lý vĩnh viễn.

## 12. Development roadmap

### Phase 0 — Discovery and accounting design, 2–3 tuần

- Phỏng vấn owner và kế toán.
- Chốt TT133/TT200, kỳ VAT và revenue-recognition policy.
- Chuẩn hóa Chart of Accounts, category, service line và cost center.
- Thu thập dữ liệu mẫu 12–24 tháng.
- Chọn 2–3 kỳ đã khóa sổ làm acceptance dataset.
- Viết posting-rule specification và acceptance tests trước UI.

**Exit:** Có accounting blueprint được owner và kế toán duyệt.

### Phase 1 — Financial foundation MVP, 5–7 tuần

- Parties, categories, projects.
- Sales/purchase invoice.
- Expense có/không hóa đơn và evidence.
- Bank CSV import và reconciliation cơ bản.
- Double-entry ledger, trial balance, P&L và Balance Sheet.
- Inbound API/webhook, idempotency và audit.
- CSV/XLSX export cho kế toán.

**Exit:** Một kỳ mẫu đối soát được với kế toán; mọi chênh lệch được giải thích.

### Phase 2 — Agency profitability, 4–6 tuần

- Contract, milestone và revenue recognition.
- Timesheet/weekly allocation và cost rate.
- Direct cost và overhead allocation.
- Project/client/service-line profitability.
- AR/AP aging, gross margin, ROS và utilization.

**Exit:** Xác định được project lời/lỗ và drill-down tới nguồn dữ liệu.

### Phase 3 — Planning and executive dashboard, 3–5 tuần

- Target và forecast versions.
- Weighted pipeline và scenarios.
- Actual/budget/forecast, MoM và YoY.
- Equity burn, runway, ROI/ROE/ROA.
- Alert margin thấp, overdue và cash shortfall.

**Exit:** Owner có thể dùng dashboard cho monthly business review.

### Phase 4 — Automation and Vietnam integrations, 4–8+ tuần

- Paperless-ngx/OCR.
- E-invoice provider connector.
- Bank feed.
- Payroll/timesheet integrations.
- VAT reconciliation nâng cao.
- Scheduled closing checklist và automated approvals.

## 13. Initial estimate

### Một developer full-time có hỗ trợ AI

- MVP tài chính usable: khoảng 10–14 tuần, chưa tính thời gian chờ kế toán/data cleanup.
- Đủ project profitability và executive dashboard: khoảng 17–25 tuần.
- Vietnam integrations có thể thêm 4–8+ tuần tùy provider và chất lượng API.

### Team 2 developers + part-time designer/QA

- MVP tài chính: khoảng 7–10 tuần.
- Scope đến hết Phase 3: khoảng 13–18 tuần.

Estimate chỉ có ý nghĩa sau Phase 0 và sau khi audit dữ liệu thực tế.

## 14. MVP non-goals

- Full payroll/BHXH engine.
- Tự nộp tờ khai thuế.
- Full CRM hoặc HRM.
- Inventory/MRP.
- Multi-country tax engine.
- OCR AI tự quyết định accounting/tax treatment không cần người duyệt.
- Microservices hoặc Kubernetes.

## 15. Required discovery data

NAAI Studio cần chuẩn bị:

- Loại hình doanh nghiệp và chế độ kế toán TT133/TT200.
- Phương pháp VAT và kỳ khai tháng/quý.
- Chart of Accounts/sổ kế toán hiện dùng.
- BCTC, trial balance hoặc sổ cái 12–24 tháng gần nhất.
- Danh sách sales invoice, purchase invoice, expense và bank statement.
- Danh sách client, project, contract, milestone và payment status.
- Payroll/freelancer cost data và cách muốn phân bổ chi phí nhân sự.
- Vốn góp, khoản chủ sở hữu đã góp/rút và retained earnings/lỗ lũy kế.
- Danh mục chi phí có hóa đơn, không có hóa đơn, vendor nước ngoài.
- Provider hóa đơn điện tử, ngân hàng và phần mềm kế toán đang dùng.
- Revenue target và pipeline hiện có.

Thông tin nhạy cảm có thể anonymize khi dùng làm development fixture.

## 16. Acceptance criteria của MVP

1. Tổng debit bằng tổng credit cho mọi posted journal.
2. Trial Balance cân bằng.
3. P&L của kỳ mẫu đối soát được với số kế toán.
4. Balance Sheet thỏa `Assets = Liabilities + Equity`.
5. Không tạo trùng khi webhook/import được gửi lại.
6. Mọi dashboard metric drill-down được tới transaction và evidence.
7. Posted transaction chỉ được reversal, không bị sửa lịch sử.
8. Phân biệt rõ recognized, invoiced và collected.
9. Chi phí quản trị và tax eligibility là hai trạng thái độc lập.
10. Project margin có thể xem trước và sau overhead allocation.

## 17. Các quyết định cần owner và kế toán chốt

1. Dùng TT133 hay TT200?
2. Kỳ khai VAT hiện tại là tháng hay quý?
3. Revenue recognition theo milestone acceptance, completion percentage hay invoice date?
4. Team có log timesheet thật hay dùng weekly allocation?
5. Internal cost rate dùng gross salary, fully-loaded cost hay blended rate?
6. Overhead phân bổ theo giờ công, doanh thu hay headcount?
7. Software kế toán/tax hiện tại là nguồn chính nào?
8. Provider hóa đơn điện tử và khả năng API/webhook?
9. Dữ liệu nào được phép lưu local/cloud?
10. Cần single-company nội bộ hay multi-tenant product?

## 18. Khuyến nghị bước tiếp theo

Không bắt đầu bằng scaffold code. Bước kế tiếp nên là **Phase 0 accounting blueprint**:

1. Thu thập bộ dữ liệu thật đã anonymize.
2. Workshop 90 phút với owner và kế toán.
3. Chốt policy và posting rules.
4. Tạo screen inventory và API contract MVP.
5. Dựng prototype dashboard bằng dữ liệu tĩnh đã đối soát.
6. Sau khi số liệu mẫu đúng mới scaffold codebase production.

Điều này giảm rủi ro xây một dashboard đẹp nhưng cho ra số không thể giải thích hoặc không khớp với sổ kế toán.
