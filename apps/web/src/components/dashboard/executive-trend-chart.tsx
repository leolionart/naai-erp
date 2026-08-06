"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ChartPoint = Readonly<{ label: string; valueMinor: string }>;
type TimeRange = "all" | "6" | "3";

const chartConfig = {
  revenue: {
    label: "Doanh thu",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const compactMoney = new Intl.NumberFormat("vi-VN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export default function ExecutiveTrendChart({
  points,
  currency,
}: {
  points: readonly ChartPoint[];
  currency: string;
}) {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const visiblePoints = useMemo(() => {
    if (timeRange === "all") return points;
    return points.slice(-Number(timeRange));
  }, [points, timeRange]);
  const data = useMemo(
    () =>
      visiblePoints.map((point) => ({
        period: point.label,
        revenue: Number(BigInt(point.valueMinor)),
        valueMinor: point.valueMinor,
      })),
    [visiblePoints],
  );
  const formatExact = (valueMinor: string) =>
    `${new Intl.NumberFormat("vi-VN").format(BigInt(valueMinor))} ${currency === "VND" ? "₫" : currency}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
          <SelectTrigger aria-label="Khoảng thời gian" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">Toàn bộ dữ liệu</SelectItem>
              <SelectItem value="6">6 tháng gần nhất</SelectItem>
              <SelectItem value="3">3 tháng gần nhất</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div role="img" aria-label="Xu hướng doanh thu tương tác">
        <ChartContainer config={chartConfig} className="h-72 w-full aspect-auto">
          <AreaChart accessibilityLayer data={data} margin={{ left: 4, right: 12 }}>
            <defs>
              <linearGradient id="revenue-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="period"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={64}
              tickFormatter={(value) => compactMoney.format(Number(value))}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelKey="period"
                  formatter={(_value, _name, item) => (
                    <div className="flex min-w-44 items-center justify-between gap-4">
                      <span className="text-muted-foreground">Doanh thu</span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatExact(String(item.payload.valueMinor))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Area
              dataKey="revenue"
              type="natural"
              fill="url(#revenue-gradient)"
              stroke="var(--color-revenue)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </div>
      <ul className="sr-only" aria-label="Giá trị doanh thu đang hiển thị">
        {visiblePoints.map((point) => (
          <li key={`${point.label}:${point.valueMinor}`}>
            {point.label}: {formatExact(point.valueMinor)}
          </li>
        ))}
      </ul>
    </div>
  );
}
