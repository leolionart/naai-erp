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

  function login(data: FormData) {
    setError("");
    try {
      saveConnectionSettings(window.localStorage, {
        version: 1,
        baseUrl: DEFAULT_API_CONNECTION.baseUrl,
        organizationId: String(data.get("organizationId") ?? ""),
      });
      const token = saveApiToken(window.sessionStorage, String(data.get("token") ?? ""));
      if (!token) throw new Error("Access token is required");
      router.replace(safeNext(search.get("next")));
    } catch (caught) {
      window.sessionStorage.removeItem(API_TOKEN_KEY);
      setError(caught instanceof Error ? caught.message : "Không thể đăng nhập.");
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
                <FieldLabel htmlFor="organizationId">Organization ID</FieldLabel>
                <Input
                  id="organizationId"
                  name="organizationId"
                  defaultValue={DEFAULT_API_CONNECTION.organizationId}
                  required
                  aria-invalid={Boolean(error)}
                />
              </Field>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="token">Access token</FieldLabel>
                <Input
                  id="token"
                  name="token"
                  type="password"
                  autoComplete="current-password"
                  required
                  aria-invalid={Boolean(error)}
                />
                <FieldDescription>
                  Token chỉ được lưu trong phiên trình duyệt hiện tại.
                </FieldDescription>
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
              <Field>
                <Button type="submit">Đăng nhập</Button>
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
