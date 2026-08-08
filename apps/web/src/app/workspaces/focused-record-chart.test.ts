import { describe, expect, it } from "vitest";
import { buildFocusedRecordChartPoints } from "./focused-record-chart";

const name = (code?: string) =>
  ({ SOFTWARE_DEV: "Phát triển phần mềm", DOMAIN: "Tên miền", VPS: "Máy chủ VPS" })[code ?? ""] ??
  code ??
  "";

describe("focused revenue and expense category chart", () => {
  it("groups every document line by its canonical dimension instead of using the first line", () => {
    expect(
      buildFocusedRecordChartPoints(
        [
          {
            __sourceKind: "documents",
            type: "sales_invoice",
            document_date: "2026-08-08",
            lines: [
              { gross_minor: "100", dimensions: { category: "SOFTWARE_DEV" } },
              { gross_minor: "40", dimensions: { category: "DOMAIN" } },
            ],
          },
        ],
        name,
      ),
    ).toEqual([
      {
        month: "Tháng 08/2026",
        categories: { "Phát triển phần mềm": 100n, "Tên miền": 40n },
      },
    ]);
  });

  it("uses the canonical category returned by the expense list API", () => {
    expect(
      buildFocusedRecordChartPoints(
        [
          {
            __sourceKind: "expenses",
            expense_date: "2026-07-15",
            gross_minor: "250",
            category: "VPS",
          },
        ],
        name,
      )[0]?.categories,
    ).toEqual({ "Máy chủ VPS": 250n });
  });

  it("labels missing dimensions explicitly instead of inventing a business category", () => {
    expect(
      buildFocusedRecordChartPoints(
        [
          {
            __sourceKind: "documents",
            type: "sales_invoice",
            document_date: "2026-06-01",
            gross_minor: "90",
          },
        ],
        name,
      )[0]?.categories,
    ).toEqual({ "Doanh thu chưa phân loại": 90n });
  });
});
