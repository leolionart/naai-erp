"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type DateRangePreset = "today" | "this_week" | "this_month" | "this_quarter" | "this_year";

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getDatePresetRange(
  preset: DateRangePreset,
  baseDate: Date = new Date(),
): { startsOn: string; endsOn: string } {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const date = baseDate.getDate();

  switch (preset) {
    case "today": {
      const todayStr = formatDate(baseDate);
      return { startsOn: todayStr, endsOn: todayStr };
    }
    case "this_week": {
      const day = baseDate.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(baseDate);
      monday.setDate(date + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { startsOn: formatDate(monday), endsOn: formatDate(sunday) };
    }
    case "this_month": {
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      return { startsOn: formatDate(firstDay), endsOn: formatDate(lastDay) };
    }
    case "this_quarter": {
      const qStartMonth = Math.floor(month / 3) * 3;
      const firstDay = new Date(year, qStartMonth, 1);
      const lastDay = new Date(year, qStartMonth + 3, 0);
      return { startsOn: formatDate(firstDay), endsOn: formatDate(lastDay) };
    }
    case "this_year": {
      const firstDay = new Date(year, 0, 1);
      const lastDay = new Date(year, 11, 31);
      return { startsOn: formatDate(firstDay), endsOn: formatDate(lastDay) };
    }
  }
}

export type QuickDatePresetButtonsProps = Readonly<{
  onSelectRange: (startsOn: string, endsOn: string) => void;
  className?: string;
  label?: string;
}>;

export function QuickDatePresetButtons({
  onSelectRange,
  className,
  label = "Chọn nhanh thời gian",
}: QuickDatePresetButtonsProps) {
  function handlePresetClick(preset: DateRangePreset) {
    const range = getDatePresetRange(preset);
    onSelectRange(range.startsOn, range.endsOn);
  }

  return (
    <div className={cn("grid gap-1.5", className)}>
      {label ? <Label className="text-xs text-muted-foreground">{label}</Label> : null}
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs font-normal"
          onClick={() => handlePresetClick("today")}
        >
          Hôm nay
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs font-normal"
          onClick={() => handlePresetClick("this_week")}
        >
          Tuần này
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs font-normal"
          onClick={() => handlePresetClick("this_month")}
        >
          Tháng này
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs font-normal"
          onClick={() => handlePresetClick("this_quarter")}
        >
          Quý này
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs font-normal"
          onClick={() => handlePresetClick("this_year")}
        >
          Năm nay
        </Button>
      </div>
    </div>
  );
}
