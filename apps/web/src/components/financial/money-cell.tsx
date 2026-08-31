import { formatMinorVnd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MoneyCell({
  minor,
  className,
  signed = false,
}: Readonly<{ minor: bigint | number | string; className?: string; signed?: boolean }>) {
  const value = typeof minor === "bigint" ? minor : BigInt(String(minor || "0"));
  return (
    <span
      className={cn(
        "block text-right tabular-nums",
        value < 0n && "text-destructive",
        signed && value > 0n && "text-emerald-700 dark:text-emerald-400",
        className,
      )}
      data-sign={value < 0n ? "outflow" : value > 0n && signed ? "inflow" : "zero"}
    >
      {formatMinorVnd(minor)}
    </span>
  );
}
