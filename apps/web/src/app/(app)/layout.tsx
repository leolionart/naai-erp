import type { ReactNode } from "react";
import { AppNavigation } from "@/components/layout/app-navigation";
import { PageShell } from "@/components/layout/page-shell";

export default function ApplicationLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <PageShell navigation={<AppNavigation />}>{children}</PageShell>;
}
