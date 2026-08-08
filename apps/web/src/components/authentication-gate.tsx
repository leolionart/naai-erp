"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { API_TOKEN_KEY } from "@/lib/api";

export function requiresInteractiveLogin(nodeEnv: string | undefined, storedToken: string | null) {
  return nodeEnv === "production" && !storedToken?.trim();
}

export function AuthenticationGate({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = window.sessionStorage.getItem(API_TOKEN_KEY);
    if (requiresInteractiveLogin(process.env.NODE_ENV, token)) {
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setAuthorized(true);
  }, [router]);

  if (!authorized) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-muted text-sm text-muted-foreground">
        Đang kiểm tra phiên đăng nhập…
      </main>
    );
  }

  return children;
}
