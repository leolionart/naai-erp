"use client";

import { useMemo } from "react";
import { getCategoryName } from "@/components/forms/document-expense-forms";
import { MonthlyCategoryStackedChart } from "@/components/dashboard/monthly-category-stacked-chart";
import { buildFocusedRecordChartPoints } from "@/app/workspaces/focused-record-chart";

export function ExpenseOverviewChart({
  rows,
  currency = "VND",
  href,
}: Readonly<{
  rows: readonly Record<string, unknown>[];
  currency?: string;
  href?: string;
}>) {
  const points = useMemo(() => buildFocusedRecordChartPoints(rows, getCategoryName), [rows]);
  return (
    <MonthlyCategoryStackedChart
      title="Tỷ trọng chi phí từng danh mục theo tháng"
      description="Chi phí mua vào và chi phí không hóa đơn được tổng hợp theo cùng danh mục nghiệp vụ canonical."
      points={points}
      currency={currency}
      href={href}
    />
  );
}
