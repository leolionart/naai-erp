import { NextResponse } from "next/server";
import { execFileSync } from "node:child_process";
import { openPersistentSession, sessionCookieFromHeader } from "@naai-erp/contracts/session-cookie";

export const runtime = "nodejs";

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function developmentKeychainValue(service: string) {
  if (process.platform !== "darwin") return "";
  try {
    return execFileSync("security", ["find-generic-password", "-s", service, "-a", "admin", "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) throw new Error("CROSS_ORIGIN_REQUEST");
    const developmentToken =
      process.env.NAAI_ERP_DEV_UPSTREAM_TOKEN?.trim() ||
      (process.env.NODE_ENV === "development"
        ? developmentKeychainValue("naai-erp-api-token")
        : "");
    if (process.env.NODE_ENV !== "production" && developmentToken) {
      return NextResponse.json(
        {
          organizationId:
            process.env.NAAI_ERP_DEV_UPSTREAM_ORGANIZATION?.trim() ||
            (process.env.NODE_ENV === "development"
              ? developmentKeychainValue("naai-erp-organization")
              : "") ||
            "naai",
          apiToken: developmentToken,
        },
        { headers: { "Cache-Control": "no-store, private" } },
      );
    }
    const secret = process.env.SESSION_SECRET?.trim();
    if (!secret || secret.length < 32) throw new Error("SESSION_SECRET_MISSING");
    const sealed = sessionCookieFromHeader(request.headers.get("cookie"));
    if (!sealed) throw new Error("SESSION_MISSING");
    const session = openPersistentSession(sealed, secret);
    return NextResponse.json(
      { organizationId: session.organizationId, apiToken: session.apiToken },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Phiên đăng nhập không hợp lệ." },
      { status: 401, headers: { "Cache-Control": "no-store, private" } },
    );
  }
}
