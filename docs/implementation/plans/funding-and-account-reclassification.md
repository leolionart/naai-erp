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

## 3A. Thông lệ cho doanh nghiệp một người (cơ sở của các quyết định bên dưới)

Các nguyên tắc này là thông lệ kế toán quản trị/thuế cho công ty một chủ; mỗi điểm có ghi **cần kế toán xác nhận**
nếu liên quan quy định pháp luật hoặc mã tài khoản cụ thể. Mục tiêu: ít khái niệm, số liệu luôn suy ra từ sổ cái,
lịch sử không bị sửa.

1. **Tách bạch tiền cá nhân và tiền công ty.** Mọi khoản chi phải thuộc đúng một trong bốn nhóm: chủ chi hộ
   (công ty nợ chủ), tiền công ty do chủ giữ/ứng (chủ nợ lại công ty phần chưa chi), két/ngân hàng công ty, hoặc
   chi tiêu cá nhân của chủ (không phải chi phí, đi qua `owner_draw`/phải thu chủ sở hữu, không vào lãi lỗ).
2. **Một tài khoản vãng lai chủ sở hữu.** Quan hệ với chủ là một số dư duy nhất: _công ty nợ chủ_ (chi hộ,
   TK 3388) trừ _chủ đang giữ tiền công ty_ (tạm ứng). Dashboard hiển thị số ròng; sổ cái giữ hai tài khoản riêng để
   truy vết. Định kỳ đối chiếu và quyết toán (hoàn tiền chủ, hoặc cấn trừ vốn/vay chủ).
3. **Số dư phải suy ra từ sổ cái, không từ bảng phụ.** Số dư "chủ đang giữ" cần đúng tại _mọi ngày_ (as-of). Nếu chỉ
   dựa liên kết `funding_financial_account_id`, đổi liên kết sẽ làm số liệu quá khứ thay đổi ngầm và không khớp
   bút toán. Vì vậy quỹ chủ giữ cần **tài khoản sổ cái riêng** (xem 4.5).
4. **Không sửa lịch sử, sửa bằng bút toán điều chỉnh ở kỳ đang mở.** Khi chỉ đổi _nguồn tiền_ hoặc _tài khoản_
   (số tiền, VAT, ngày chứng từ giữ nguyên), thông lệ là một **bút toán điều chỉnh/phân loại lại** ghi ngày hiện tại
   (ví dụ Nợ 3388 / Có tài khoản chủ giữ), không đảo và ghi lại chứng từ gốc. Ưu điểm: không bị chặn bởi kỳ đã khóa, không
   cần duyệt lại, đối soát ngân hàng cũ không bị hủy, kiểm toán thấy đúng "ai đổi gì, khi nào, vì sao".
   Đảo + thay thế chỉ dùng khi đổi số tiền, VAT, ngày, đối tác hoặc chia lại phân bổ.
5. **Chủ tự duyệt nhưng có dấu vết.** Không cần người duyệt thứ hai; bắt buộc lý do, audit, idempotency và khóa kỳ.
   Một lệnh phải đi đến trạng thái cuối (đã ghi sổ), không để "nháp thay thế" treo.
6. **Bằng chứng nằm ở hệ thống nguồn** (Paperless/n8n): tham chiếu ngoài đủ làm chứng từ; ERP lưu liên kết, không nhân bản file.
7. **Chứng từ thanh toán quyết định khấu trừ.** Hóa đơn giá trị lớn chỉ được khấu trừ VAT/chi phí khi có thanh toán không
   dùng tiền mặt; chủ chi hộ bằng thẻ/chuyển khoản cá nhân vẫn đạt nếu có bằng chứng. Cần cột **phương thức thanh toán**
   (`cash | bank_transfer | card | other`) và **ngưỡng cảnh báo cấu hình theo tổ chức** (mặc định do kế toán đặt theo quy định
   hiện hành, ví dụ ngưỡng 5 triệu đồng/hóa đơn theo Luật Thuế GTGT 2024 — **cần kế toán xác nhận**); chỉ _cảnh báo_,
   không chặn ghi sổ.
8. **Quỹ tiền mặt không âm.** Chi từ quỹ chủ giữ vượt số dư là dấu hiệu sai nguồn tiền; hệ thống cảnh báo khi số dư quỹ âm
   và đề xuất chuyển phần vượt sang "chủ chi hộ".
9. **Kiểm quỹ định kỳ.** Mỗi cuối tháng chủ nhập số tiền mặt thực tế đang giữ; hệ thống so với sổ cái và ghi chênh lệch vào
   tài khoản thừa/thiếu quỹ có lý do (hoặc dẫn tới phân loại lại các khoản chi).
10. **Ít cấu hình, mặc định thông minh.** Quy tắc nguồn tiền theo nhà cung cấp/danh mục/nguồn nhập; mặc định tổ chức là
    `owner_paid` (an toàn: không làm giảm tiền công ty khi chưa chắc).

## 4. Giải pháp đề xuất

### 4.1 Quy tắc nguồn tiền khi nhập (phòng ngừa) — ERP-976

- Bảng cấu hình theo tổ chức `funding_rules(priority, match: externalSystem | supplierTaxId | category | keyword |
amount range, target: type + financialAccountId)` và một `default_funding` (thay cho `owner_paid` cứng).
- Thứ tự áp dụng: `funding` trong payload > rule khớp đầu tiên (theo priority) > default tổ chức.
- API/CLI: `funding-rules list|create|update|delete|test` (`test` nhận một payload mẫu, trả nguồn tiền sẽ chọn).
- Ví dụ: "mọi hóa đơn từ n8n có category `PARKING` → quỹ chủ giữ"; "nhà cung cấp 0110660175 → chủ chi hộ".

### 4.2 Đổi nguồn tiền từng khoản bằng bút toán điều chỉnh, một lệnh — ERP-977

- Lệnh `reclassify-funding` (chi phí **và** hóa đơn mua) thực hiện trong **một giao dịch**:
  1. ghi **bút toán điều chỉnh** ngày hiện tại (hoặc `effectiveOn` trong kỳ đang mở): Nợ tài khoản nguồn cũ / Có tài khoản nguồn mới,
     đúng số tiền thanh toán (gồm VAT nếu đã tính vào khoản phải trả/chi);
  2. cập nhật liên kết nguồn tiền của bản ghi (ghi lịch sử `funding_changes`: từ → sang, ai, khi nào, lý do, journal id);
  3. không đổi số tiền/VAT/ngày/phân bổ/trạng thái thuế, không tạo bản nháp, không cần duyệt lại.
- Trả `adjustmentJournalId`, `fundingChangeId`; idempotent theo `Idempotency-Key`; bắt buộc `If-Match` và `reason`.
- Khoản đã đối soát với giao dịch ngân hàng: chỉ cho đổi sang/giữa các tài khoản _ngân hàng/tiền mặt đúng với giao dịch_; nếu không, báo
  "cần hủy đối soát". Hóa đơn đã thanh toán một phần: chỉ đổi phần chưa thanh toán (hoặc chặn, ghi rõ).
- Địa chỉ bằng `externalReference` (`system` + `externalId`) ngoài id nội bộ.
- Thêm loại nguồn `company_cash` (két công ty) vào hợp đồng để không nhầm với quỹ chủ giữ.
- Đảo + thay thế (`reverse-replace`, đã có từ ERP-975) chỉ còn dùng khi đổi nội dung chứng từ; replacement ghi sổ ngay cho owner ở
  solopreneur để không treo nháp.

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

- Cùng nguyên tắc 3A.4: đổi _tài khoản_ (chi phí 642 ↔ 632, doanh thu 511x ↔ 511y) là **bút toán điều chỉnh ở kỳ đang mở**
  (Nợ TK mới / Có TK cũ với chi phí; ngược lại với doanh thu), kèm cập nhật danh mục/dòng; số tiền, VAT, kỳ phát sinh của chứng từ gốc không đổi.
- `POST …/{expenses|commercial-documents}/{id}/reclassify-accounts` với `lines: [{ lineNumber, postingAccountCode?, categoryCode? }]`
  và `effectiveOn?`; hàng loạt qua `account-plans` (cùng cột `targetAccount` trong bảng tính).
- Ràng buộc: TK đích đang hoạt động, đúng loại (doanh thu ↔ chi phí), phù hợp danh mục; không đổi TK thuế (VAT) bằng lệnh này.
- Lưu ý báo cáo: bút toán điều chỉnh làm báo cáo _theo kỳ_ thể hiện chênh lệch ở kỳ điều chỉnh; báo cáo "theo ngày chứng từ" của dashboard
  cần hiển thị đúng phân loại mới (đọc danh mục dòng đã cập nhật, không suy từ bút toán).

### 4.5 Quỹ tiền công ty do chủ giữ có tài khoản sổ cái riêng — ERP-980

**Quyết định theo thông lệ (3A.2, 3A.3): chọn phương án B — tài khoản sổ cái riêng.**

- Đề xuất hạch toán: khi công ty giao tiền cho chủ cầm để chi hộ, ghi **Nợ tạm ứng chủ sở hữu (TK 141) / Có 111 hoặc 112**; mỗi
  khoản chi từ quỹ đó ghi **Nợ chi phí / Có TK 141**; số dư 141 = tiền công ty chủ còn giữ. (Phương án thay thế: tài khoản con của 111,
  ví dụ `1111-CHU-GIU`. **Cần kế toán xác nhận** mã tài khoản và cách trình bày trên bảng cân đối TT133.)
- Ánh xạ `CASH-OWNER-CUSTODY` → tài khoản này; `CASH-COMPANY` giữ TK 111 riêng. Liên kết `funding_financial_account_id` vẫn tồn tại để
  truy vết nhưng **số dư và dashboard tính từ sổ cái** theo từng tài khoản (đúng tại mọi ngày as-of).
- Migration: chuyển các bút toán cũ dùng 111 có liên kết `CASH-OWNER-CUSTODY` sang tài khoản mới bằng bút toán điều chỉnh có kiểm soát
  (dry-run/commit, tổng nợ = tổng có), sau đó dashboard bỏ nhánh suy luận từ liên kết.
- Báo cáo: dashboard hiển thị _số dư vãng lai chủ sở hữu ròng_ = TK 3388 − TK 141, kèm hai thành phần.
- Quỹ không âm và kiểm quỹ định kỳ (3A.8–3A.9) là cảnh báo/biểu mẫu trên số dư này.
- Task đang `blocked` cho tới khi kế toán xác nhận mã tài khoản; sau đó chuyển `ready`.

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

- Kỳ đã khóa: bút toán điều chỉnh luôn ghi ở kỳ đang mở nên không bị chặn; chỉ đảo + thay thế (đổi số tiền/ngày) mới bị chặn và phải báo rõ.
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

## 8. Quyết định đã chốt theo thông lệ và phần còn cần xác nhận

Đã chốt (có thể thực hiện ngay):

1. Đổi nguồn tiền/tài khoản = **bút toán điều chỉnh ở kỳ đang mở** + lịch sử thay đổi, kết thúc ở trạng thái đã ghi sổ (không nháp thay thế).
2. Quỹ chủ giữ dùng **tài khoản sổ cái riêng**; số dư tính từ sổ cái; dashboard hiển thị số dư vãng lai chủ ròng.
3. Mặc định tổ chức là `owner_paid`; quy tắc nguồn tiền theo nhà cung cấp/danh mục/nguồn nhập; `funding` trong payload luôn thắng.
4. Thêm phương thức thanh toán và cảnh báo (không chặn) theo ngưỡng cấu hình; cảnh báo quỹ chủ giữ âm; biểu mẫu kiểm quỹ cuối tháng.

Cần kế toán/chủ xác nhận trước khi code phần liên quan:

1. Mã tài khoản cho quỹ chủ giữ (TK 141 tạm ứng hay tài khoản con của 111) và cách trình bày trên bảng cân đối.
2. Ngưỡng thanh toán không dùng tiền mặt áp dụng cho khấu trừ VAT và chi phí được trừ hiện hành.
3. Cách xử lý chi tiêu cá nhân của chủ (rút vốn, tạm ứng hay phải thu chủ sở hữu) phù hợp loại hình công ty.
4. Danh sách quy tắc nguồn tiền ban đầu (nhà cung cấp/danh mục nào → nguồn nào).
