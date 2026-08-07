"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type ChartPoint = Readonly<{ label: string; valueMinor: string }>;

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
  const data = useMemo(
    () =>
      points.map((point) => ({
        period: point.label,
        revenue: Number(BigInt(point.valueMinor)),
        valueMinor: point.valueMinor,
      })),
    [points],
  );
  const formatExact = (valueMinor: string) =>
    `${new Intl.NumberFormat("vi-VN").format(BigInt(valueMinor))} ${currency === "VND" ? "₫" : currency}`;

  return (
    <div className="flex flex-col gap-4">
      <div role="img" aria-label="Xu hướng doanh thu tương tác">
        <ChartContainer config={chartConfig} className="h-72 w-full aspect-auto">
          <AreaChart
            accessibilityLayer
            data={data}
            margin={{ top: 20, right: 16, left: 4, bottom: 0 }}
          >
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
              domain={[0, (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 1.25) : 100)]}
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
              type="monotone"
              fill="url(#revenue-gradient)"
              stroke="var(--color-revenue)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </div>
      <ul className="sr-only" aria-label="Giá trị doanh thu đang hiển thị">
        {points.map((point) => (
          <li key={`${point.label}:${point.valueMinor}`}>
            {point.label}: {formatExact(point.valueMinor)}
          </li>
        ))}
      </ul>
    </div>
  );
}
