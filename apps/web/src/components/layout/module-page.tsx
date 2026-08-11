import type { ReactNode } from "react";
import { PageHeader } from "./page-header";

export function ModulePage({
  title,
  description,
  section,
  sectionHref,
  toolbar,
  hideBreadcrumb,
  children,
}: Readonly<{
  title: string;
  description: string;
  section?: string;
  sectionHref?: string;
  toolbar?: ReactNode;
  hideBreadcrumb?: boolean;
  children: ReactNode;
}>) {
  const isDashboard = hideBreadcrumb || title === "Tổng quan điều hành" || title === "Tổng quan";
  const breadcrumbs = isDashboard
    ? []
    : [
        { label: "Trang chủ", href: "/dashboard" },
        ...(section ? [{ label: section, href: sectionHref }] : []),
        { label: title },
      ];

  return (
    <div className="flex min-h-svh flex-col">
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        toolbar={toolbar}
      />
      <div className="flex min-w-0 flex-1 flex-col p-4 md:p-6">{children}</div>
    </div>
  );
}
