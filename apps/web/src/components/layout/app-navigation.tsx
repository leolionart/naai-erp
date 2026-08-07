"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BanknoteIcon,
  BookOpenIcon,
  BoxesIcon,
  BriefcaseBusinessIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  FileTextIcon,
  GaugeIcon,
  ListChecksIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  ReceiptTextIcon,
  SunIcon,
  UsersIcon,
  WalletCardsIcon,
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
import { API_TOKEN_KEY } from "@/lib/api";
import { adminNavigation, isNavigationAvailable, type NavigationIcon } from "@/lib/navigation";

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

function NavigationUser() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { isMobile } = useSidebar();

  function logout() {
    window.sessionStorage.removeItem(API_TOKEN_KEY);
    router.push("/login");
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
            <DropdownMenuItem onSelect={logout}>
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

  function matchesPath(href: string) {
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
