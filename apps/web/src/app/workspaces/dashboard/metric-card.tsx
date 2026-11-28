"use client";

import Link from "next/link";
import { useId } from "react";
import { ArrowRight, CalendarRange, Layers } from "lucide-react";
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
  type MetricScopeTone,
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
  trendLabel,
  scopeLabel,
  scopeTone,
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
  trendLabel?: string;
  scopeLabel?: string;
  scopeTone?: MetricScopeTone;
}) {
  const formattedStatus = formatStatusBadge(status);
  const trendGradientId = `metric-trend-${useId().replace(/:/g, "")}`;
  const resolvedVariant: MetricCardVariant = variant ?? (primary ? "primary" : "surface");
  const styles = metricCardVariantStyles[resolvedVariant];
  const ScopeIcon = scopeTone === "balance" ? Layers : CalendarRange;

  const cardElement = (
    <Card
      className={cn(
        "@container group relative flex h-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-3xl shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:shadow-lg active:scale-[0.99]",
        styles.card,
      )}
    >
      <CardHeader className="gap-2 pb-2">
        {scopeLabel ? (
          <div className="flex items-center">
            <Badge
              variant="outline"
              className={cn(
                "max-w-full gap-1 truncate text-[11px] font-medium",
                resolvedVariant === "surface" || resolvedVariant === "muted"
                  ? scopeTone === "balance"
                    ? "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                    : "border-primary/30 bg-primary/10 text-primary"
                  : styles.badge,
              )}
              title={scopeLabel}
            >
              <ScopeIcon aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">{scopeLabel}</span>
            </Badge>
          </div>
        ) : null}
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
        <p className="text-2xl font-semibold tracking-tight tabular-nums @[250px]:text-3xl">
          {value}
        </p>
        {trend && trend.length > 1 ? (
          <div className="mt-3 space-y-1">
            {trendLabel ? (
              <p className={cn("truncate text-[11px]", styles.description)}>{trendLabel}</p>
            ) : null}
            <div className="h-12 w-full" aria-label={trendLabel ?? "Xu hướng chỉ số"}>
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
