import type { ReactNode } from "react";
import { SkipLink } from "./skip-link";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type PageShellProps = Readonly<{
  children: ReactNode;
  navigation?: ReactNode;
  banner?: ReactNode;
  className?: string;
  contentClassName?: string;
  mainId?: string;
}>;

export function PageShell({
  children,
  navigation,
  banner,
  className,
  contentClassName,
  mainId = "main-content",
}: PageShellProps) {
  return (
    <SidebarProvider>
      <SkipLink href={`#${mainId}`} />
      {navigation}
      <SidebarInset
        className={cn("overflow-x-clip", className, contentClassName)}
        id={mainId}
        tabIndex={-1}
      >
        {banner}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
