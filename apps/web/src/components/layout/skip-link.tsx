import type { AnchorHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type SkipLinkProps = Readonly<AnchorHTMLAttributes<HTMLAnchorElement>>;

export function SkipLink({
  children = "Bỏ qua điều hướng",
  className,
  href = "#main-content",
  ...props
}: SkipLinkProps) {
  return (
    <a
      className={cn(
        "fixed top-4 left-4 z-50 -translate-y-24 rounded-md bg-primary px-3 py-2 text-primary-foreground focus-visible:translate-y-0",
        className,
      )}
      href={href}
      {...props}
    >
      {children}
    </a>
  );
}
