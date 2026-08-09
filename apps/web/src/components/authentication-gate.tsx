"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export function requiresInteractiveLogin(nodeEnv: string | undefined, sessionIsValid: boolean) {
  return nodeEnv === "production" && !sessionIsValid;
}

export function AuthenticationGate({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let active = true;
    async function verifySession() {
      if (process.env.NODE_ENV !== "production") {
        if (active) setAuthorized(true);
        return;
      }
      try {
        const response = await fetch("/auth/session", { cache: "no-store" });
        if (response.ok) {
          if (active) setAuthorized(true);
          return;
        }
      } catch {
        // A failed session check uses the same safe redirect as an expired session.
      }
      if (active) {
        const next = `${window.location.pathname}${window.location.search}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    }
    void verifySession();
    return () => {
      active = false;
    };
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
