import type { ReactNode } from "react";
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
    <div className="flex min-h-svh flex-col">
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[
          { label: "Trang chủ", href: "/dashboard" },
          ...(section ? [{ label: section }] : []),
          { label: title },
        ]}
      />
      <div className="flex flex-1 flex-col p-4 md:p-6">{children}</div>
    </div>
  );
}
