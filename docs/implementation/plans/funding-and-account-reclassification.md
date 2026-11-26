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
2. **Theo dõi rõ quan hệ tiền với chủ**, mỗi loại một tài khoản (không bù trừ trong sổ cái, chỉ bù trừ khi trình bày):
   _công ty nợ chủ_ (chủ chi hộ, TK 3388), _tiền mặt của công ty do chủ giữ_ (tài sản tiền mặt, tài khoản chi tiết của TK 111,
   mục 4.5) và _chủ nợ công ty_ (chi tiêu cá nhân đã lấy từ công ty, TK 1388). Dashboard hiển thị cả ba và vị thế ròng với chủ =
   3388 − 1388; tiền mặt chủ đang giữ là tiền của công ty nên **không** nằm trong vị thế ròng. Định kỳ đối chiếu và quyết toán
   (hoàn tiền chủ, cấn trừ, hoặc chủ quyết định chia lợi nhuận).
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
7. **Chứng từ thanh toán quyết định khấu trừ.** Từ 01/07/2025 (Luật Thuế GTGT 48/2024/QH15, hướng dẫn NĐ 181/2025) hóa đơn mua vào có
   tổng thanh toán **từ 5 triệu đồng (đã gồm VAT)** phải có chứng từ thanh toán không dùng tiền mặt mới được khấu trừ VAT; nhiều hóa đơn
   cùng người bán trong cùng ngày được cộng dồn. Với thuế TNDN, NĐ 320/2025 (hiệu lực 15/12/2025, áp dụng kỳ tính thuế 2025) đặt
   cùng ngưỡng 5 triệu cho từng lần chi để được tính vào chi phí được trừ. Do đó cần cột **phương thức thanh toán**
   (`cash | bank_transfer | card | other`) và **ngưỡng cảnh báo** mặc định 5.000.000 VND (cấu hình được vì quy định còn thay đổi),
   kiểm tra cộng dồn theo ngày + người bán cho VAT. Hệ thống chỉ _cảnh báo_, không chặn ghi sổ. Chủ chi hộ bằng thẻ/chuyển khoản
   cá nhân được coi là thanh toán không dùng tiền mặt **nếu có bằng chứng** — điểm này chưa tìm được văn bản chính thức, hãy giữ sao kê/biên lai.
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

### 4.5 Quỹ tiền mặt do chủ giữ là một quỹ riêng trong sổ cái — ERP-980 (đã quyết định)

**Quyết định:** tiền công ty do chủ cầm vẫn là **tiền mặt của công ty (nhóm TK 111)**, nhưng hạch toán ở **tài khoản chi tiết riêng**
`111-OWNER-CUSTODY` ("Quỹ tiền mặt do chủ giữ"), tách khỏi `111-CASH` (két công ty).

- Lý do: (a) chủ là người đại diện giữ quỹ nên tiền vẫn thuộc công ty — chỉ cần sổ quỹ và kiểm quỹ; (b) TK 141 (tạm ứng) dành cho
  _người lao động_, còn chủ không phải nhân viên, dùng 141 sẽ sai bản chất; (c) chế độ kế toán doanh nghiệp nhỏ và vừa (TT133) cho phép
  mở thêm tài khoản chi tiết; TT 99/2025 chỉ thay TT 200 và doanh nghiệp nhỏ vừa vẫn được dùng TT133; (d) số dư tính thẳng từ sổ cái, đúng tại mọi ngày.
- Hạch toán: rút ngân hàng/két giao chủ giữ = chuyển nội bộ **Nợ 111-OWNER-CUSTODY / Có 112 (hoặc 111-CASH)**; chi từ quỹ này =
  **Nợ chi phí / Có 111-OWNER-CUSTODY**; kiểm quỹ chênh lệch ghi vào tài khoản thừa/thiếu quỹ có lý do.
- Ánh xạ `CASH-OWNER-CUSTODY` → `111-OWNER-CUSTODY`; `CASH-COMPANY` → `111-CASH`. Liên kết `funding_financial_account_id` giữ để truy vết;
  **số dư và dashboard tính từ sổ cái**.
- Migration: chuyển các bút toán cũ dùng 111 có liên kết `CASH-OWNER-CUSTODY` sang tài khoản mới bằng bút toán điều chỉnh có kiểm soát
  (dry-run/commit, tổng nợ = tổng có, báo cáo trước/sau), rồi dashboard bỏ nhánh suy luận từ liên kết.
- Báo cáo: nhóm TK 111 cộng cả hai quỹ trên bảng cân đối; phần quản trị hiển thị riêng "tiền mặt chủ đang giữ".
- Chi tiêu cá nhân của chủ lấy từ tiền công ty: ghi **Nợ 1388 (phải thu chủ sở hữu) / Có nguồn tiền**, **không** vào chi phí, không khấu trừ VAT,
  không tính vào thuế TNDN; giải quyết bằng chủ hoàn tiền, cấn trừ với 3388, hoặc chủ quyết định chia lợi nhuận (Nợ 421 / Có 1388) khi quyết toán.
  Lương/thù lao của chủ công ty một thành viên thường không được trừ khi tính thuế TNDN nên không nên ghi như chi phí lương.

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

## 8. Quyết định đã chốt (không cần kế toán)

Các quyết định dưới đây được chốt dựa trên nghiên cứu quy định hiện hành và thông lệ doanh nghiệp một người; xem mục 9 về giới hạn.

1. **Hệ thống tài khoản:** tiếp tục TT133 (TT 99/2025 chỉ thay TT 200; doanh nghiệp nhỏ và vừa được chọn TT99 hoặc giữ TT133). Không đổi.
2. **Đổi nguồn tiền/tài khoản** = bút toán điều chỉnh ở kỳ đang mở + lịch sử thay đổi, kết thúc ở trạng thái đã ghi sổ (không có nháp thay thế).
3. **Quỹ tiền công ty do chủ giữ** = tài khoản chi tiết riêng `111-OWNER-CUSTODY` (mục 4.5), không dùng TK 141.
4. **Chủ chi hộ** = TK 3388; **chi tiêu cá nhân lấy từ tiền công ty** = TK 1388, ngoài lãi lỗ.
5. **Ngưỡng thanh toán không dùng tiền mặt** = 5.000.000 VND (tổng thanh toán gồm VAT), cộng dồn trong ngày theo người bán cho VAT; chỉ cảnh báo; cấu hình được.
6. **Mặc định nguồn tiền tổ chức** = `owner_paid`; `funding` trong payload luôn thắng; quy tắc theo nhà cung cấp/danh mục/nguồn nhập.
7. **Quy tắc ban đầu:** chưa cần nhập sẵn danh sách. Quy trình bảng tính (4.3) cho phép chủ đánh dấu hàng loạt; sau vài tháng dùng
   `funding-rules test` để chuyển các lựa chọn lặp lại thành quy tắc.
8. **Cảnh báo quỹ chủ giữ âm** và **kiểm quỹ cuối tháng** là bắt buộc trong ERP-981.

## 9. Giới hạn của các quyết định này

- Đây là kết quả nghiên cứu từ nguồn công khai (xem mục 10), **không phải tư vấn thuế/kế toán chính thức**. Các điểm chưa xác minh được từ văn bản gốc:
  (a) thanh toán từ tài khoản cá nhân của chủ có được coi là "không dùng tiền mặt" cho công ty hay không; (b) dự thảo sửa NĐ 320/2025 về lương dưới 5 triệu;
  (c) hạch toán chi tiết chi tiêu cá nhân của chủ theo loại hình công ty cụ thể.
- Thiết kế đã giữ các quyết định này **cấu hình được hoặc chỉ cảnh báo** (ngưỡng, nhãn TK, ánh xạ), nên đổi quy định không cần viết lại logic.
- Khi công ty có doanh thu/rủi ro thuế đáng kể, nên nhờ kế toán thuế rà soát một lần các mã tài khoản và cách trình bày; hệ thống hỗ trợ xuất dữ liệu
  để việc đó nhanh (accountant export).

## 10. Nguồn tham khảo

- Luật Thuế GTGT 48/2024/QH15 và điều kiện thanh toán không dùng tiền mặt từ 5 triệu: [MISA](https://amis.misa.vn/51249/quy-dinh-thanh-toan-khong-dung-tien-mat/),
  [Luật Việt Nam](https://luatvietnam.vn/thue-phi-le-phi/hoa-don-tren-5-trieu-phai-chuyen-khoan-duoc-quy-dinh-o-dau-565-102223-article.html),
  [Deloitte](https://www2.deloitte.com/content/dam/Deloitte/vn/Documents/tax/vn-tax-alert-new-law-on-vat-vi.pdf).
- NĐ 320/2025/NĐ-CP, chi phí được trừ từ 5 triệu: [Luật Việt Nam](https://luatvietnam.vn/tin-van-ban-moi/hoa-don-tu-5-trieu-dong-phai-thanh-toan-khong-tien-mat-de-duoc-tru-thue-tndn-186-106006-article.html),
  [MISA](https://sme.misa.vn/350011/nghi-dinh-320-ve-thue-tndn/).
- Luật Thuế TNDN 67/2025/QH15 (hiệu lực 01/10/2025): [Crowe](https://www.crowe.com/vn/vi-vn/news/key-highlights-of-the-2025-corporate-income-tax-law).
- Thông tư 99/2025/TT-BTC và quan hệ với TT133: [KPMG](https://kpmg.com/vn/vi/home/phan-tich-chuyen-sau/2025/11/key-changes-in-vietnamese-accounting-system-for-enterprises.html),
  [Thư viện pháp luật](https://thuvienphapluat.vn/hoi-dap-phap-luat/thong-tu-99-2025-cua-bo-tai-chinh-thay-the-nhung-thong-tu-nao-138068177.html).
- TK 141 chỉ cho người lao động, chi cho đối tượng khác theo dõi ở TK 1388: [MISA](https://amis.misa.vn/26138/hach-toan-tai-khoan-141-khoan-tam-ung/).
