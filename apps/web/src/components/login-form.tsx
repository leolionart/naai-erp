"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DEFAULT_API_CONNECTION, saveConnectionSettings } from "@/lib/api";
import { cn } from "@/lib/utils";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
          <form action={login} method="post" autoComplete="on">
            <FieldGroup>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="username">Tài khoản</FieldLabel>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  required
                  aria-invalid={Boolean(error)}
                />
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
                    <span className="font-medium">Lưu đăng nhập trên thiết bị này</span>
                    <span className="mt-1 block text-muted-foreground">
                      Trình duyệt có thể đề nghị lưu mật khẩu. NAAI ERP không lưu mật khẩu trong bộ
                      nhớ trình duyệt.
                    </span>
                  </span>
                </label>
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
                <FieldDescription>
                  Thông tin đăng nhập được kiểm tra ở server và không được đóng gói vào trình duyệt.
                </FieldDescription>
                {error ? <FieldError>{error}</FieldError> : null}
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
