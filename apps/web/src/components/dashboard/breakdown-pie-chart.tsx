"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type BreakdownItem = Readonly<{
  name: string;
  valueMinor: bigint;
  formattedValue: string;
  color: string;
}>;

export function BreakdownPieChart({
  title,
  description,
  items,
  currency = "VND",
}: Readonly<{
  title: string;
  description: string;
  items: readonly BreakdownItem[];
  currency?: string;
}>) {
  const totalMinor = useMemo(() => items.reduce((acc, item) => acc + item.valueMinor, 0n), [items]);

  const chartData = useMemo(() => {
    return items.map((item) => {
      const valNum = Number(item.valueMinor);
      const percentage =
        totalMinor > 0n ? Number((item.valueMinor * 10000n) / totalMinor) / 100 : 0;
      return {
        name: item.name,
        value: valNum,
        formatted: item.formattedValue,
        percentage,
        color: item.color,
      };
    });
  }, [items, totalMinor]);

  const totalFormatted = useMemo(() => {
    return `${new Intl.NumberFormat("vi-VN").format(totalMinor)} ${currency === "VND" ? "₫" : currency}`;
  }, [totalMinor, currency]);

  if (!items.length || totalMinor === 0n) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Chưa có dữ liệu phân bổ trong kỳ
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
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-popover p-2.5 shadow-md text-xs">
                      <div className="font-medium text-popover-foreground">{data.name}</div>
                      <div className="mt-1 flex items-center justify-between gap-3 text-muted-foreground">
                        <span>Giá trị:</span>
                        <span className="font-mono font-semibold text-popover-foreground">
                          {data.formatted}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-3 text-muted-foreground">
                        <span>Tỷ trọng:</span>
                        <span className="font-mono font-semibold text-primary">
                          {data.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
          {chartData.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between rounded-md border p-2 bg-muted/30"
            >
              <div className="flex items-center gap-2 truncate">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate font-medium">{item.name}</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono font-medium">
                <span>{item.percentage.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
