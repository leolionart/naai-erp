import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalEnvironment = process.env;

function request(body: unknown) {
  return new Request("http://localhost/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /auth/session", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      NAAI_ERP_LOGIN_USERNAME: "owner",
      NAAI_ERP_LOGIN_PASSWORD: "correct horse battery staple",
      NAAI_ERP_LOGIN_ORGANIZATION: "naai",
      NAAI_ERP_LOGIN_API_TOKEN: "owner-api-token",
    };
  });

  afterEach(() => {
    process.env = originalEnvironment;
  });

  it("returns the organization and API credential after a valid login", async () => {
    const response = await POST(
      request({ username: "owner", password: "correct horse battery staple" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      organizationId: "naai",
      apiToken: "owner-api-token",
    });
  });

  it("does not disclose the token for invalid credentials", async () => {
    const response = await POST(request({ username: "owner", password: "wrong" }));

    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("owner-api-token");
  });

  it("fails closed when the server login is not fully configured", async () => {
    delete process.env.NAAI_ERP_LOGIN_API_TOKEN;
    const response = await POST(request({ username: "owner", password: "anything" }));

    expect(response.status).toBe(503);
  });
});
