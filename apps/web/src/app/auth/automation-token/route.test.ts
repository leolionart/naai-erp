import { afterEach, describe, expect, it } from "vitest";
import {
  createPersistentSession,
  sealPersistentSession,
  SESSION_COOKIE_NAME,
} from "@naai-erp/contracts/session-cookie";
import { POST } from "./route";

const secret = "automation-token-test-secret-that-is-at-least-32-chars";

function request(cookie?: string, origin = "http://localhost") {
  return new Request("http://localhost/auth/automation-token", {
    method: "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      origin,
    },
  });
}

describe("POST /auth/automation-token", () => {
  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.NAAI_ERP_DEV_UPSTREAM_TOKEN;
    delete process.env.NAAI_ERP_DEV_UPSTREAM_ORGANIZATION;
  });

  it("reveals the current stable API credential only to an authenticated same-origin session", async () => {
    process.env.SESSION_SECRET = secret;
    const sealed = sealPersistentSession(
      createPersistentSession({ organizationId: "naai", apiToken: "production-owner-token" }),
      secret,
    );
    const response = await POST(request(`${SESSION_COOKIE_NAME}=${sealed}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      organizationId: "naai",
      apiToken: "production-owner-token",
    });
  });

  it("rejects missing sessions and cross-origin token reads", async () => {
    process.env.SESSION_SECRET = secret;
    expect((await POST(request())).status).toBe(401);
    const sealed = sealPersistentSession(
      createPersistentSession({ organizationId: "naai", apiToken: "production-owner-token" }),
      secret,
    );
    expect(
      (await POST(request(`${SESSION_COOKIE_NAME}=${sealed}`, "https://attacker.example"))).status,
    ).toBe(401);
  });

  it("uses the server-only production-data credential during native development", async () => {
    process.env.NAAI_ERP_DEV_UPSTREAM_TOKEN = "development-upstream-token";
    process.env.NAAI_ERP_DEV_UPSTREAM_ORGANIZATION = "naai";

    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      organizationId: "naai",
      apiToken: "development-upstream-token",
    });
  });
});
