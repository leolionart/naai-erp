import { afterEach, describe, expect, it } from "vitest";
import {
  createPersistentSession,
  sealPersistentSession,
  SESSION_COOKIE_NAME,
} from "@naai-erp/contracts/session-cookie";
import { GET, POST } from "./route";

const secret = "automation-token-test-secret-that-is-at-least-32-chars";

function request(
  method: "GET" | "POST" = "POST",
  cookie?: string,
  origin = "http://localhost",
  forwarded?: Readonly<{ proto: string; host: string }>,
) {
  return new Request("http://localhost/auth/automation-token", {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      origin,
      ...(forwarded
        ? { "x-forwarded-proto": forwarded.proto, "x-forwarded-host": forwarded.host }
        : {}),
    },
  });
}

describe("/auth/automation-token retirement (BR-AI-007)", () => {
  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.NAAI_ERP_DEV_UPSTREAM_TOKEN;
    delete process.env.NAAI_ERP_DEV_UPSTREAM_ORGANIZATION;
  });

  it("always returns 410 OWNER_SESSION_TOKEN_RETIRED on POST even with a valid owner session cookie", async () => {
    process.env.SESSION_SECRET = secret;
    const sealed = sealPersistentSession(
      createPersistentSession({ organizationId: "naai", apiToken: "production-owner-token" }),
      secret,
    );
    const response = await POST();

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    const rawText = await response.text();
    expect(rawText).not.toContain("production-owner-token");
    expect(JSON.parse(rawText)).toEqual({
      error: {
        code: "OWNER_SESSION_TOKEN_RETIRED",
        message:
          "Phiên đăng nhập của chủ sở hữu không phát hành khóa tích hợp. Hãy tạo Khóa kết nối dịch vụ riêng tại /settings/automation.",
      },
    });
    expect(sealed).toBeTruthy();
  });

  it("never discloses development upstream tokens or session tokens on POST or GET", async () => {
    process.env.SESSION_SECRET = secret;
    process.env.NAAI_ERP_DEV_UPSTREAM_TOKEN = "development-upstream-token";
    process.env.NAAI_ERP_DEV_UPSTREAM_ORGANIZATION = "naai";
    const sealed = sealPersistentSession(
      createPersistentSession({ organizationId: "naai", apiToken: "production-owner-token" }),
      secret,
    );

    const postResponse = await POST();
    const getResponse = await GET();

    for (const response of [postResponse, getResponse]) {
      expect(response.status).toBe(410);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const text = await response.text();
      expect(text).not.toContain("production-owner-token");
      expect(text).not.toContain("development-upstream-token");
      expect(JSON.parse(text)).toMatchObject({
        error: { code: "OWNER_SESSION_TOKEN_RETIRED" },
      });
    }
    expect(request("POST", `${SESSION_COOKIE_NAME}=${sealed}`).method).toBe("POST");
  });
});
