"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BanknoteIcon,
  BookOpenIcon,
  BoxesIcon,
  BriefcaseBusinessIcon,
  FileTextIcon,
  GaugeIcon,
  ListChecksIcon,
  ReceiptTextIcon,
  UsersIcon,
  WalletCardsIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { adminNavigation, isNavigationAvailable, type NavigationIcon } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const icons = {
  overview: GaugeIcon,
  folder: BoxesIcon,
  ledger: BookOpenIcon,
  invoice: FileTextIcon,
  expense: ReceiptTextIcon,
  bank: BanknoteIcon,
  report: WalletCardsIcon,
  customer: UsersIcon,
  project: BriefcaseBusinessIcon,
  review: ListChecksIcon,
} satisfies Record<NavigationIcon, typeof GaugeIcon>;

export function AppNavigation() {
  const pathname = usePathname();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="pointer-events-none">
              <div className="flex items-center gap-3">
                <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shrink-0">
                  N
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold text-sm">NAAI ERP</span>
                  <span className="truncate text-xs text-muted-foreground">Finance operations</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {adminNavigation.map((group) => (
          <SidebarGroup key={group.key}>
            <SidebarGroupLabel className="px-2">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = icons[item.icon];
                  const available = isNavigationAvailable(item);
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const button = (
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={available ? item.label : undefined}
                      className={cn(
                        !available &&
                          "cursor-not-allowed text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground/60 active:bg-transparent active:text-muted-foreground/60",
                      )}
                    >
                      {available ? (
                        <Link href={item.href} aria-current={active ? "page" : undefined}>
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      ) : (
                        <span aria-disabled="true" className="flex w-full items-center gap-2">
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </span>
                      )}
                    </SidebarMenuButton>
                  );
                  return available ? (
                    <SidebarMenuItem key={item.key}>{button}</SidebarMenuItem>
                  ) : (
                    <SidebarMenuItem key={item.key}>
                      <Tooltip>
                        <TooltipTrigger asChild>{button}</TooltipTrigger>
                        <TooltipContent side="right">{item.description}</TooltipContent>
                      </Tooltip>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold shrink-0">
                AT
              </div>
              <div className="grid flex-1 text-left text-xs leading-tight">
                <span className="truncate font-semibold text-xs">Ái Trần</span>
                <span className="truncate text-xs text-muted-foreground">Owner · NAAI Studio</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
