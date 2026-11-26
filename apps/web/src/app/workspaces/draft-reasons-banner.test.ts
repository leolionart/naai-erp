import { describe, expect, it } from "vitest";
import { extractDraftReasons } from "./draft-reasons-banner";

describe("ERP-990 extractDraftReasons", () => {
  it("extracts structured reasons for draft records across camelCase and snake_case", () => {
    expect(
      extractDraftReasons({
        id: "exp-1",
        state: "draft",
        reasons: [
          {
            code: "PERIOD_HARD_LOCKED",
            message: "Kỳ kế toán đã khóa cứng.",
            field: "expenseDate",
          },
          {
            code: "EXPENSE_EVIDENCE_INCOMPLETE",
            message: "Chi phí thiếu chứng từ gốc.",
          },
        ],
      }),
    ).toEqual([
      {
        code: "PERIOD_HARD_LOCKED",
        message: "Kỳ kế toán đã khóa cứng.",
        field: "expenseDate",
      },
      {
        code: "EXPENSE_EVIDENCE_INCOMPLETE",
        message: "Chi phí thiếu chứng từ gốc.",
      },
    ]);

    expect(
      extractDraftReasons({
        id: "doc-1",
        state: "draft",
        draft_reasons: [{ code: "SALES_INVOICE_PROJECT_REQUIRED", message: "Thiếu dự án." }],
      }),
    ).toEqual([{ code: "SALES_INVOICE_PROJECT_REQUIRED", message: "Thiếu dự án." }]);
  });

  it("hides stale reasons once a record has transitioned out of draft state", () => {
    expect(
      extractDraftReasons({
        id: "exp-2",
        state: "posted",
        reasons: [{ code: "PERIOD_HARD_LOCKED", message: "Kỳ kế toán đã khóa cứng." }],
      }),
    ).toEqual([]);
  });
});
