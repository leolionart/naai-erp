export const DEFAULT_SOLOPRENEUR_RECORD_REASON = "Chủ ghi sổ";
export const DEFAULT_AUTO_RECORD_REASON = "Tự động ghi sổ từ nguồn tích hợp";

export const ROUTINE_EXPENSE_ACTIONS = new Set(["submit", "approve", "post"]);
export const ROUTINE_DOCUMENT_ACTIONS = new Set([
  "capture",
  "validate",
  "verify",
  "approve",
  "issue",
  "post",
]);

export function resolveRoutineActionReason(
  reason: string | undefined,
  allowDefault: boolean,
): string {
  const trimmed = reason?.trim() ?? "";
  if (trimmed) return trimmed;
  return allowDefault ? DEFAULT_SOLOPRENEUR_RECORD_REASON : "";
}

export type DraftRecordKind = "expense" | "commercial_document";

export type DraftRecordReasonItem = Readonly<{
  code: string;
  message: string;
  field?: string;
}>;

export type RecordSingleDraftInput = Readonly<{
  reason?: string;
  requirePaymentEvidence?: boolean;
}>;

export type BatchDraftRecordItemInput = Readonly<{
  kind:
    | "expense"
    | "commercial_document"
    | "document"
    | "purchase_invoice"
    | "sales_invoice"
    | "credit_note";
  id: string;
}>;

export type BatchDraftRecordRequest = Readonly<{
  dryRun?: boolean;
  commit?: boolean;
  planHash?: string;
  reason?: string;
  requirePaymentEvidence?: boolean;
  items?: readonly BatchDraftRecordItemInput[];
}>;

export type BatchDraftRecordItemResult = Readonly<{
  kind: DraftRecordKind;
  id: string;
  documentType?: string;
  status: "ready" | "succeeded" | "blocked";
  eligible: boolean;
  resourceVersion: string | null;
  targetState: string | null;
  journalId: string | null;
  grossMinor: string | null;
  paymentEvidenceMissing?: boolean;
  warnings?: readonly string[];
  reasons: readonly DraftRecordReasonItem[];
}>;

export type DraftRecordingActorContext = Readonly<{
  organizationId: string;
  actorId: string;
  roles: readonly string[];
  correlationId: string;
}>;

export const DRAFT_RECORD_REASON_MESSAGES: Readonly<Record<string, string>> = {
  RESOURCE_NOT_FOUND: "Không tìm thấy bản ghi cần ghi sổ.",
  INVALID_EXPENSE_TRANSITION: "Chi phí không còn ở trạng thái nháp/chờ ghi sổ hợp lệ.",
  INVALID_DOCUMENT_TRANSITION: "Chứng từ không còn ở trạng thái nháp/chờ ghi sổ hợp lệ.",
  FOREIGN_CURRENCY_NOT_SUPPORTED:
    "Chỉ hỗ trợ ghi sổ theo tiền tệ gốc VND; vui lòng quy đổi sang VND trước khi nhập, ghi tỷ giá vào mô tả.",
  FISCAL_PERIOD_NOT_FOUND: "Ngày chứng từ chưa thuộc kỳ kế toán nào được mở trong hệ thống.",
  FISCAL_PERIOD_AMBIGUOUS:
    "Ngày chứng từ đang trùng nhiều kỳ kế toán. Vui lòng kiểm tra cấu hình năm tài chính.",
  PERIOD_HARD_LOCKED: "Kỳ kế toán đã khóa cứng. Cần mở lại kỳ theo quy trình trước khi ghi sổ.",
  PERIOD_SOFT_LOCKED:
    "Kỳ kế toán đang khóa mềm; chỉ chủ doanh nghiệp hoặc quản trị tài chính mới được phép ghi sổ.",
  COUNTER_ACCOUNT_MISSING:
    "Thiếu hoặc không tìm thấy tài khoản kế toán đối ứng đang hoạt động trên chi phí.",
  CONTROL_ACCOUNT_MISSING:
    "Thiếu hoặc không tìm thấy tài khoản đối ứng / công nợ đang hoạt động trên chứng từ.",
  OWNER_CURRENT_ACCOUNT_REQUIRED:
    "Chi phí chủ doanh nghiệp chi hộ yêu cầu tài khoản đối ứng công nợ chủ sở hữu (TK 3388) đã cấu hình.",
  EXPENSE_FUNDING_ACCOUNT_NOT_AVAILABLE:
    "Tài khoản tiền / ngân hàng thanh toán không tồn tại, đã ngưng hoạt động hoặc khác loại tiền tệ.",
  EXPENSE_FUNDING_ACCOUNT_MISMATCH:
    "Tài khoản tiền thanh toán không khớp với tài khoản kế toán đối ứng.",
  PURCHASE_FUNDING_ACCOUNT_NOT_AVAILABLE:
    "Tài khoản tiền / ngân hàng thanh toán của hóa đơn mua không tồn tại hoặc đã ngưng hoạt động.",
  EXPENSE_LINES_MISSING: "Chi phí chưa có dòng hạch toán nào.",
  DOCUMENT_LINES_MISSING: "Chứng từ chưa có dòng hạch toán nào.",
  POSTING_ACCOUNT_MISSING:
    "Thiếu hoặc không tìm thấy tài khoản hạch toán chi phí đang hoạt động trên dòng chi phí.",
  PRIMARY_ACCOUNT_MISSING:
    "Thiếu hoặc không tìm thấy tài khoản hạch toán chính đang hoạt động trên dòng chứng từ.",
  VAT_ACCOUNT_MISSING:
    "Dòng có thuế GTGT nhưng thiếu hoặc không tìm thấy tài khoản thuế GTGT đang hoạt động.",
  EXPENSE_ALLOCATION_MISMATCH:
    "Tổng tiền phân bổ không khớp với số tiền trước thuế của dòng chi phí.",
  DOCUMENT_ALLOCATION_MISMATCH:
    "Tổng tiền phân bổ không khớp với số tiền trước thuế của dòng chứng từ.",
  VAT_EVIDENCE_REQUIRED: "Chi phí không hóa đơn không được khấu trừ thuế GTGT đầu vào.",
  EXPENSE_EVIDENCE_INCOMPLETE:
    "Chi phí thiếu chứng từ gốc hoặc tham chiếu nguồn ngoài (Paperless/n8n) bắt buộc theo loại chi phí.",
  PAYMENT_EVIDENCE_REQUIRED:
    "Thiếu bằng chứng thanh toán không dùng tiền mặt hợp lệ cho khoản chi từ ngưỡng quy định.",
  FREELANCE_EXPENSE_RELATIONSHIPS_REQUIRED:
    "Chi phí freelancer bắt buộc phải có đối tác nhận tiền và hạn thanh toán.",
  FREELANCER_ROLE_REQUIRED: "Đối tác thụ hưởng chưa được gán vai trò freelancer trong danh bạ.",
  FREELANCE_EXPENSE_PROJECT_REQUIRED:
    "Chi phí freelancer bắt buộc phải phân bổ vào đúng một dự án đang hoạt động.",
  SALES_INVOICE_PROJECT_REQUIRED: "Hóa đơn bán ra bắt buộc phải phân bổ vào dự án.",
  SALES_INVOICE_PROJECT_INVALID: "Dự án phân bổ trên hóa đơn bán ra không tồn tại hoặc đã đóng.",
  SALES_INVOICE_PROJECT_CUSTOMER_MISMATCH:
    "Khách hàng trên hóa đơn bán ra không khớp với khách hàng của dự án.",
  SALES_INVOICE_CONTRACT_CURRENCY_MISMATCH:
    "Tiền tệ của hóa đơn bán ra không khớp với tiền tệ của dự án/hợp đồng.",
  SALES_INVOICE_CONTRACT_REQUIRED:
    "Dự án chưa có giá trị hợp đồng hiệu lực để xuất hóa đơn bán ra.",
  SALES_INVOICE_CONTRACT_CAP_EXCEEDED:
    "Tổng giá trị xuất hóa đơn vượt quá trần giá trị hợp đồng đã duyệt của dự án.",
  CREDIT_ORIGINAL_INVALID:
    "Hóa đơn gốc của hóa đơn điều chỉnh giảm không hợp lệ hoặc chưa phát hành.",
  CREDIT_ORIGINAL_MISMATCH:
    "Khách hàng hoặc tiền tệ của hóa đơn điều chỉnh giảm không khớp với hóa đơn gốc.",
  CREDIT_EXCEEDS_REMAINING: "Giá trị điều chỉnh giảm vượt quá số dư còn lại của hóa đơn gốc.",
  CREDIT_ORIGINAL_LINE_REQUIRED: "Dòng điều chỉnh giảm bắt buộc phải chỉ rõ dòng hóa đơn gốc.",
  CREDIT_ORIGINAL_LINE_INVALID:
    "Dòng hóa đơn gốc được tham chiếu không tồn tại hoặc lệch tài khoản hạch toán.",
  JOURNAL_UNBALANCED: "Bút toán sinh ra không cân đối Nợ / Có.",
};

export function makeReason(
  code: string,
  field?: string,
  customMessage?: string,
): DraftRecordReasonItem {
  return {
    code,
    message:
      customMessage ?? DRAFT_RECORD_REASON_MESSAGES[code] ?? `Không đủ điều kiện ghi sổ (${code}).`,
    ...(field ? { field } : {}),
  };
}

export type DraftRecordBlockedError = Error & {
  code: string;
  userMessage: string;
  details: {
    kind: DraftRecordKind;
    id: string;
    reasons: readonly DraftRecordReasonItem[];
  };
};

export function createDraftRecordBlockedError(
  kind: DraftRecordKind,
  id: string,
  reasons: readonly DraftRecordReasonItem[],
): DraftRecordBlockedError {
  const error = new Error("DRAFT_RECORD_BLOCKED") as DraftRecordBlockedError;
  error.code = "DRAFT_RECORD_BLOCKED";
  error.userMessage = reasons.map((item) => item.message).join(" ");
  error.details = { kind, id, reasons };
  return error;
}
