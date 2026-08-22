import { Badge } from "@/components/ui/badge";
import { formatStatus, statusTone } from "@/lib/format";

export function StatusBadge({ status }: Readonly<{ status: string }>) {
  const label = formatStatus(status);
  const tone = statusTone(status);
  const variant = {
    error: "destructive",
    ready: "success",
    warning: "warning",
    info: "info",
    muted: "muted",
  } as const;
  return (
    <Badge
      variant={variant[tone]}
      aria-label={`Trạng thái: ${label}`}
      className="h-6 rounded-full px-2.5 text-[11px] font-semibold tracking-tight shadow-none"
    >
      {label}
    </Badge>
  );
}
