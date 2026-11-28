"use client";

import Link from "next/link";
import { useId } from "react";
import { ArrowRight } from "lucide-react";
import { Area, AreaChart } from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import {
  formatStatusBadge,
  metricCardVariantStyles,
  type MetricCardVariant,
} from "./dashboard-presentation";

export function MetricCard({
  title,
  value,
  description,
  href,
  status,
  provisional = false,
  primary = false,
  variant,
  onQuick,
  trend,
}: {
  title: string;
  value: string;
  description: string;
  href: string;
  status?: string;
  provisional?: boolean;
  primary?: boolean;
  variant?: MetricCardVariant;
  onQuick?: () => void;
  trend?: readonly number[];
}) {
  const formattedStatus = formatStatusBadge(status);
  const trendGradientId = `metric-trend-${useId().replace(/:/g, "")}`;
  const resolvedVariant: MetricCardVariant = variant ?? (primary ? "primary" : "surface");
  const styles = metricCardVariantStyles[resolvedVariant];

  const cardElement = (
    <Card
      className={cn(
        "group relative flex h-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-3xl shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:shadow-lg active:scale-[0.99]",
        styles.card,
      )}
    >
      <CardHeader className="gap-2 pb-2">
        <CardTitle
          className={cn(
            "line-clamp-2 min-h-10 text-base leading-5 transition-colors",
            styles.title,
          )}
        >
          {title}
        </CardTitle>
        <CardDescription className={cn("line-clamp-2 min-h-10", styles.description)}>
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto pb-4 pt-0">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
        {trend && trend.length > 1 ? (
          <div className="mt-3 h-12 w-full" aria-label="Xu hướng chỉ số">
            <ChartContainer
              config={
                { trend: { label: "Xu hướng", color: "var(--chart-1)" } } satisfies ChartConfig
              }
              className="h-full w-full aspect-auto"
              initialDimension={{ width: 260, height: 48 }}
            >
              <AreaChart data={trend.map((point, index) => ({ index, value: point }))}>
                <defs>
                  <linearGradient id={trendGradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={styles.trend} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={styles.trend} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={styles.trend}
                  fill={`url(#${trendGradientId})`}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="min-h-10 min-w-0 gap-1.5 overflow-hidden pb-4 pt-0">
        {provisional ? (
          <Badge
            variant="secondary"
            className={cn(
              "shrink-0 text-xs font-normal",
              resolvedVariant === "primary" &&
                "bg-primary-foreground/15 text-primary-foreground ring-primary-foreground/25",
              resolvedVariant === "danger" &&
                "bg-destructive-foreground/15 text-destructive-foreground ring-destructive-foreground/25",
            )}
          >
            Tạm tính
          </Badge>
        ) : null}
        {formattedStatus ? (
          <Badge
            variant="outline"
            className={cn("min-w-0 max-w-full truncate text-xs font-normal", styles.badge)}
            title={formattedStatus}
          >
            {formattedStatus}
          </Badge>
        ) : null}
        <span
          className={cn(
            "ml-auto flex size-8 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5",
            styles.arrow,
          )}
        >
          <ArrowRight className="size-4" />
        </span>
      </CardFooter>
    </Card>
  );

  if (onQuick) {
    return (
      <div
        onClick={onQuick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onQuick();
        }}
        className="h-full"
      >
        {cardElement}
      </div>
    );
  }

  return (
    <Link href={href} className="block h-full no-underline">
      {cardElement}
    </Link>
  );
}
