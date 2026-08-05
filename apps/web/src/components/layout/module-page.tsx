import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "./page-header";

export function ModulePage({
  title,
  description,
  section,
  children,
}: Readonly<{
  title: string;
  description: string;
  section: string;
  children: ReactNode;
}>) {
  return (
    <div className="route-page">
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[{ label: "Admin", href: "/dashboard" }, { label: section }, { label: title }]}
        status={<Badge variant="secondary">Local development</Badge>}
      />
      <div className="route-page-content">{children}</div>
    </div>
  );
}
