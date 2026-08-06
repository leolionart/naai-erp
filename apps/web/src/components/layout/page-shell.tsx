import type { ReactNode } from "react";
import { SkipLink } from "./skip-link";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { MenuIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
      <div className={cn("app-shell flex min-h-svh w-full", className)}>
        <SkipLink href={`#${mainId}`} />
        {navigation}
        <SidebarInset
          className={cn("workspace flex flex-col flex-1", contentClassName)}
          id={mainId}
          tabIndex={-1}
        >
          <div className="mobile-app-bar border-b bg-background/95 backdrop-blur md:hidden">
            <SidebarTrigger aria-label="Mở menu chính">
              <MenuIcon />
            </SidebarTrigger>
            <strong>NAAI ERP</strong>
            <Badge variant="secondary">Local</Badge>
          </div>
          {banner}
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
