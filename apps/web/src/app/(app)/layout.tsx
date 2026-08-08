import { Suspense, type ReactNode } from "react";
import { AuthenticationGate } from "@/components/authentication-gate";
import { AppNavigation } from "@/components/layout/app-navigation";
import { PageShell } from "@/components/layout/page-shell";

export default function ApplicationLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AuthenticationGate>
      <PageShell
        navigation={
          <Suspense fallback={<div className="w-64 border-r border-border bg-sidebar" />}>
            <AppNavigation />
          </Suspense>
        }
      >
        {children}
      </PageShell>
    </AuthenticationGate>
  );
}
