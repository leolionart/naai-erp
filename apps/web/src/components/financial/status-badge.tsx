import { Badge } from "@/components/ui/badge";
import { formatStatus, statusTone } from "@/lib/format";

export function StatusBadge({ status }: Readonly<{ status: string }>) {
  const label = formatStatus(status);
  const tone = statusTone(status);
  return (
    <Badge variant={tone === "error" ? "destructive" : tone === "ready" ? "secondary" : "outline"}>
      {label}
    </Badge>
  );
}
