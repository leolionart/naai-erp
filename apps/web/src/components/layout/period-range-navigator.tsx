"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type PeriodKind = "year" | "quarter" | "month";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthEndStr(year: number, monthNum: number): string {
  return new Date(Date.UTC(year, monthNum, 0)).toISOString().slice(0, 10);
}

export function getPeriodRangeDetails(anchorMonth: string, kind: PeriodKind) {
  const [yearStr, monthStr] = anchorMonth.split("-");
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || new Date().getMonth() + 1;

  if (kind === "year") {
    return {
      label: `${year}`,
      startsOn: `${year}-01-01`,
      endsOn: `${year}-12-31`,
    };
  }

  if (kind === "quarter") {
    const quarter = Math.ceil(month / 3);
    const startMonthNum = (quarter - 1) * 3 + 1;
    const endMonthNum = quarter * 3;
    const startMonthFormatted = String(startMonthNum).padStart(2, "0");
    return {
      label: `Q${quarter}/${year}`,
      startsOn: `${year}-${startMonthFormatted}-01`,
      endsOn: monthEndStr(year, endMonthNum),
    };
  }

  const monthFormatted = String(month).padStart(2, "0");
  return {
    label: `Tháng ${monthFormatted}/${year}`,
    startsOn: `${year}-${monthFormatted}-01`,
    endsOn: monthEndStr(year, month),
  };
}

export function shiftAnchorMonth(anchorMonth: string, kind: PeriodKind, delta: number): string {
  const [yearStr, monthStr] = anchorMonth.split("-");
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || new Date().getMonth() + 1;
  const step = kind === "year" ? 12 : kind === "quarter" ? 3 : 1;
  const shifted = new Date(Date.UTC(year, month - 1 + delta * step, 1));
  return shifted.toISOString().slice(0, 7);
}

export function PeriodRangeNavigator({
  className,
}: Readonly<{
  className?: string;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const periodKind = (searchParams.get("periodKind") as PeriodKind | null) ?? "year";

  const requestedAnchor = (
    searchParams.get("periodId") ??
    searchParams.get("startsOn") ??
    "2025-01"
  ).replace(/^CAL-/, "");

  const anchorMonth = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(requestedAnchor.slice(0, 7))
    ? requestedAnchor.slice(0, 7)
    : "2025-01";

  const periodDetails = useMemo(
    () => getPeriodRangeDetails(anchorMonth, periodKind),
    [anchorMonth, periodKind],
  );

  const isFuture = useMemo(() => {
    const nextAnchor = shiftAnchorMonth(anchorMonth, periodKind, 1);
    const details = getPeriodRangeDetails(nextAnchor, periodKind);
    return details.startsOn > todayStr();
  }, [anchorMonth, periodKind]);

  const handlePeriodChange = useCallback(
    (nextKind: PeriodKind, delta = 0) => {
      const nextAnchor = shiftAnchorMonth(anchorMonth, nextKind, delta);
      const details = getPeriodRangeDetails(nextAnchor, nextKind);

      const next = new URLSearchParams(searchParams.toString());
      next.set("periodKind", nextKind);
      next.set("period", details.label);
      next.set("periodId", `CAL-${nextAnchor}`);
      next.set("startsOn", details.startsOn);
      next.set("endsOn", details.endsOn);
      next.set("asOfInstant", new Date().toISOString());

      router.replace(`${pathname}?${next.toString()}`);
    },
    [anchorMonth, pathname, router, searchParams],
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <ToggleGroup
        type="single"
        value={periodKind}
        onValueChange={(val: string) => val && handlePeriodChange(val as PeriodKind, 0)}
        variant="outline"
        size="sm"
        aria-label="Chọn cấp kỳ"
      >
        <ToggleGroupItem value="year" className="h-8 text-xs font-medium px-3">
          Năm
        </ToggleGroupItem>
        <ToggleGroupItem value="quarter" className="h-8 text-xs font-medium px-3">
          Quý
        </ToggleGroupItem>
        <ToggleGroupItem value="month" className="h-8 text-xs font-medium px-3">
          Tháng
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className="h-8 w-8"
          aria-label="Kỳ trước"
          onClick={() => handlePeriodChange(periodKind, -1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Badge
          variant="outline"
          className="h-8 min-w-28 justify-center font-mono text-xs font-semibold px-3 bg-background"
        >
          {periodDetails.label}
        </Badge>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className="h-8 w-8"
          aria-label="Kỳ sau"
          onClick={() => handlePeriodChange(periodKind, 1)}
          disabled={isFuture}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
