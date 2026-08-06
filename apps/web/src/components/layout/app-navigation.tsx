"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BanknoteIcon,
  BookOpenIcon,
  BoxesIcon,
  FileTextIcon,
  GaugeIcon,
  MenuIcon,
  ReceiptTextIcon,
  WalletCardsIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { adminNavigation, isNavigationAvailable, type NavigationIcon } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const icons = {
  overview: GaugeIcon,
  folder: BoxesIcon,
  ledger: BookOpenIcon,
  invoice: FileTextIcon,
  expense: ReceiptTextIcon,
  bank: BanknoteIcon,
  report: WalletCardsIcon,
} satisfies Record<NavigationIcon, typeof GaugeIcon>;

function NavigationContent({ pathname }: { pathname: string }) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 border-b px-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
          N
        </span>
        <div className="flex min-w-0 flex-col">
          <strong className="truncate text-sm">NAAI ERP</strong>
          <span className="truncate text-xs text-muted-foreground">Finance operations</span>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-5 p-3" aria-label="Điều hướng chính">
          {adminNavigation.map((group) => (
            <div className="flex flex-col gap-1" key={group.key}>
              <span className="px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {group.label}
              </span>
              {group.items.map((item) => {
                const Icon = icons[item.icon];
                const available = isNavigationAvailable(item);
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const content = (
                  <span
                    className={cn(
                      "flex min-h-10 w-full items-center gap-3 rounded-md px-2.5 text-sm transition-colors",
                      active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                      available && !active && "hover:bg-sidebar-accent/70",
                      !available && "cursor-not-allowed text-muted-foreground/60",
                    )}
                  >
                    <Icon aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </span>
                );
                return available ? (
                  <Link href={item.href} aria-current={active ? "page" : undefined} key={item.key}>
                    {content}
                  </Link>
                ) : (
                  <Tooltip key={item.key}>
                    <TooltipTrigger asChild>
                      <span aria-disabled="true">{content}</span>
                    </TooltipTrigger>
                    <TooltipContent>{item.description}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </nav>
      </ScrollArea>
      <div className="border-t p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            AT
          </span>
          <div className="flex min-w-0 flex-col">
            <strong className="truncate text-xs">Ái Trần</strong>
            <span className="truncate text-xs text-muted-foreground">Owner · NAAI Studio</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppNavigation() {
  const pathname = usePathname();
  return (
    <>
      <aside className="app-sidebar hidden border-r md:block">
        <NavigationContent pathname={pathname} />
      </aside>
      <div className="mobile-app-bar border-b bg-background/95 backdrop-blur md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Mở menu chính">
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(88vw,19rem)] p-0">
            <SheetTitle className="sr-only">Điều hướng NAAI ERP</SheetTitle>
            <NavigationContent pathname={pathname} />
          </SheetContent>
        </Sheet>
        <strong>NAAI ERP</strong>
        <Badge variant="secondary">Local</Badge>
      </div>
    </>
  );
}
