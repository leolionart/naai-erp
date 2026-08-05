import { formatMinorVnd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MoneyCell({
  minor,
  className,
}: Readonly<{ minor: bigint | number | string; className?: string }>) {
  return (
    <span className={cn("block text-right tabular-nums", className)}>{formatMinorVnd(minor)}</span>
  );
}
