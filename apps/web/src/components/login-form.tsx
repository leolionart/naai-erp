"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  API_TOKEN_KEY,
  DEFAULT_API_CONNECTION,
  saveApiToken,
  saveConnectionSettings,
} from "@/lib/api";
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
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        organizationId?: string;
        apiToken?: string;
      };
      if (!response.ok || !result.organizationId || !result.apiToken) {
        throw new Error(result.error || "Không thể đăng nhập.");
      }
      saveConnectionSettings(window.localStorage, {
        version: 1,
        baseUrl: DEFAULT_API_CONNECTION.baseUrl,
        organizationId: result.organizationId,
      });
      const token = saveApiToken(window.sessionStorage, result.apiToken);
      if (!token) throw new Error("Access token is required");
      router.replace(safeNext(search.get("next")));
    } catch (caught) {
      window.sessionStorage.removeItem(API_TOKEN_KEY);
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
          <form action={login}>
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
                <Button type="submit" disabled={submitting}>
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
