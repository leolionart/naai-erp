"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DEFAULT_API_CONNECTION, saveConnectionSettings } from "@/lib/api";
import { cn } from "@/lib/utils";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

const REMEMBERED_USERNAME_KEY = "naai-erp-remembered-username";

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState("");

  useEffect(() => {
    setUsername(window.localStorage.getItem(REMEMBERED_USERNAME_KEY) ?? "");
  }, []);

  async function login(data: FormData) {
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: String(data.get("username") ?? ""),
          password: String(data.get("password") ?? ""),
          remember: data.get("remember") === "on",
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        organizationId?: string;
      };
      if (!response.ok || !result.organizationId) {
        throw new Error(result.error || "Không thể đăng nhập.");
      }
      saveConnectionSettings(window.localStorage, {
        version: 1,
        baseUrl: DEFAULT_API_CONNECTION.baseUrl,
        organizationId: result.organizationId,
      });
      if (data.get("remember") === "on") {
        window.localStorage.setItem(REMEMBERED_USERNAME_KEY, String(data.get("username") ?? ""));
      } else {
        window.localStorage.removeItem(REMEMBERED_USERNAME_KEY);
      }
      router.replace(safeNext(search.get("next")));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể đăng nhập.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Đăng nhập NAAI ERP</CardTitle>
          <CardDescription>Kết nối vào dữ liệu tài chính của NAAI Studio</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={login} autoComplete="on">
            <FieldGroup>
              <Field>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="relative w-full overflow-visible"
                  disabled
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" role="img">
                    <path
                      fill="#4285F4"
                      d="M21.35 12.27c0-.71-.06-1.39-.18-2.04H12v3.86h5.23a4.47 4.47 0 0 1-1.94 2.93v2.43h3.14c1.84-1.69 2.92-4.18 2.92-7.18Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 21.6c2.63 0 4.84-.87 6.45-2.35l-3.14-2.43c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.5A9.74 9.74 0 0 0 12 21.6Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M6.54 13.71A5.85 5.85 0 0 1 6.23 12c0-.59.11-1.17.31-1.71v-2.5H3.3A9.74 9.74 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.21l3.24-2.5Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 6.26c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.35 14.63 2.4 12 2.4a9.74 9.74 0 0 0-8.7 5.39l3.24 2.5C7.31 7.98 9.46 6.26 12 6.26Z"
                    />
                  </svg>
                  Đăng nhập với Google
                  <Badge
                    variant="outline"
                    className="absolute -top-2 -right-2 border-border bg-white text-foreground shadow-sm dark:bg-card"
                  >
                    Sắp ra mắt
                  </Badge>
                </Button>
              </Field>
              <div className="relative py-1" role="presentation">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-2 text-xs uppercase text-muted-foreground">Hoặc</span>
                </div>
              </div>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="username">Tài khoản</FieldLabel>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  required
                  aria-invalid={Boolean(error)}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </Field>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="password">Mật khẩu</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  aria-invalid={Boolean(error)}
                />
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
              <Field>
                <label htmlFor="remember" className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    id="remember"
                    name="remember"
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <span className="font-medium">Lưu đăng nhập</span>
                  </span>
                </label>
              </Field>
              <Field>
                <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                  {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        Hệ thống quản trị nội bộ của NAAI Studio.
      </FieldDescription>
    </div>
  );
}
