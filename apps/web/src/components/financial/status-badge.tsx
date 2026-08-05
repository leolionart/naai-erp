import { Badge } from "@/components/ui/badge";
import { formatStatus, statusTone } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: Readonly<{ status: string }>) {
  const label = formatStatus(status);
  const tone = statusTone(status);
  return (
    <Badge
      variant="outline"
      className={cn(
        tone === "ready" && "border-financial-positive/30 text-financial-positive",
        tone === "error" && "border-financial-negative/30 text-financial-negative",
        tone === "warning" && "border-financial-warning/30 text-financial-warning",
        tone === "info" && "border-financial-info/30 text-financial-info",
      )}
    >
      {label}
    </Badge>
  );
}
