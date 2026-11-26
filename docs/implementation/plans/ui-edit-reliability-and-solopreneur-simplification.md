# Kế hoạch: sửa chi phí/doanh thu trên UI không lỗi và đơn giản hóa vận hành một người

Trạng thái: **kế hoạch để agy implement** (task ERP-988 → ERP-992). Tài liệu này không đổi hành vi hệ thống.
Chủ doanh nghiệp vận hành một người, dữ liệu đưa vào bằng automation/CLI; UI chủ yếu dùng để xem, sửa nhanh và ghi sổ.
Nguyên tắc: **ít bước, ít ràng buộc duyệt, nhưng vẫn có audit**; mỗi thao tác một nút, lỗi nói rõ bằng tiếng Việt.

## 1. Kiểm chứng đã làm (UI thật + API thật + Postgres tạm, không mock)

Bộ kiểm chứng nằm ở `docs/implementation/plans/ui-verification-harness/` (seed, tạo bản ghi như automation, script Playwright).
Dữ liệu mẫu chỉ có danh mục chuẩn (`business_categories`, `expense_categories`) như một tổ chức thật.

| Thao tác trên UI                                                      | Kết quả                                                                                         |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Mở danh sách chi phí                                                  | Hiển thị đúng, nhưng phát sinh 2 request lỗi nền (F2, F3)                                       |
| Đổi nguồn thanh toán chi phí đã ghi sổ sang "Tiền công ty chủ giữ hộ" | **Chạy đúng**: bản gốc `reversed`, bản thay thế `posted` với `111-CASH` + liên kết `fa-custody` |
| Sửa diễn giải/danh mục chi phí đã ghi sổ ("Lưu thay đổi")             | **Lỗi `CATEGORY_NOT_FOUND`** (F1)                                                               |
| Sửa chi phí nháp, hóa đơn bán, void, xóa nháp, đổi nguồn hóa đơn mua  | **Chưa kiểm chứng trên UI thật** (mở rộng harness ở ERP-991)                                    |

### Lỗi tìm thấy

- **F1 — Lưu thay đổi chi phí luôn lỗi trong tổ chức không có danh mục kiểu cũ.**
  UI gửi `PATCH /expenses/{id}/metadata` với `{"category":"OFFICE","payeePartyId":"SUP","businessPurpose":"…"}`.
  `pg-expense.store.ts` (`updateMetadata`, khối `if (input.category)`) kiểm tra `category` trong **`dimension_values(kind='category')`**
  (danh mục cũ) trong khi danh mục chuẩn từ ERP-936 là `business_categories` / `expense_categories`.
  Hệ quả: mọi lần lưu từ cửa sổ chi tiết đều bị từ chối. Cần kiểm tra tương tự ở `commercial-documents/{id}/metadata` và `…/category`.
- **F2 — UI gọi đường dẫn không tồn tại.** `focused-record-list-workspace.tsx:494` gọi `GET expense-categories` → 404 mỗi lần tải;
  đúng là `master-data/expense-categories` (như `document-expense-forms.tsx:1208`). Tên danh mục/nguồn tiền mặc định bị thiếu mà không báo lỗi.
- **F3 — UI gọi tính năng đã gỡ.** Danh sách gọi `GET time/workers` → 400 `relation "workforce_profiles" does not exist`
  (bảng bị gỡ cùng hệ thống timesheet ở ERP-905, route `time.controller.ts` và lời gọi UI còn lại). Mỗi lần tải danh sách tạo một request lỗi.
- **F4 — Thông báo lỗi khó hiểu.** Lỗi thao tác từng hiển thị dưới tiêu đề "Không thể tải dữ liệu" (đã sửa trong ERP-975, chưa push) và mã thô
  (`CATEGORY_NOT_FOUND`, `EXPENSE_REVIEW_INCOMPLETE`, `INVALID_EXPENSE_TRANSITION`…) không được dịch.

## 2. Đơn giản hóa cho vận hành một người

Hiện trạng: bản nháp do n8n tạo phải đi qua `submit → approve → post` (chi phí) hoặc `capture → verify → approve → post/issue` (hóa đơn), mỗi bước hỏi lý do.
Đề xuất:

1. **Một nút "Ghi sổ"** (ERP-989). `POST /expenses/{id}/record` và `POST /commercial-documents/{id}/record` thực hiện toàn bộ chuỗi trong **một giao dịch**
   cho owner ở solopreneur: tự duyệt, áp mặc định thuế (ERP-971, có kiểm tra bằng chứng thanh toán của ERP-982), coi tham chiếu ngoài là bằng chứng,
   ghi sổ. Thành công trả `journalId`; thất bại không để lại trạng thái dở và trả **danh sách lý do** (kỳ đã khóa, thiếu tài khoản đối ứng, thiếu bằng chứng thanh toán…).
   UI chỉ hiển thị nút này (ẩn gửi duyệt/duyệt/xác minh/phát hành), chế độ kiểm soát giữ nguyên.
2. **Ghi sổ hàng loạt**: `POST /drafts/record` với `dryRun`/`commit` (theo mẫu `planHash`), CLI `naai-erp drafts record --dry-run|--commit`;
   báo cáo từng bản ghi thành công/bị chặn. Dùng cho lô nháp từ automation.
3. **Tự ghi sổ theo nguồn tích hợp** (ERP-990): cờ `autoRecord` trên nguồn webhook/token tích hợp. Bản ghi hợp lệ được ghi sổ ngay khi nhập (vẫn dưới danh tính
   tích hợp, có audit); bản ghi không đủ điều kiện ở lại nháp kèm `reasons`. Nhờ đó automation không cần token `owner`.
4. **Lý do mặc định** cho thao tác thường ngày (ghi sổ, duyệt): tự điền "Chủ ghi sổ" và để sửa được. Lý do vẫn **bắt buộc** cho void, đảo, đổi nguồn tiền,
   đổi tài khoản (có ảnh hưởng sổ cái).
5. **Bớt khái niệm trên UI** ở solopreneur: ẩn "đánh dấu thiếu chứng từ", "từ chối" khỏi hàng nút chính (chuyển vào menu phụ), bỏ cảnh báo maker-checker
   (owner luôn tự duyệt được).

## 3. Sửa lỗi bộ test (nguyên nhân gốc đã tìm ra)

Bản vá tham khảo (đã chạy xanh, chưa áp dụng): `docs/implementation/plans/reference-patches/test-fixtures-and-aging-ap.patch`.

| Test                                                             | Nguyên nhân                                                                                                                                      | Hướng sửa                                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `customer-service-subscription`, `management-workbook` (dọn dẹp) | Middleware nhật ký tạo `operational_activity_logs` cho tổ chức; test xóa tổ chức mà không xóa nhật ký                                            | Xóa `operational_activity_logs` trước khi xóa tổ chức (trong bản vá)                                    |
| `management-workbook` (nội dung)                                 | ERP-958 thêm 3 sheet "Dashboard …" và đối soát theo dashboard                                                                                    | Cập nhật danh sách sheet và kỳ vọng công thức (trong bản vá)                                            |
| `empty-organization-restore`                                     | Restore không sao chép bảng tài khoản (cấu hình khởi tạo); tổ chức đích trong test thiếu tài khoản `112` nên khóa ngoại `financial_accounts` lỗi | Seed tài khoản cho tổ chức đích (trong bản vá)                                                          |
| `aging` (AP)                                                     | ERP-905 đổi AP chỉ còn khoản freelancer nên hóa đơn mua chưa trả không vào AP và `tieStatus` = `out_of_balance`                                  | Khôi phục AP gồm hóa đơn mua ghi vào TK 331 + freelancer, đối chiếu sổ cái 331 (bản vá; đây là ERP-984) |
| `accountant-exports`, `aging`                                    | Dùng id tổ chức cố định, chạy lại trên cùng DB báo trùng khóa                                                                                    | Id ngẫu nhiên theo lần chạy hoặc dọn dẹp ở `afterAll`                                                   |
| 8 test Playwright cũ (`focused-records.spec.ts`)                 | Selector/nhãn/đường dẫn lỗi thời (ví dụ `/documents` đã chuyển `/revenue`, nhãn "Dự án" trùng 2 phần tử)                                         | Cập nhật selector; chạy với `NEXT_PUBLIC_*` trỏ API giả, không dùng `.env.local` thật                   |

## 4. Nhiệm vụ

| Task    | Nội dung                                                                                                                                                                                                                                        | Phụ thuộc        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| ERP-988 | Sửa F1–F4: kiểm tra danh mục theo danh mục chuẩn (có dự phòng kiểu cũ) cho metadata/category của chi phí và hóa đơn; bỏ/đổi lời gọi `expense-categories` và `time/workers`; bảng dịch mã lỗi sang tiếng Việt; phân biệt lỗi tải và lỗi thao tác | ERP-975          |
| ERP-989 | Nút "Ghi sổ" một bước (chi phí, hóa đơn), ghi sổ hàng loạt dry-run/commit, CLI, ẩn các bước trung gian ở solopreneur                                                                                                                            | ERP-982, ERP-988 |
| ERP-990 | Cờ `autoRecord` cho nguồn tích hợp, hiển thị `reasons` bản nháp chưa ghi sổ, cấu hình qua API/CLI/UI                                                                                                                                            | ERP-989          |
| ERP-991 | Chuyển bộ kiểm chứng UI thật thành spec Playwright chạy trong CI (API thật + DB tạm) cho: sửa, đổi danh mục, đổi nguồn tiền, void, xóa nháp, ghi sổ, ghi sổ hàng loạt                                                                           | ERP-988          |
| ERP-992 | Sửa các test lỗi theo bảng mục 3 (áp dụng bản vá tham khảo, thêm id ngẫu nhiên, cập nhật Playwright)                                                                                                                                            | —                |

## 5. Quy tắc nghiệp vụ dự kiến

- `BR-EDIT-001`: danh mục của chi phí/hóa đơn được kiểm tra trên danh mục chuẩn của tổ chức; danh mục kiểu cũ chỉ là dự phòng.
- `BR-REC-001`: với owner ở solopreneur, "Ghi sổ" là một thao tác nguyên tử đưa bản nháp đủ điều kiện tới trạng thái đã ghi sổ; không đủ điều kiện thì không đổi gì và trả đủ lý do.
- `BR-REC-002`: nguồn tích hợp có `autoRecord` ghi sổ bản ghi hợp lệ ngay khi nhập; bản ghi không hợp lệ ở lại nháp kèm lý do; mọi hành vi được audit theo danh tính tích hợp.
- `BR-REC-003`: thao tác thường ngày có lý do mặc định; thao tác ảnh hưởng sổ cái (void, đảo, đổi nguồn tiền/tài khoản) luôn cần lý do.

## 6. Lưu ý vận hành

Các commit ERP-975 trở đi (gồm sửa đổi nguồn tiền) **chưa push** tại thời điểm viết; server thật chưa có chúng. Các lỗi F1–F3 tồn tại trong bản đang chạy.
