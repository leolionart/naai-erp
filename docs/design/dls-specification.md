# NAAI ERP Design Language System (DLS) Specification

Tài liệu này quy định chuẩn thiết kế giao diện và tương tác bắt buộc cho toàn bộ `apps/web` (theo `ADR-013` và `BR-UI-008`), được kiểm tra tự động bởi `apps/web/src/components/dls-compliance.test.ts`.

## 1. Bố cục trang & phân cấp không gian (`ModulePage` + Grid)

1. **Khung trang chuẩn**: Mọi màn hình trong `apps/web/src/app/(app)/` sử dụng `ModulePage` (hoặc `PageHeader` cho màn hình tùy biến đặc thù). Không đặt nút mở popup tài liệu hay badge trạng thái hệ thống ít dùng lên thanh `PageHeader` chung.
2. **Không bó hẹp chiều ngang tùy tiện**: Không bọc workspace gốc bằng `max-w-md`, `max-w-lg`, `max-w-xl`, `max-w-2xl`. Thay vào đó:
   - Hàng chỉ số tóm tắt (KPI / trạng thái vận hành): dùng lưới `grid gap-4 sm:grid-cols-2 xl:grid-cols-4`.
   - Biểu mẫu cấu hình nhiều nhóm (như Thông báo Telegram, Nguồn tích hợp): chia cột cân đối `grid gap-6 lg:grid-cols-2` với các `Card` có chiều cao và phân vùng rõ ràng.
3. **Hiển thị trực tiếp trên màn hình chuyên biệt**: Khi một tính năng đã có route riêng trên menu (ví dụ `/settings/automation`), toàn bộ thông tin kết nối, khóa API và tài liệu endpoint được trình bày trực tiếp thành các phân vùng `Card` / bộ lọc ngay trên trang, không giấu sau nút mở `Dialog` trên header. `Dialog` / `AlertDialog` chỉ dùng cho thao tác tạo nhanh theo ngữ cảnh, xem nhanh chứng từ (Quick View), hoặc xác nhận hành động có hệ quả.

## 2. Hệ thống thành phần chuẩn (`@/components/ui/*`)

Mọi biểu mẫu và vùng tương tác bên ngoài `apps/web/src/components/ui/` bắt buộc dùng primitive chuẩn:

- **Nhập liệu văn bản / số**: `Field` + `FieldLabel` (có `htmlFor` khớp `id`) + `Input` hoặc `Textarea`. Cấm dùng thẻ `<input>` (trừ `type="hidden"` hoặc `type="file"` ẩn phục vụ upload), `<select>`, `<textarea>` thô.
- **Bật / tắt cấu hình nhị phân**:
  - Dùng `Switch` cho các tùy chọn bật/tắt tính năng hoặc trạng thái hoạt động (ví dụ: bật bot Telegram, bật loại thông báo, bật `autoRecord`).
  - Dùng `Checkbox` cho lựa chọn đánh dấu trong form hoặc bảng (ví dụ: Lưu đăng nhập, chọn dòng).
- **Thu gọn / mở rộng nội dung phụ**: Ưu tiên `Collapsible` (`CollapsibleTrigger` + `CollapsibleContent`) cho các thẻ tài liệu/cấu hình tương tác.
- **Hộp thoại xác nhận & nhập lý do audit**: Dùng `Dialog` hoặc `AlertDialog` của hệ thống. Nghiêm cấm `window.confirm`, `window.prompt`, `window.alert`.

## 3. Màu sắc ngữ nghĩa (Semantic Tokens)

- Chỉ sử dụng biến màu ngữ nghĩa của theme (`bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `text-primary`, `text-destructive`, `border-border`) và các `variant` chuẩn của `Badge` / `Alert` / `Button`.
- Không gắn cứng bảng màu thô của Tailwind (`bg-slate-950`, `text-slate-100`, `border-slate-800`, v.v.) làm hỏng giao diện Sáng / Tối đồng nhất của ứng dụng.
- Màu sắc không bao giờ là tín hiệu duy nhất biểu thị trạng thái kế toán hoặc vận hành: luôn đi kèm nhãn văn bản hoặc biểu tượng rõ nghĩa.

## 4. Quy chuẩn tương tác, phản hồi & trạng thái tải

1. **Vị trí nút hành động của Form**:
   - Nút lưu chính (`type="submit"` hoặc action chính) và nút phụ (`type="button"`, `variant="outline"`) phải nằm trong `CardFooter` (có đường phân tách `border-t pt-4` khi cần) hoặc `DialogFooter` — không thả trôi ngoài `Card`.
   - Khóa nút lưu khi chưa thay đổi dữ liệu (`!dirty`) hoặc đang gửi request (`busy`), đồng thời đổi nhãn trạng thái rõ ràng (`Đang lưu…`, `Đang gửi…`).
2. **Trạng thái tải, trống và lỗi**:
   - Khi đang tải dữ liệu lần đầu: hiển thị `Skeleton` giữ chỗ tương ứng cấu trúc card/bảng.
   - Khi danh sách trống: hiển thị trạng thái rỗng rõ nghĩa (hoặc component `Empty`).
   - Khi lỗi API: giữ nguyên dữ liệu người dùng vừa nhập, hiển thị `Alert variant="destructive"` nêu rõ nguyên nhân, không xóa trắng form.
   - Khi hoàn tất thao tác lưu / cập nhật / gửi thử: thông báo ngắn gọn qua `toast.success` / `toast.error` (`sonner`) kết hợp cập nhật trạng thái tại chỗ.
