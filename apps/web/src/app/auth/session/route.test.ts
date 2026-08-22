import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openPersistentSession, SESSION_COOKIE_NAME } from "@naai-erp/contracts/session-cookie";
import { DELETE, GET, POST } from "./route";

const originalEnvironment = process.env;

function request(body: unknown) {
  return new Request("https://localhost/auth/session", {
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
      SESSION_SECRET: "test-session-secret-that-is-at-least-32-characters",
    };
  });

  afterEach(() => {
    process.env = originalEnvironment;
  });

  it("returns only the organization and stores the API credential in an encrypted cookie", async () => {
    const response = await POST(
      request({ username: "owner", password: "correct horse battery staple" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ organizationId: "naai" });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).not.toContain("owner-api-token");
    const sealed = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
    expect(openPersistentSession(sealed ?? "", process.env.SESSION_SECRET ?? "")).toMatchObject({
      organizationId: "naai",
      apiToken: "owner-api-token",
    });
  });

  it("allows the persistent cookie on a plain HTTP development origin used by mobile devices", async () => {
    const response = await POST(
      new Request("http://192.168.1.10:3000/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-proto": "http" },
        body: JSON.stringify({
          username: "owner",
          password: "correct horse battery staple",
        }),
      }),
    );

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 30}`);
    expect(cookie).not.toContain("Secure");
  });

  it("keeps Secure on an HTTPS origin forwarded by the reverse proxy", async () => {
    const response = await POST(
      new Request("http://web:3000/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-proto": "https" },
        body: JSON.stringify({
          username: "owner",
          password: "correct horse battery staple",
        }),
      }),
    );

    expect(response.headers.get("set-cookie")).toContain("Secure");
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

  it("fails closed when the session encryption secret is missing", async () => {
    delete process.env.SESSION_SECRET;
    const response = await POST(
      request({ username: "owner", password: "correct horse battery staple" }),
    );
    expect(response.status).toBe(503);
  });

  it("restores an encrypted session without disclosing its API token", async () => {
    const login = await POST(
      request({ username: "owner", password: "correct horse battery staple" }),
    );
    const cookie = login.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    const response = await GET(
      new Request("http://localhost/auth/session", { headers: { cookie } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ organizationId: "naai" });
  });

  it("rejects and clears an invalid session", async () => {
    const response = await GET(
      new Request("http://localhost/auth/session", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=invalid` },
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("clears the session on logout", async () => {
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
