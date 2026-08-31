import type { ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type NaaiMarkProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "title"> & {
  title?: string;
};

/** The compact NAAI mark generated for the app brand and used by the app shell. */
export function NaaiMark({ title = "NAAI", className, ...props }: NaaiMarkProps) {
  return (
    <img
      src="/naai-mark-gpt-256.png"
      alt={title || undefined}
      role={title ? "img" : undefined}
      className={cn("size-8 shrink-0 rounded-[22%] object-cover", className)}
      {...props}
    />
  );
}

type NaaiLogoProps = {
  compact?: boolean;
  className?: string;
};

/** Shared wordmark so the sidebar and login surface cannot drift apart. */
export function NaaiLogo({ compact = false, className }: NaaiLogoProps) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <NaaiMark title="NAAI ERP" className="size-8" />
      {compact ? null : (
        <span className="grid min-w-0 text-left leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate font-semibold tracking-tight">NAAI ERP</span>
          <span className="truncate text-xs text-muted-foreground">Finance operations</span>
        </span>
      )}
    </span>
  );
}
