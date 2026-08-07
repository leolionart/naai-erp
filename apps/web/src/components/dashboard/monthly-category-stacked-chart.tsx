"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type StackedCategoryPoint = Readonly<{
  month: string; // e.g. "2026-08" or "Tháng 8/2026"
  categories: Record<string, bigint>; // categoryName -> minorAmount
}>;

const CATEGORY_COLORS = [
  "var(--chart-1, #2563eb)",
  "var(--chart-2, #16a34a)",
  "var(--chart-3, #d97706)",
  "var(--chart-4, #dc2626)",
  "var(--chart-5, #9333ea)",
  "var(--chart-6, #0891b2)",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
];

const compactMoney = new Intl.NumberFormat("vi-VN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function MonthlyCategoryStackedChart({
  title,
  description,
  points,
  currency = "VND",
}: Readonly<{
  title: string;
  description: string;
  points: readonly StackedCategoryPoint[];
  currency?: string;
}>) {
  // Collect all unique categories across all months
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const point of points) {
      for (const cat of Object.keys(point.categories)) {
        set.add(cat);
      }
    }
    return [...set];
  }, [points]);

  // Format data for Recharts Stacked Bar Chart
  const chartData = useMemo(() => {
    return points.map((point) => {
      const row: Record<string, string | number> = { month: point.month };
      let totalMinor = 0n;
      for (const cat of allCategories) {
        const valMinor = point.categories[cat] ?? 0n;
        row[cat] = Number(valMinor);
        totalMinor += valMinor;
      }
      row.__totalMinor = totalMinor.toString();
      return row;
    });
  }, [points, allCategories]);

  const grandTotalMinor = useMemo(() => {
    return points.reduce((total, p) => {
      return total + Object.values(p.categories).reduce((acc, v) => acc + v, 0n);
    }, 0n);
  }, [points]);

  const totalFormatted = useMemo(() => {
    return `${new Intl.NumberFormat("vi-VN").format(grandTotalMinor)} ${currency === "VND" ? "₫" : currency}`;
  }, [grandTotalMinor, currency]);

  if (!points.length || grandTotalMinor === 0n) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          Chưa có dữ liệu phân bổ theo tháng
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          <span className="text-xs font-mono font-medium text-muted-foreground">
            Tổng: {totalFormatted}
          </span>
        </div>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={64}
                tickFormatter={(val) => compactMoney.format(Number(val))}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const total = payload.reduce((acc, item) => acc + (Number(item.value) || 0), 0);
                  return (
                    <div className="rounded-lg border bg-popover p-3 shadow-md text-xs min-w-48">
                      <div className="font-semibold text-popover-foreground mb-2">{label}</div>
                      <div className="flex flex-col gap-1.5 border-b pb-2 mb-2">
                        {payload.map((entry) => {
                          const valNum = Number(entry.value) || 0;
                          const pct = total > 0 ? (valNum / total) * 100 : 0;
                          return (
                            <div
                              key={entry.name}
                              className="flex items-center justify-between gap-3 text-muted-foreground"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span
                                  className="size-2 rounded-full shrink-0"
                                  style={{ backgroundColor: entry.color }}
                                />
                                <span className="truncate">{entry.name}:</span>
                              </div>
                              <span className="font-mono font-medium text-popover-foreground">
                                {new Intl.NumberFormat("vi-VN").format(valNum)} ₫ ({pct.toFixed(1)}
                                %)
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between items-center font-semibold text-popover-foreground">
                        <span>Tổng tháng:</span>
                        <span className="font-mono">
                          {new Intl.NumberFormat("vi-VN").format(total)} ₫
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: "12px", fontSize: "12px" }}
                formatter={(value) => (
                  <span className="text-xs text-foreground font-medium">{value}</span>
                )}
              />
              {allCategories.map((cat, idx) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  name={cat}
                  stackId="categoryStack"
                  fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}
                  radius={idx === allCategories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
