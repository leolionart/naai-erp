import { describe, expect, it } from "vitest";
import { buildFocusedRecordChartPoints } from "./focused-record-chart";

const name = (code?: string) =>
  ({
    SOFTWARE_DEV: "Phát triển phần mềm",
    DOMAIN: "Tên miền",
    VPS: "Máy chủ VPS",
    VEHICLE_RENTAL: "Thuê xe",
    SERVER_CLOUD: "Máy chủ / Cloud",
  })[code ?? ""] ??
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

  it("groups API-created expenses by their canonical line categories", () => {
    expect(
      buildFocusedRecordChartPoints(
        [
          {
            __sourceKind: "expenses",
            expense_date: "2026-07-15",
            lines: [
              { gross_minor: "250", expense_category_code: "VPS" },
              { gross_minor: "100", dimensions: { category: "DOMAIN" } },
            ],
          },
        ],
        name,
      )[0]?.categories,
    ).toEqual({ "Máy chủ VPS": 250n, "Tên miền": 100n });
  });

  it("reads owning-line snake_case category fields used by homepage list payloads", () => {
    expect(
      buildFocusedRecordChartPoints(
        [
          {
            __sourceKind: "documents",
            document_date: "2026-08-01",
            lines: [{ gross_minor: "408601", category_code: "VEHICLE_RENTAL" }],
          },
          {
            __sourceKind: "expenses",
            expense_date: "2026-08-01",
            lines: [{ gross_minor: "200000", expense_category_code: "SERVER_CLOUD" }],
          },
        ],
        name,
      ),
    ).toEqual([
      {
        month: "Tháng 08/2026",
        categories: { "Thuê xe": 408601n, "Máy chủ / Cloud": 200000n },
      },
    ]);
  });
  it("uses allocation amounts when legacy category exists only on allocations", () => {
    expect(
      buildFocusedRecordChartPoints(
        [
          {
            __sourceKind: "documents",
            document_date: "2026-08-01",
            lines: [
              {
                gross_minor: "408601",
                allocations: [
                  {
                    amount_minor: "200000",
                    dimensions: { category: "VEHICLE_RENTAL" },
                  },
                  {
                    amount_minor: "208601",
                    dimensions: { category: "SERVER_CLOUD" },
                  },
                ],
              },
            ],
          },
        ],
        name,
      )[0]?.categories,
    ).toEqual({ "Thuê xe": 200000n, "Máy chủ / Cloud": 208601n });
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

  it("nets credit notes and skips cancelled or rejected records", () => {
    const points = buildFocusedRecordChartPoints(
      [
        {
          __sourceKind: "documents",
          type: "sales_invoice",
          state: "posted",
          document_date: "2026-06-01",
          gross_minor: "1000",
        },
        {
          __sourceKind: "documents",
          type: "credit_note",
          state: "posted",
          document_date: "2026-06-02",
          gross_minor: "300",
        },
        {
          __sourceKind: "documents",
          type: "sales_invoice",
          state: "cancelled",
          document_date: "2026-06-03",
          gross_minor: "9999",
        },
        {
          __sourceKind: "expenses",
          state: "rejected",
          expense_date: "2026-06-04",
          gross_minor: "7777",
        },
      ],
      name,
    );
    expect(points).toHaveLength(1);
    expect(points[0]?.categories).toEqual({
      "Doanh thu chưa phân loại": 1000n,
      "Giảm trừ hóa đơn": -300n,
    });
  });
});
