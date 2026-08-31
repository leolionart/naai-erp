"use client";

import { Suspense } from "react";
import { NaaiLogo } from "@/components/brand/naai-logo";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="/" className="self-center" aria-label="NAAI ERP">
          <NaaiLogo />
        </a>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
