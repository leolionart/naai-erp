import * as React from "react";
import type { ReactNode } from "react";
import { SidebarContext, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

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
  className?: string;
}>;

export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs = [],
  actions,
  status,
  className,
}: PageHeaderProps) {
  const sidebarContext = React.useContext(SidebarContext);
  const showTrigger = sidebarContext !== null;

  return (
    <header className={["topbar", "page-header", className].filter(Boolean).join(" ")}>
      <div className="flex items-center gap-4">
        {showTrigger && (
          <>
            <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
            <Separator orientation="vertical" className="h-6 hidden md:block" />
          </>
        )}
        <div>
          {breadcrumbs.length ? (
            <nav aria-label="Breadcrumb">
              <ol className="breadcrumb">
                {breadcrumbs.map((item, index) => (
                  <li key={`${item.label}-${index}`}>
                    {item.href ? (
                      <a href={item.href}>{item.label}</a>
                    ) : (
                      <span aria-current="page">{item.label}</span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          ) : eyebrow ? (
            <span className="breadcrumb">{eyebrow}</span>
          ) : null}
          <h1 className="flex items-center gap-2">{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {actions || status ? (
        <div className="page-header-actions">
          {status}
          {actions}
        </div>
      ) : null}
    </header>
  );
}
