import type { CreateCommercialDocumentInput } from "./commercial-document.types.js";

export function validateCommercialDocumentFunding(input: CreateCommercialDocumentInput): void {
  if (!input.funding) return;
  const allowed = ["company_bank", "company_cash", "owner_paid", "owner_custody_cash"] as const;
  const type = input.funding.type;
  const fieldErrors: Array<{ field: string; message: string; expected?: readonly string[] }> = [];
  if (!allowed.includes(type))
    fieldErrors.push({
      field: "funding.type",
      message: "Nguồn tiền không được hỗ trợ",
      expected: allowed,
    });
  if (
    (type === "company_bank" || type === "company_cash" || type === "owner_custody_cash") &&
    !input.funding.financialAccountId?.trim()
  )
    fieldErrors.push({
      field: "funding.financialAccountId",
      message: "Bắt buộc khi chi từ ngân hàng công ty hoặc tiền mặt công ty do chủ giữ",
    });
  if (type === "owner_paid" && input.funding.financialAccountId)
    fieldErrors.push({
      field: "funding.financialAccountId",
      message: "Không truyền tài khoản công ty khi chủ chi hộ",
    });
  if (fieldErrors.length) {
    const error = new Error("FUNDING_SOURCE_INVALID") as Error & { details: unknown };
    error.details = { fieldErrors, allowedTypes: allowed };
    throw error;
  }
  if (input.type !== "purchase_invoice") {
    const error = new Error("FUNDING_SOURCE_INVALID") as Error & { details: unknown };
    error.details = {
      fieldErrors: [
        { field: "funding.type", message: "Nguồn tiền chỉ áp dụng cho hóa đơn đầu vào" },
      ],
    };
    throw error;
  }
}
