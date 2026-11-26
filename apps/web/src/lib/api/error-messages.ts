export const VIETNAMESE_API_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  AUTH_REQUIRED: "Phiên đăng nhập đã hết hạn hoặc chưa xác thực. Vui lòng đăng nhập lại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  RESOURCE_NOT_FOUND: "Không tìm thấy bản ghi hoặc dữ liệu yêu cầu.",
  VALIDATION_FAILED: "Dữ liệu gửi lên chưa hợp lệ. Vui lòng kiểm tra lại các trường thông tin.",
  IDEMPOTENCY_KEY_REQUIRED: "Thiếu khóa chống gửi trùng (Idempotency-Key). Vui lòng thử lại.",
  IDEMPOTENCY_CONFLICT: "Yêu cầu bị trùng khóa xử lý với dữ liệu khác. Vui lòng tải lại trang.",
  IDEMPOTENCY_KEY_WAS_REUSED_WITH_A_DIFFERENT_REQUEST:
    "Yêu cầu bị trùng khóa xử lý với dữ liệu khác. Vui lòng tải lại trang.",
  IF_MATCH_REQUIRED: "Thiếu phiên bản bản ghi (If-Match). Vui lòng tải lại trước khi lưu.",
  VERSION_CONFLICT:
    "Bản ghi vừa được cập nhật ở nơi khác. Vui lòng tải lại để lấy phiên bản mới nhất.",
  RESOURCE_VERSION_CONFLICT:
    "Bản ghi vừa được cập nhật ở nơi khác. Vui lòng tải lại để lấy phiên bản mới nhất.",
  CATEGORY_NOT_FOUND: "Danh mục nghiệp vụ không tồn tại hoặc đã ngừng hoạt động trong tổ chức.",
  EXPENSE_CATEGORY_NOT_FOUND:
    "Danh mục chi phí không tồn tại hoặc đã ngừng hoạt động trong tổ chức.",
  CATEGORY_AMBIGUOUS:
    "Danh mục nghiệp vụ bị trùng hoặc chưa rõ ràng. Vui lòng chọn chính xác một danh mục.",
  PAYEE_SUPPLIER_NOT_FOUND:
    "Đối tác thụ hưởng chưa có vai trò nhà cung cấp đang hoạt động trong danh bạ.",
  CUSTOMER_CLIENT_NOT_FOUND:
    "Khách hàng được chọn không tồn tại hoặc chưa có vai trò khách hàng đang hoạt động.",
  PARTY_ROLE_NOT_FOUND:
    "Đối tác được chọn chưa có đúng vai trò nghiệp vụ (khách hàng / nhà cung cấp) đang hoạt động.",
  PROJECT_NOT_FOUND: "Dự án được chọn không tồn tại hoặc không còn ở trạng thái cho phép phân bổ.",
  PROJECT_CLOSED: "Dự án đã đóng nên không thể gắn thêm chứng từ hoặc chi phí mới.",
  PROJECT_CUSTOMER_MISMATCH:
    "Khách hàng trên chứng từ không khớp với khách hàng của dự án đã chọn.",
  SALES_INVOICE_PROJECT_CUSTOMER_MISMATCH:
    "Khách hàng trên hóa đơn bán ra không khớp với khách hàng của dự án đã chọn.",
  SALES_INVOICE_PROJECT_REQUIRED: "Hóa đơn bán ra bắt buộc phải gắn với một dự án hợp lệ.",
  SALES_INVOICE_PROJECT_INVALID: "Dự án gắn trên hóa đơn bán ra không hợp lệ.",
  DOCUMENT_PROJECT_REQUIRED: "Chứng từ này bắt buộc phải chọn dự án phân bổ.",
  CONTRACT_PROJECT_MISMATCH: "Hợp đồng không thuộc dự án đã chọn.",
  EXPENSE_CONTRACT_PROJECT_REQUIRED: "Phải chọn dự án khi phân bổ theo hợp đồng.",
  DOCUMENT_CONTRACT_PROJECT_REQUIRED: "Phải chọn dự án khi phân bổ theo hợp đồng.",
  EXPENSE_LINE_NOT_FOUND: "Không tìm thấy dòng chi phí cần cập nhật.",
  EXPENSE_REVIEW_INCOMPLETE:
    "Chi phí chưa hoàn tất kiểm tra quản trị / thuế (CIT, VAT) trước khi duyệt hoặc ghi sổ.",
  EXPENSE_EVIDENCE_INCOMPLETE:
    "Chi phí còn thiếu chứng từ bắt buộc theo chính sách trước khi duyệt hoặc ghi sổ.",
  PURCHASE_TAX_REVIEW_REQUIRED:
    "Hóa đơn mua vào cần hoàn tất kiểm tra thuế trước khi duyệt hoặc ghi sổ.",
  VAT_EVIDENCE_REQUIRED: "Cần có hóa đơn / chứng từ hợp lệ để khấu trừ thuế GTGT đầu vào.",
  INVALID_EXPENSE_TRANSITION:
    "Trạng thái hiện tại của chi phí không cho phép thực hiện thao tác này.",
  INVALID_DOCUMENT_TRANSITION:
    "Trạng thái hiện tại của chứng từ không cho phép thực hiện thao tác này.",
  INVALID_STATE_TRANSITION:
    "Trạng thái hiện tại của bản ghi không cho phép thực hiện thao tác này.",
  EXPENSE_NOT_DRAFT: "Chỉ bản ghi nháp mới có thể chỉnh sửa trực tiếp toàn bộ thông tin.",
  EXPENSE_FINAL_IMMUTABLE:
    "Chi phí đã ghi sổ hoặc đã đảo bút toán nên không thể sửa trực tiếp trường tài chính.",
  FINAL_EXPENSE_IMMUTABLE: "Chi phí đã khóa kế toán nên không thể sửa trực tiếp trường tài chính.",
  FINAL_DOCUMENT_IMMUTABLE:
    "Chứng từ đã phát hành / ghi sổ nên không thể sửa trực tiếp trường tài chính.",
  DUPLICATE_DOCUMENT:
    "Phát hiện chứng từ hoặc chi phí trùng (cùng đối tác, ngày và số tiền). Vui lòng kiểm tra lại.",
  DELETE_REASON_REQUIRED: "Vui lòng nhập lý do xóa bản nháp.",
  DOCUMENT_DELETE_NOT_ALLOWED: "Chỉ hóa đơn nháp chưa phát sinh bút toán mới được phép xóa.",
  DOCUMENT_DELETE_REFERENCED: "Không thể xóa bản ghi vì đang được tham chiếu bởi nghiệp vụ khác.",
  MAKER_CHECKER_VIOLATION:
    "Chế độ kiểm soát yêu cầu người duyệt độc lập với người lập (hoặc vượt hạn mức tự duyệt).",
  PERIOD_SOFT_LOCKED:
    "Kỳ kế toán đang khóa mềm; chỉ chủ doanh nghiệp hoặc quản trị tài chính mới được phép ghi sổ.",
  PERIOD_HARD_LOCKED:
    "Kỳ kế toán đã khóa cứng. Cần mở lại kỳ theo quy trình trước khi ghi sổ hoặc đảo bút toán.",
  FISCAL_PERIOD_NOT_FOUND: "Ngày chứng từ chưa thuộc kỳ kế toán nào được mở trong hệ thống.",
  FISCAL_PERIOD_AMBIGUOUS:
    "Ngày chứng từ đang trùng nhiều kỳ kế toán. Vui lòng kiểm tra cấu hình năm tài chính.",
  JOURNAL_UNBALANCED: "Bút toán không cân đối Nợ / Có nên không thể ghi sổ.",
  JOURNAL_ALREADY_POSTED: "Bút toán của bản ghi này đã được ghi sổ trước đó.",
  JOURNAL_ALREADY_REVERSED: "Bút toán gốc đã được đảo trước đó.",
  JOURNAL_NOT_APPROVED: "Bút toán chưa được duyệt nên chưa thể ghi sổ.",
  FUNDING_SOURCE_INVALID: "Nguồn thanh toán được chọn không hợp lệ.",
  EXPENSE_FUNDING_ACCOUNT_NOT_AVAILABLE:
    "Tài khoản tiền / ngân hàng được chọn không tồn tại, đã ngưng hoạt động hoặc khác loại tiền tệ.",
  EXPENSE_FUNDING_ACCOUNT_MISMATCH:
    "Tài khoản tiền được chọn không khớp với tài khoản kế toán đối ứng.",
  FUNDING_CORRECTION_REQUIRES_REPLACEMENT:
    "Đổi nguồn thanh toán của bản ghi đã ghi sổ phải thực hiện qua chức năng Đổi nguồn thanh toán.",
  FINANCIAL_ACCOUNT_NOT_FOUND: "Không tìm thấy tài khoản ngân hàng hoặc quỹ tiền mặt đã chọn.",
  FINANCIAL_ACCOUNT_INACTIVE: "Tài khoản ngân hàng hoặc quỹ tiền mặt đã ngừng hoạt động.",
  OWNER_CURRENT_ACCOUNT_NOT_CONFIGURED:
    "Chưa cấu hình tài khoản công nợ chủ sở hữu (TK 3388) trong mapping báo cáo tài chính.",
  OWNER_CURRENT_ACCOUNT_REQUIRED:
    "Chi phí chủ doanh nghiệp chi hộ yêu cầu tài khoản đối ứng công nợ chủ sở hữu (TK 3388).",
  EXPENSE_ALLOCATION_INVALID: "Phân bổ chi phí không hợp lệ.",
  EXPENSE_ALLOCATION_MISMATCH: "Tổng tiền phân bổ không khớp với số tiền dòng chi phí.",
  EXPENSE_CONTROL_TOTAL_MISMATCH: "Tổng tiền chi phí không khớp với tổng các dòng hạch toán.",
  DOCUMENT_ALLOCATION_INVALID: "Phân bổ chứng từ không hợp lệ.",
  DOCUMENT_ALLOCATION_MISMATCH: "Tổng tiền phân bổ không khớp với số tiền dòng chứng từ.",
  DOCUMENT_CONTROL_TOTAL_MISMATCH: "Tổng tiền chứng từ không khớp với tổng các dòng hạch toán.",
  PURCHASE_PRODUCT_VAT_RATE_INVALID: "Thuế suất GTGT hàng mua vào chỉ hỗ trợ 8% hoặc 10%.",
  EXPORT_CONTENT_PRUNED: "Bản xuất dữ liệu cũ đã hết hạn lưu trữ. Vui lòng tạo bản xuất mới.",
  NETWORK_ERROR: "Không thể kết nối tới máy chủ API. Vui lòng kiểm tra kết nối mạng và thử lại.",
  INVALID_JSON_RESPONSE: "Máy chủ trả về phản hồi không đúng định dạng JSON.",
};

const RAW_CODE_PATTERN = /^[A-Z0-9_]+$/;
const GENERIC_CLIENT_MESSAGE_PATTERNS = [
  /^API request failed with HTTP \d+$/i,
  /^API returned an invalid JSON response$/i,
  /^Network request failed$/i,
  /^Failed to fetch$/i,
  /^Load failed$/i,
  /^fetch failed$/i,
  /^Resource version conflict$/i,
  /^Idempotency key was reused with a different request$/i,
];
const VIETNAMESE_CHAR_PATTERN =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

export function normalizeApiErrorCode(value?: string): string {
  if (!value) return "";
  return value.trim().replaceAll(/\s+/g, "_").toUpperCase();
}

export function translateApiErrorCode(code?: string): string | undefined {
  const normalized = normalizeApiErrorCode(code);
  if (!normalized) return undefined;
  return VIETNAMESE_API_ERROR_MESSAGES[normalized];
}

function isRawOrBoilerplateMessage(message: string, code?: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  if (RAW_CODE_PATTERN.test(trimmed)) return true;
  if (code && normalizeApiErrorCode(trimmed) === normalizeApiErrorCode(code)) return true;
  return GENERIC_CLIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function resolveApiClientErrorMessage(input: {
  status: number;
  code?: string;
  message?: string;
}): string {
  const rawMessage = input.message?.trim() ?? "";
  if (
    rawMessage &&
    VIETNAMESE_CHAR_PATTERN.test(rawMessage) &&
    !RAW_CODE_PATTERN.test(rawMessage)
  ) {
    return rawMessage;
  }
  const translated = translateApiErrorCode(input.code) ?? translateApiErrorCode(rawMessage);
  if (translated) return translated;
  if (rawMessage && !isRawOrBoilerplateMessage(rawMessage, input.code)) {
    return rawMessage;
  }
  return input.message ?? `Yêu cầu API thất bại (HTTP ${input.status}).`;
}

export function formatApiErrorMessage(
  cause: unknown,
  fallback = "Không thể thực hiện thao tác. Vui lòng thử lại.",
): string {
  if (typeof cause === "string") {
    const trimmed = cause.trim();
    if (!trimmed) return fallback;
    const translated = translateApiErrorCode(trimmed);
    if (translated) return translated;
    if (RAW_CODE_PATTERN.test(trimmed)) return `${fallback} (${trimmed})`;
    return trimmed;
  }

  if (cause && typeof cause === "object") {
    const record = cause as { code?: unknown; message?: unknown; status?: unknown };
    const code = typeof record.code === "string" ? record.code.trim() : "";
    const message = typeof record.message === "string" ? record.message.trim() : "";

    if (message && VIETNAMESE_CHAR_PATTERN.test(message) && !RAW_CODE_PATTERN.test(message)) {
      return message;
    }
    const translated = translateApiErrorCode(code) ?? translateApiErrorCode(message);
    if (translated) return translated;
    if (message && !isRawOrBoilerplateMessage(message, code)) {
      return message;
    }
    if (code && RAW_CODE_PATTERN.test(code)) {
      return `${fallback} (${code})`;
    }
  }

  return fallback;
}
