import { cn } from "@/lib/utils";

("use client");

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArchiveRestoreIcon,
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
import { adminNavigation, isNavigationAvailable, type NavigationIcon } from "@/lib/navigation";

const icons = {
  overview: LayoutDashboardIcon,
  "executive-metrics": TrendingUpIcon,
  folder: DatabaseIcon,
  "master-data": DatabaseIcon,
  "purchase-products": PackageIcon,
  "portable-data": ArchiveRestoreIcon,
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

export function AppNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state } = useSidebar();

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
                        <SidebarMenuItem key={item.key} className="group/collapsed-menu relative">
                          <SidebarMenuButton isActive={active}>
                            <Icon />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                          <div className="pointer-events-none absolute left-full top-0 z-50 ml-2 hidden w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md group-hover/collapsed-menu:pointer-events-auto group-hover/collapsed-menu:block animate-in fade-in zoom-in-95">
                            <div className="px-2 py-1.5 text-sm font-semibold">{item.label}</div>
                            <div className="-mx-1 my-1 h-px bg-muted" />
                            {children.map((child) => {
                              const childActive = isActive(child.href);
                              return (
                                <Link
                                  key={child.key}
                                  href={child.href}
                                  className={cn(
                                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                                    childActive ? "bg-accent" : "",
                                  )}
                                >
                                  {child.label}
                                </Link>
                              );
                            })}
                          </div>
                        </SidebarMenuItem>
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
