import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem as BreadcrumbListItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = Readonly<{
  label: string;
  href?: string;
}>;

export type PageHeaderProps = Readonly<{
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  actions?: ReactNode;
  status?: ReactNode;
  toolbar?: ReactNode;
  className?: string;
}>;

export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs = [],
  actions,
  status,
  toolbar,
  className,
}: PageHeaderProps) {
  const trail = breadcrumbs.length ? breadcrumbs : eyebrow ? [{ label: eyebrow }] : [];

  return (
    <header
      className={cn(
        "flex flex-col border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className,
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 border-b">
        <SidebarTrigger className="-ml-1" aria-label="Mở menu chính" />
        <Separator orientation="vertical" className="mr-2 data-vertical:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {trail.map((item, index) => (
              <Fragment key={`${item.label}-${index}`}>
                <BreadcrumbListItem>
                  {item.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  )}
                </BreadcrumbListItem>
                {index < trail.length - 1 ? <BreadcrumbSeparator /> : null}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        {status || actions ? (
          <div className="ml-auto flex items-center gap-2">
            {status}
            {actions}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {toolbar ? <div className="pt-1">{toolbar}</div> : null}
      </div>
    </header>
  );
}
