import { NextResponse } from "next/server";
import {
  authenticateEnvironmentLogin,
  loadEnvironmentLoginConfig,
} from "@/lib/auth/environment-login";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let config;
  try {
    config = loadEnvironmentLoginConfig();
  } catch {
    return NextResponse.json({ error: "Đăng nhập chưa được cấu hình." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu đăng nhập không hợp lệ." }, { status: 400 });
  }

  const credentials = body as Partial<{ username: string; password: string }>;
  if (
    typeof credentials.username !== "string" ||
    typeof credentials.password !== "string" ||
    !authenticateEnvironmentLogin(
      { username: credentials.username, password: credentials.password },
      config,
    )
  ) {
    return NextResponse.json({ error: "Tài khoản hoặc mật khẩu không đúng." }, { status: 401 });
  }

  return NextResponse.json(
    { organizationId: config.organizationId, apiToken: config.apiToken },
    { headers: { "Cache-Control": "no-store" } },
  );
}
