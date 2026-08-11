import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FinancialDataTable } from "./financial-data-table";
import { KpiCard } from "./kpi-card";
import { MoneyCell } from "./money-cell";
import { StatusBadge } from "./status-badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

describe("ERP-345 financial design-system compositions", () => {
  it("renders exact money, localized state and a typed table", () => {
    const html = renderToStaticMarkup(
      <FinancialDataTable
        rows={[{ id: "row-1", minor: "9007199254740993", state: "posted" }]}
        rowKey={(row) => row.id}
        columns={[
          {
            id: "amount",
            header: "Số tiền",
            align: "right",
            cell: (row) => <MoneyCell minor={row.minor} />,
          },
          { id: "state", header: "Trạng thái", cell: (row) => <StatusBadge status={row.state} /> },
        ]}
      />,
    );
    expect(html).toContain("9.007.199.254.740.993");
    expect(html).toContain("Đã vào sổ");
    expect(html).toContain("Số tiền");
    expect(html).toContain('data-slot="configurable-table"');
    expect(html).toContain("min-w-0");
  });

  it("provides accessible empty, loading and KPI states", () => {
    expect(
      renderToStaticMarkup(<FinancialDataTable rows={[]} rowKey={() => "none"} columns={[]} />),
    ).toContain("Chưa có dữ liệu");
    expect(
      renderToStaticMarkup(
        <FinancialDataTable rows={[]} rowKey={() => "none"} columns={[]} loading />,
      ),
    ).toContain("Đang tải dữ liệu");
    expect(
      renderToStaticMarkup(<KpiCard title="Doanh thu" period="Tháng này" value="120.000.000 ₫" />),
    ).toContain("Doanh thu");
  });

  it("keeps shared card compositions shrinkable inside responsive grids", () => {
    const html = renderToStaticMarkup(
      <Card>
        <CardHeader>Tiêu đề rất dài</CardHeader>
        <CardContent>Nội dung</CardContent>
      </Card>,
    );
    expect(html.match(/min-w-0/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("grid-cols-[minmax(0,1fr)_auto]");
  });
});
