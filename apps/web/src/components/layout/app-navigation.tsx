"use client";

import { cn } from "@/lib/utils";
import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArchiveRestoreIcon,
  ActivityIcon,
  BookMarkedIcon,
  BriefcaseIcon,
  CalculatorIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  DatabaseIcon,
  FileDownIcon,
  HandCoinsIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PackageIcon,
  PieChartIcon,
  ReceiptIcon,
  ReceiptTextIcon,
  Repeat2Icon,
  SunIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  adminNavigation,
  isNavigationAvailable,
  type NavigationChild,
  type NavigationIcon,
  type NavigationItem,
} from "@/lib/navigation";

const icons = {
  overview: LayoutDashboardIcon,
  "executive-metrics": TrendingUpIcon,
  folder: DatabaseIcon,
  "master-data": DatabaseIcon,
  "purchase-products": PackageIcon,
  "portable-data": ArchiveRestoreIcon,
  "activity-log": ActivityIcon,
  ledger: BookMarkedIcon,
  invoice: ReceiptIcon,
  expense: ReceiptTextIcon,
  bank: LandmarkIcon,
  report: PieChartIcon,
  debt: HandCoinsIcon,
  "financial-statements": CalculatorIcon,
  "accountant-exports": FileDownIcon,
  customer: UsersIcon,
  project: BriefcaseIcon,
  subscription: Repeat2Icon,
  review: ListChecksIcon,
} satisfies Record<NavigationIcon, typeof LayoutDashboardIcon>;

function NavigationUser() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { isMobile } = useSidebar();

  async function logout() {
    try {
      await fetch("/auth/session", { method: "DELETE" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">AT</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Ái Trần</span>
                <span className="truncate text-xs">Owner · NAAI Studio</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side={isMobile ? "bottom" : "right"} sideOffset={4}>
            <DropdownMenuLabel>NAAI Studio</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => setTheme("light")}>
                <SunIcon />
                Sáng
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTheme("dark")}>
                <MoonIcon />
                Tối
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTheme("system")}>
                <MonitorIcon />
                Theo hệ thống
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()}>
              <LogOutIcon />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

type CollapsedHoverMenuProps = Readonly<{
  item: NavigationItem;
  children: readonly NavigationChild[];
  active: boolean;
  isActive: (href: string) => boolean;
  Icon: typeof LayoutDashboardIcon;
}>;

function CollapsedHoverMenu({ item, children, active, isActive, Icon }: CollapsedHoverMenuProps) {
  return (
    <SidebarMenuItem>
      <HoverCard openDelay={100} closeDelay={300}>
        <HoverCardTrigger asChild>
          <SidebarMenuButton isActive={active} aria-label={item.label}>
            <Icon />
            <span>{item.label}</span>
          </SidebarMenuButton>
        </HoverCardTrigger>
        <HoverCardContent side="right" align="start" sideOffset={8} className="w-56 p-1">
          <div className="px-1.5 py-1 text-sm font-medium">{item.label}</div>
          <nav className="flex flex-col gap-0.5" aria-label={item.label}>
            {children.map((child) => {
              const childActive = isActive(child.href);
              return (
                <Link
                  key={child.key}
                  href={child.href}
                  aria-current={childActive ? "page" : undefined}
                  className={cn(
                    "rounded-md px-1.5 py-1 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                    childActive && "bg-accent text-accent-foreground",
                  )}
                >
                  {child.label}
                </Link>
              );
            })}
          </nav>
        </HoverCardContent>
      </HoverCard>
    </SidebarMenuItem>
  );
}

export function AppNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state, isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, pathname, searchParams, setOpenMobile]);

  const allNavigationHrefs = useMemo(() => {
    const list: string[] = [];
    for (const group of adminNavigation) {
      for (const item of group.items) {
        if ("href" in item && item.href) list.push(item.href);
        if ("children" in item && item.children) {
          for (const child of item.children) {
            if (child.href) list.push(child.href);
          }
        }
      }
    }
    return list;
  }, []);

  function isEligible(href: string) {
    const target = new URL(href, "http://naai.local");
    const pathMatches = pathname === target.pathname || pathname.startsWith(`${target.pathname}/`);
    if (!pathMatches) return false;
    if (target.search) {
      const targetParams = new URLSearchParams(target.search);
      for (const [key, value] of targetParams.entries()) {
        if (searchParams.get(key) !== value) return false;
      }
    }
    return true;
  }

  function matchesPath(href: string) {
    if (!isEligible(href)) return false;
    const target = new URL(href, "http://naai.local");
    for (const otherHref of allNavigationHrefs) {
      if (otherHref === href) continue;
      const otherTarget = new URL(otherHref, "http://naai.local");
      if (otherTarget.pathname.length > target.pathname.length && isEligible(otherHref)) {
        return false;
      }
    }
    return true;
  }

  function isActive(href: string) {
    return matchesPath(href);
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  N
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">NAAI ERP</span>
                  <span className="truncate text-xs">Finance operations</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {adminNavigation.map((group) => (
          <SidebarGroup key={group.key}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.filter(isNavigationAvailable).map((item) => {
                  const Icon = icons[item.icon];
                  if ("children" in item && item.children?.length) {
                    const children = item.children.filter(isNavigationAvailable);
                    const active = children.some((child) => matchesPath(child.href));

                    if (state === "collapsed") {
                      return (
                        <CollapsedHoverMenu
                          key={item.key}
                          item={item}
                          children={children}
                          active={active}
                          isActive={isActive}
                          Icon={Icon}
                        />
                      );
                    }

                    return (
                      <Collapsible
                        key={item.key}
                        asChild
                        defaultOpen={active}
                        className="group/collapsible"
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip={item.label} isActive={active}>
                              <Icon />
                              <span>{item.label}</span>
                              <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {children.map((child) => (
                                <SidebarMenuSubItem key={child.key}>
                                  <SidebarMenuSubButton asChild isActive={isActive(child.href)}>
                                    <Link href={child.href}>{child.label}</Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  }
                  if (!("href" in item) || !item.href) return null;
                  const active = isActive(item.href);
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={item.href} aria-current={active ? "page" : undefined}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavigationUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
