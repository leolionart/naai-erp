import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

type NaaiMarkProps = SVGProps<SVGSVGElement> & {
  title?: string;
};

/** The compact NAAI mark used by the app shell and browser chrome. */
export function NaaiMark({ title = "NAAI", className, ...props }: NaaiMarkProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
      className={cn("size-8 shrink-0", className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <rect width="40" height="40" rx="11" fill="currentColor" />
      <path
        d="M11 29V11h4.8l9.2 11.76V11H29v18h-4.8L15.8 17.24V29H11Z"
        fill="var(--naai-mark-foreground, #d9f99d)"
      />
      <path d="M11 29h18" stroke="var(--naai-mark-accent, #a3e635)" strokeWidth="2" />
    </svg>
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
