# NAAI ERP: workflow tổng thể và use flow

Tài liệu này là bản đồ nghiệp vụ dành cho người dùng, người tích hợp và AI. `docs/product/business-rules.md` vẫn là nguồn chuẩn cho từng quy tắc; tài liệu này giải thích cách các quy tắc nối thành một quy trình hoàn chỉnh trong hệ thống.

## 1. Nguyên tắc chung của mọi workflow

```text
Xác định organization → đọc capability/RBAC → tra cứu ID chuẩn
→ tạo/cập nhật draft (idempotency + correlation ID)
→ kiểm tra evidence, dimension, tax và kỳ kế toán
→ submit/approve theo operating mode
→ post/settle/reconcile bằng command canonical
→ read model/report + audit/outbox → theo dõi background activity
```

- Web, REST/OpenAPI, CLI và AI gọi cùng application service; không ghi PostgreSQL trực tiếp.
- `controlled` giữ maker-checker. `solopreneur` cho owner hoàn tất các bước được phép trong một thao tác, nhưng không bỏ RBAC, idempotency, audit, khóa kỳ, kiểm tra cân bằng hay lịch sử bất biến.
- `draft → approved → posted → reversed` là vòng đời tài chính; posted không sửa/xóa trực tiếp.
- Mọi bước cần `organizationId`, stable ID và version hiện tại. Retry dùng idempotency key; liên kết giữa các bước dùng correlation ID.
- Báo cáo chỉ đọc từ posted/read model. Cảnh báo quản trị, khả năng khấu trừ VAT/CIT và trạng thái kế toán là các trục độc lập.
- Customer/supplier, project, category và mô tả nghiệp vụ đều có thể sửa từ một thao tác trên UI
  hoặc một request API. Backend tự match dữ liệu chuẩn và chọn update draft hay reverse/replacement;
  người dùng không phải gọi nhiều API để tự dàn dựng correction.

## 2. Use flow theo nghiệp vụ

### 2.1 Khách hàng → dự án → doanh thu

1. Với input đầy đủ, tạo party và gán role `client`; với input tối giản, dùng một lần gọi
   `commercial-documents/sales-invoice-ingestion` (CLI: `quick-sales-invoices create`) để backend
   tự match hoặc tạo customer, gán role và tạo chứng từ. Giữ lại các ID trả về.
2. Tạo project với `client_party_id`, service line và dimension.
3. Tạo service plan/subscription bằng `customerPartyId`, `servicePlanId`, tùy chọn `projectId`.
4. Khi có nghĩa vụ doanh thu, tạo commercial document hoặc revenue-recognition event; không đoán liên kết theo tên/số tiền.
5. Kiểm tra posting rule, VAT/evidence và kỳ; owner solopreneur có thể **Lưu và ghi nhận** nếu đủ điều kiện.
6. Đọc dashboard, revenue position, AR aging và P&L; thu tiền qua customer receipt rồi reconcile với bank transaction.

Tham chiếu: `docs/api/data-relationships-and-ingestion.md` (customer/project/subscription), BR-AR, BR-REV, BR-LED, BR-WFL.

### 2.2 Nhà cung cấp → hóa đơn mua/chi phí → VAT/CIT

1. Tra cứu hoặc tạo supplier party và role `supplier` theo tax ID chuẩn hóa.
2. Với hóa đơn mua, dùng một lần gọi `commercial-documents/purchase-invoice-ingestion` (CLI:
   `quick-purchase-invoices create`); chi phí không hóa đơn dùng expense endpoint, không tạo bản
   ghi trùng. Không cần gọi riêng API để tạo supplier/role nếu dùng quick path.
3. Gắn category, project/cost center, Paperless reference và evidence. Nếu VAT chưa có chứng cứ, ghi gross cost, VAT deductible = 0, tax eligibility = `unreviewed`.
4. Dry-run/validate payload; lỗi trả field errors, không tạo hiệu ứng một phần.
5. Submit/approve/post theo policy; thanh toán từ bank/cash hoặc owner-current; reconcile sau khi import sao kê.
6. Báo cáo quản trị cập nhật ngay khi canonical input hợp lệ ở solopreneur; VAT/CIT vẫn hiển thị eligibility riêng.

Tham chiếu: `docs/api/cash-heavy-business-ingestion.md`, `docs/api/data-relationships-and-ingestion.md`, BR-EXP, BR-TAX, BR-AP.

### 2.3 Ngân hàng, tiền mặt và công nợ

1. Tạo account và import giao dịch với external identity/idempotency.
2. Chạy suggest/candidate matching; người có quyền xác nhận match, ignore hoặc mark-needs-review.
3. Giao dịch chuyển khoản nội bộ đi qua internal-transfer workflow; không ghi doanh thu/chi phí.
4. Customer receipt/payment và supplier payment cập nhật công nợ; reconcile khóa kết quả đã xác nhận.
5. Cuối kỳ kiểm tra control totals, ngoại lệ và đóng statement/fiscal period.

Tham chiếu: `docs/api/resource-coverage.md`, `docs/api/cash-heavy-business-ingestion.md`, BR-BNK, BR-REC, BR-AR-002, BR-AP-002.

### 2.4 Dự án, timesheet, overhead và lợi nhuận

1. Tạo project/budget/version; dùng timesheet và cost rate để ghi nhận chi phí trực tiếp.
2. Chi phí chung vào overhead pool/policy; chạy allocation, kiểm tra tổng phân bổ 100% và residual.
3. Ghi nhận milestone/revenue theo recognition policy; correction dùng reverse/replacement.
4. Đọc project profitability, margin, budget variance và forecast; không nhân đôi source document khi phân bổ.

Tham chiếu: `docs/api/data-relationships-and-ingestion.md`, BR-DIM, BR-TIM, BR-CST, BR-ALLOC, BR-REV.

### 2.5 Báo cáo và dự báo

1. Chọn period (MTD/YTD/full year), report API đọc posted ledger/read models.
2. Drill-down từ dashboard → report → source document/journal; không cộng recognition và invoiced revenue thành một số.
3. Thiếu mapping/evidence tạo warning hoặc trạng thái eligibility, không làm trống toàn bộ báo cáo.
4. Target/forecast/scenario/composition là lớp quản trị, không tự tạo journal.

Tham chiếu: `docs/architecture/ADR-006-reporting-and-read-models.md`, `docs/api/resource-coverage.md`, BR-RPT, BR-WFL-003.

### 2.6 Import, tích hợp và AI

```text
inventory → dry-run (planHash) → commit (If-Match + idempotency)
→ reconciliation → lưu response IDs/nextActions
```

- Paperless giữ file nguồn; n8n/OCR chuẩn hóa và retry; ERP nhận payload có cấu trúc, không có ingestion-review/replay inbox riêng.
- Webhook cần signature, external identity, version và retry an toàn. Outbox được ghi cùng transaction với mutation; worker giao hàng có bounded retry.
- AI phải lookup parent resources trước, chỉ dùng IDs trả về, tôn trọng nextActions và dừng khi workflow canonical chưa tồn tại.

Tham chiếu: `docs/api/inbound-webhooks-v1.md`, `docs/api/outbound-events-v1.md`, `docs/api/portable-organization-data-package.md`, `docs/api/ai-native-interface-contract.md`.

### 2.7 Vận hành và quan sát

- Migration chạy trước app; backup/restore, health/readiness và release dùng runbook tương ứng.
- `settings/background-activities` hiển thị worker/outbox/maintenance activity theo organization, cursor, trạng thái, correlation ID và lỗi đã redact.
- Log vận hành mặc định giữ 30 ngày; cleanup theo batch chỉ xóa operational rows, không xóa journal, source document, resource audit hoặc immutable outbox history.
- Sự cố được truy từ correlation ID → activity log → request/job/outbox → audit/source; không dùng log thay cho audit kế toán.

Tham chiếu: `docs/runbooks/docker-compose-release.md`, `docs/runbooks/backup-restore-design.md`, BR-OPS-001/002/003/005/006.

### 2.8 Sửa metadata giao dịch

1. Mở Quick View hoặc gửi một correction request chứa trạng thái mong muốn cuối cùng: customer
   hoặc supplier/payee, project, category và description.
2. Backend match theo stable ID, mã số thuế, mã hoặc tên chuẩn hóa. Nếu có nhiều kết quả hoặc quan hệ
   project/customer không hợp lệ, hệ thống trả lỗi rõ ràng và không thay đổi dữ liệu.
3. Với draft, hệ thống cập nhật tại chỗ theo version hiện tại. Với chứng từ issued/posted, hệ thống
   giữ nguyên bản gốc, tạo credit/reversal cần thiết và linked replacement trong kỳ mở.
4. Response trả về bản ghi hiệu lực, version, audit reference, ID của reversal/replacement và
   `nextActions`. Retry cùng idempotency key không tạo correction trùng.
5. Báo cáo chuyển sang đọc replacement đã post; audit/drill-down vẫn thể hiện đầy đủ chuỗi bản gốc →
   reversal → replacement.

Sửa metadata không cho phép ghi đè journal đã post. Nếu thay đổi số tiền, VAT/CIT, tài khoản hoặc
payment/reconciliation effect, backend áp dụng financial correction workflow tương ứng và các kiểm
soát kỳ khóa, cân bằng, RBAC, evidence.

Tham chiếu: `docs/api/data-relationships-and-ingestion.md` mục 8.8, BR-AI-005/006, BR-LED-001/002.

## 3. Ma trận lựa chọn giao diện

| Nhu cầu                        | Web                     | REST/OpenAPI              | CLI                    |
| ------------------------------ | ----------------------- | ------------------------- | ---------------------- |
| Nhập/sửa nghiệp vụ thường ngày | list + Quick View/form  | resource endpoint         | resource command       |
| Tích hợp Paperless/n8n/AI      | API & automation dialog | webhook/resource contract | scriptable JSON        |
| Import/export lớn              | wizard + dry-run        | inventory/dry-run/commit  | import/export commands |
| Kiểm tra báo cáo               | dashboard + drill-down  | report endpoints          | report commands        |
| Xử lý nền/sự cố                | Background activities   | filtered cursor API       | log/list commands      |

## 4. Tài liệu liên quan và cách đọc

1. Bắt đầu tại `README.md` để cài đặt và định vị sản phẩm.
2. Đọc tài liệu này để hiểu flow end-to-end.
3. Tra `docs/product/business-rules.md` cho invariant và điều kiện chuyển trạng thái.
4. Tra `docs/api/` cho request/response, ID propagation và CLI parity.
5. Tra ADR/runbook khi flow liên quan storage, migration, release, backup hoặc security.
6. Dùng `docs/testing/test-specification.md` và `docs/testing/test-catalog.yaml` để tìm test ID tương ứng.
