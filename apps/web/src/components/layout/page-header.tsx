import type { ReactNode } from "react";

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
  return (
    <header className={["topbar", "page-header", className].filter(Boolean).join(" ")}>
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
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
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
