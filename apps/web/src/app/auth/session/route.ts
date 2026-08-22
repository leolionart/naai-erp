import { NextResponse } from "next/server";
import {
  createPersistentSession,
  openPersistentSession,
  sealPersistentSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  sessionCookieFromHeader,
} from "@naai-erp/contracts/session-cookie";
import {
  authenticateEnvironmentLogin,
  loadEnvironmentLoginConfig,
} from "@/lib/auth/environment-login";

export const runtime = "nodejs";

function sessionSecret() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

function clearSession(response: NextResponse, request?: Request) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: secureSessionCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

/**
 * Secure cookies are mandatory on production HTTPS, but forcing Secure on a
 * plain HTTP LAN/dev origin makes mobile browsers silently discard the cookie.
 * Reverse proxies communicate the public scheme through X-Forwarded-Proto.
 */
function secureSessionCookie(request?: Request) {
  if (process.env.NODE_ENV === "production") return true;
  const forwarded = request?.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  if (forwarded) return forwarded === "https";
  return request ? new URL(request.url).protocol === "https:" : true;
}

export async function POST(request: Request) {
  let config;
  let secret;
  try {
    config = loadEnvironmentLoginConfig();
    secret = sessionSecret();
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

  const response = NextResponse.json(
    { organizationId: config.organizationId },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(
    SESSION_COOKIE_NAME,
    sealPersistentSession(
      createPersistentSession({ organizationId: config.organizationId, apiToken: config.apiToken }),
      secret,
    ),
    {
      httpOnly: true,
      secure: secureSessionCookie(request),
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    },
  );
  return response;
}

export async function GET(request: Request) {
  try {
    const value = sessionCookieFromHeader(request.headers.get("cookie"));
    if (!value) throw new Error("SESSION_MISSING");
    const session = openPersistentSession(value, sessionSecret());
    return NextResponse.json(
      { organizationId: session.organizationId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return clearSession(
      NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 }),
      request,
    );
  }
}

export async function DELETE(request?: Request) {
  return clearSession(
    NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }),
    request,
  );
}
