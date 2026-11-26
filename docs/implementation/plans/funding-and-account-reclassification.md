# Kế hoạch: điều chỉnh nguồn tiền và tài khoản của chi phí, doanh thu đã ghi

Trạng thái: **kế hoạch để implement** (agy cli sẽ thực hiện theo các task ERP-976 → ERP-981 trong
`docs/implementation/task-ledger.yaml`). Tài liệu này không thay đổi hành vi hệ thống.

## 1. Bài toán

Chủ doanh nghiệp biết chính xác từng khoản chi thuộc loại nào, và toàn bộ dữ liệu được đưa vào bằng
**automation (n8n/webhook) hoặc CLI**, không tạo tay trên UI:

| Loại                                                   | Ý nghĩa nghiệp vụ                                | Ảnh hưởng                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Chủ chi hộ** (`owner_paid`)                          | Chủ tự trả bằng tiền cá nhân, công ty nợ lại chủ | Ghi có TK 3388 (owner-current); không giảm tiền công ty                                                  |
| **Tiền mặt công ty do chủ giữ** (`owner_custody_cash`) | Chi từ tiền của công ty mà chủ đang cầm          | Giảm quỹ "chủ giữ hộ" (TK 111 + liên kết tài khoản tài chính `CASH-OWNER-CUSTODY`); không tạo nợ với chủ |
| **Quỹ tiền mặt công ty** (`company_cash`)              | Chi từ két công ty                               | Ghi có TK 111 (tài khoản `CASH-COMPANY`)                                                                 |
| **Ngân hàng công ty** (`company_bank`)                 | Chi từ tài khoản ngân hàng                       | Ghi có TK 112                                                                                            |

Doanh thu cũng cần đúng tài khoản/danh mục: mỗi dòng hóa đơn bán ghi vào một TK doanh thu (511…) theo
danh mục dịch vụ; sai thì phải chuyển.

**Vấn đề hiện tại:** sau khi một giao dịch đã ghi sổ rất khó đổi nguồn tiền hay tài khoản, và dữ liệu đẩy
vào mặc định rơi vào "chủ chi hộ", nên với phần lớn chi phí của chủ phải sửa từng cái.

## 2. Hiện trạng (đã kiểm chứng trong code)

1. **Mặc định khi nhập tự động:** `purchase-invoice-ingestion` và `POST /commercial-documents` (hóa đơn
   mua không khai `funding`) mặc định `funding = owner_paid` → ghi có TK 3388. Không có cấu hình theo tổ chức.
2. **Hợp đồng nguồn tiền** (`packages/contracts/src/funding.ts`): `company_bank | owner_paid |
owner_custody_cash`; hai loại đầu cần `financialAccountId`. **Không có loại "quỹ tiền mặt công ty" riêng**:
   chi từ két công ty được biểu diễn bằng `counterAccountCode = 111-…` + `fundingFinancialAccountId`.
3. **Quỹ chủ giữ và quỹ công ty dùng chung TK 111.** Sổ cái không phân biệt; chỉ liên kết
   `funding_financial_account_id` (explicit) mới cho dashboard biết khoản nào trừ quỹ chủ giữ
   (`pg-operating-dashboard.store.ts`: "Only an explicit funding financial-account link is authoritative").
   Hóa đơn cũ chưa có liên kết sẽ bị tính nhầm; đã có `expenses/funding-inference` (suy luận từ đối soát
   ngân hàng) nhưng chỉ cho khoản đã đối soát.
4. **Sửa sau khi ghi sổ chỉ có `reverse-replace`:** đảo bút toán cũ + tạo **bản nháp** thay thế.
   - `PATCH …/correction` và `…/metadata` chỉ sửa danh mục/đối tác/mô tả; gửi `funding` bị từ chối
     (`FUNDING_CORRECTION_REQUIRES_REPLACEMENT`). Metadata **không đổi tài khoản trong bút toán**.
   - Bản thay thế là _nháp_: phải duyệt/ghi sổ lại (owner solopreneur ghi nhận được, tài khoản tích hợp thì không).
   - Bút toán đảo mang ngày chứng từ gốc → bị chặn nếu kỳ đã khóa.
   - Bị chặn nếu đã đối soát ngân hàng; hóa đơn đã `paid/partially_paid` không đảo trực tiếp.
5. **Đã làm ở ERP-975 (commit `4e2e9df`, chờ push):** `POST /expenses/{id}/reclassify-funding`
   (server dựng bản thay thế từ dữ liệu đã lưu; chọn quỹ chủ giữ bằng `financialAccountId`), UI chọn từng tài khoản
   tài chính, CLI `expenses reclassify-funding`. Còn thiếu: hóa đơn mua chỉ đổi được TK kiểm soát, không gắn quỹ chủ
   giữ; chưa có thao tác hàng loạt; replacement vẫn là nháp; chưa đổi TK chi phí/doanh thu.
6. **Mẫu sửa hàng loạt đã có để tái sử dụng:** dry-run + `planHash` + commit idempotent
   (`relationship-backfill`, `tax-finalization`, `funding-inference`). Kế hoạch này theo đúng mẫu đó.

## 3. Nguyên tắc thiết kế

1. **Một ý định = một lệnh** (`set-funding`, `set-account`), server dựng bản thay thế; client chỉ gửi đích.
2. **Tham chiếu bằng mã automation đang có** (`externalReference`: `system` + `externalId`, số hóa đơn,
   ngày…), không bắt dùng id nội bộ.
3. **Dry-run luôn có**: cho thấy bút toán trước/sau theo từng tài khoản, ảnh hưởng dashboard (nợ chủ, quỹ chủ giữ,
   quỹ công ty), mục bị chặn và lý do. Commit chỉ chạy khi `planHash` khớp.
4. **Bản thay thế ghi sổ ngay khi người gọi được phép** (solopreneur + owner, hoặc cờ `postReplacement`),
   để một lệnh là xong. Mọi trường hợp khác giữ nháp như hiện nay.
5. **Phòng hơn chữa**: quy tắc nguồn tiền áp lúc nhập, để giao dịch mới rơi đúng tài khoản ngay.
6. Giữ bất biến kế toán: không sửa/xóa bút toán đã ghi; đảo + thay thế; kỳ khóa, đối soát, đa tiền tệ,
   idempotency, RBAC, audit vẫn áp dụng.

## 4. Giải pháp đề xuất

### 4.1 Quy tắc nguồn tiền khi nhập (phòng ngừa) — ERP-976

- Bảng cấu hình theo tổ chức `funding_rules(priority, match: externalSystem | supplierTaxId | category | keyword |
amount range, target: type + financialAccountId)` và một `default_funding` (thay cho `owner_paid` cứng).
- Thứ tự áp dụng: `funding` trong payload > rule khớp đầu tiên (theo priority) > default tổ chức.
- API/CLI: `funding-rules list|create|update|delete|test` (`test` nhận một payload mẫu, trả nguồn tiền sẽ chọn).
- Ví dụ: "mọi hóa đơn từ n8n có category `PARKING` → quỹ chủ giữ"; "nhà cung cấp 0110660175 → chủ chi hộ".

### 4.2 Đổi nguồn tiền từng khoản, một lệnh — ERP-977

- `POST /expenses/{id}/reclassify-funding` (đã có) mở rộng: `postReplacement` (mặc định `true` khi owner ở solopreneur)
  và tham chiếu bằng `externalReference` (`POST /expenses/by-external/{system}/{externalId}/reclassify-funding`).
- Thêm tương đương cho hóa đơn mua: `POST /commercial-documents/{id}/reclassify-funding` nhận
  `financialAccountId` (gắn quỹ chủ giữ / ngân hàng / quỹ công ty), không chỉ `targetControlAccountCode`.
- Thêm loại nguồn `company_cash` vào hợp đồng (chi từ két công ty) để hết nhập nhằng với quỹ chủ giữ.
- Bắt buộc `If-Match`, `Idempotency-Key`, `reason`; trả `reversalJournalId`, `replacementId`, `replacementState`.

### 4.3 Sửa hàng loạt bằng bảng tính — ERP-978

Quy trình chủ sử dụng:

1. `naai-erp funding-plan export --from 2026-01-01 --to 2026-11-30 --format csv > plan.csv`
   (cột: `kind, id, externalId, date, payee, description, grossMinor, currentFunding, currentAccount, targetFunding`).
2. Chủ điền cột `targetFunding` (`owner_paid | owner_custody_cash | company_cash | company_bank:<code>`) cho các dòng cần đổi.
3. `naai-erp funding-plan apply plan.csv --dry-run` → báo cáo bút toán trước/sau, tổng ảnh hưởng từng tài khoản,
   danh sách bị chặn (kỳ khóa, đã đối soát, đã thanh toán) và `planHash`.
4. `naai-erp funding-plan apply plan.csv --commit --plan-hash <hash>` → thực hiện từng khoản trong một giao dịch con
   (idempotent theo `kind:id:target`), kết quả theo dòng; chạy lại an toàn.

- API tương ứng: `POST /funding-plans/dry-run`, `POST /funding-plans/commit` (mẫu `relationship-backfill`).
- Giới hạn lô (ví dụ 200 dòng/lệnh) và báo cáo `succeeded/blocked/failed` rõ ràng.

### 4.4 Đổi tài khoản chi phí / doanh thu — ERP-979

- `POST …/{expenses|commercial-documents}/{id}/reclassify-accounts` với
  `lines: [{ lineNumber, postingAccountCode?, categoryCode? }]` (doanh thu: `primaryAccountCode` theo danh mục dịch vụ).
- Dựng lại bản thay thế giữ nguyên số tiền, VAT, phân bổ, tham chiếu ngoài; cùng cơ chế dry-run/commit hàng loạt
  (`account-plans`) và cùng cột trong bảng tính (`targetAccount`).
- Bắt buộc TK đích đang hoạt động, đúng loại (doanh thu ↔ chi phí), và hợp lệ với danh mục.

### 4.5 Phân biệt quỹ chủ giữ trong sổ cái (quyết định cần chủ + kế toán) — ERP-980

Hai phương án:

- **A. Giữ như hiện nay** (chung TK 111, tách bằng liên kết tài khoản tài chính). Ít thay đổi nhưng báo cáo chỉ dựa sổ cái
  không thấy quỹ chủ giữ; phụ thuộc liên kết `funding_financial_account_id` luôn đúng.
- **B. Tạo TK riêng cho quỹ chủ giữ** (tài khoản con của 111 hoặc khoản "phải thu khác" tùy kế toán), ánh xạ vào
  `CASH-OWNER-CUSTODY`. Sổ cái và bảng cân đối thể hiện trực tiếp; cần migration chuyển các bút toán cũ và cập nhật
  bản đồ báo cáo TT133.
- Khuyến nghị: **B** nếu báo cáo tài chính chính thức cần thấy số dư quỹ chủ giữ; **A** nếu chỉ phục vụ quản trị.
  Không thực hiện cho đến khi kế toán xác nhận cách hạch toán.

### 4.6 Dữ liệu cũ — ERP-981

- Mở rộng `funding-inference`: ngoài đối soát ngân hàng, đề xuất nguồn theo `funding_rules` và theo category
  (`expense_categories.funding_treatment`) cho khoản chưa có liên kết; chạy dry-run/commit và đưa vào bảng tính ở 4.3.
- Báo cáo "khoản chưa xác định nguồn tiền" (`funding_financial_account_id is null`) trong dashboard cấu hình.

## 5. Tác động hạch toán từng lựa chọn (để kiểm thử)

| Nguồn                | Nợ                         | Có                                  | Dashboard          |
| -------------------- | -------------------------- | ----------------------------------- | ------------------ |
| `owner_paid`         | TK chi phí (+ VAT đầu vào) | 3388                                | Công ty nợ chủ ↑   |
| `owner_custody_cash` | TK chi phí (+ VAT)         | 111 (liên kết `CASH-OWNER-CUSTODY`) | Quỹ chủ giữ ↓      |
| `company_cash`       | TK chi phí (+ VAT)         | 111 (liên kết `CASH-COMPANY`)       | Tiền mặt công ty ↓ |
| `company_bank`       | TK chi phí (+ VAT)         | 112 (liên kết tài khoản NH)         | Số dư NH ↓         |

Bất biến mỗi lần đổi: tổng nợ = tổng có; tổng chi phí/VAT không đổi; chỉ dòng "có" thay đổi; bút toán cũ ở trạng thái
`reversed`, bút toán đảo `posted`, có đúng một bản thay thế liên kết `original_expense_id`/`original_document_id`.

## 6. Giới hạn và rủi ro cần xử lý khi implement

- Kỳ đã khóa: dry-run báo "bị chặn"; không tự mở kỳ. Cân nhắc cho phép bút toán đảo vào kỳ mở hiện tại (cần quyết định kế toán).
- Đã đối soát ngân hàng / hóa đơn đã thanh toán: yêu cầu hủy đối soát trước (đã sửa lỗi hủy đối soát ở migration `0072`).
- Thuế: trạng thái CIT/VAT của dòng được giữ nguyên khi thay thế (không để quay về "chưa rà soát").
- Telegram/outbox: mỗi lần đổi sinh sự kiện hợp lệ; không gửi thông báo "doanh thu/chi phí mới" cho bản thay thế.
- Hiệu năng/an toàn lô: giới hạn kích thước, khóa theo bản ghi, kết quả từng dòng, không dừng cả lô vì một lỗi.
- Phân quyền: chỉ `owner`, `finance_admin`; mọi thay đổi có audit và lý do.

## 7. Thứ tự thực hiện (task cho agy)

| Task    | Nội dung                                                                                                     | Phụ thuộc        |
| ------- | ------------------------------------------------------------------------------------------------------------ | ---------------- |
| ERP-976 | Quy tắc nguồn tiền khi nhập + mặc định theo tổ chức                                                          | ERP-975          |
| ERP-977 | Đổi nguồn tiền từng khoản (chi phí + hóa đơn mua), `company_cash`, auto-post, tham chiếu `externalReference` | ERP-975          |
| ERP-978 | `funding-plans` hàng loạt: export/dry-run/commit + CLI                                                       | ERP-977          |
| ERP-979 | `reclassify-accounts` (chi phí/doanh thu) + `account-plans`                                                  | ERP-977          |
| ERP-980 | Tách quỹ chủ giữ trong sổ cái (sau quyết định A/B)                                                           | ERP-977          |
| ERP-981 | Suy luận nguồn cho dữ liệu cũ + báo cáo khoản chưa xác định                                                  | ERP-976, ERP-978 |

Mỗi task phải: viết test lỗi trước (T-INT cho bất biến mục 5), cập nhật OpenAPI + gate matrix + CLI + business rules + docs,
chạy test tích hợp trên Postgres tạm, thêm evidence theo `AGENTS.md`.

## 8. Câu hỏi cần chủ quyết định trước khi làm

1. Replacement có nên **ghi sổ ngay** cho mọi owner solopreneur (đề xuất: có)?
2. Phương án quỹ chủ giữ **A hay B** (mục 4.5) — cần ý kiến kế toán.
3. Có cho phép bút toán đảo vào **kỳ đang mở** khi kỳ gốc đã khóa không?
4. Danh sách quy tắc nguồn tiền ban đầu (nhà cung cấp/danh mục nào → nguồn nào) để cấu hình sẵn.
