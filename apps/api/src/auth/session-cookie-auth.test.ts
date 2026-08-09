import {
  createPersistentSession,
  sealPersistentSession,
  SESSION_COOKIE_NAME,
} from "@naai-erp/contracts/session-cookie";
import { describe, expect, it } from "vitest";
import { authenticateApiSession, COOKIE_SESSION_AUTHORIZATION } from "./session-cookie-auth.js";
import type { SessionAuthenticationError } from "./session-cookie-auth.js";

const secret = "test-session-secret-with-at-least-32-characters";
const cookie = sealPersistentSession(
  createPersistentSession({ organizationId: "org-a", apiToken: "api-token-a" }),
  secret,
);

function request(
  overrides: Partial<{ method: string; url: string; headers: Record<string, string> }> = {},
) {
  return {
    method: overrides.method ?? "GET",
    url: overrides.url ?? "/api/v1/organizations/org-a/master-data/parties",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
      ...(overrides.headers ?? {}),
    } as Record<string, string | string[] | undefined>,
  };
}

describe("API persistent-session authentication", () => {
  it("injects the decrypted API token when Authorization is absent", () => {
    const incoming = request();
    authenticateApiSession(incoming, { SESSION_SECRET: secret });
    expect(incoming.headers.authorization).toBe("Bearer api-token-a");
  });

  it("treats the browser cookie-session sentinel as absent", () => {
    const incoming = request({ headers: { authorization: COOKIE_SESSION_AUTHORIZATION } });
    authenticateApiSession(incoming, { SESSION_SECRET: secret });
    expect(incoming.headers.authorization).toBe("Bearer api-token-a");
  });

  it("preserves regular CLI Bearer authentication without inspecting cookies", () => {
    const incoming = request({
      url: "/api/v1/organizations/org-b/master-data/parties",
      headers: { authorization: "Bearer cli-token" },
    });
    authenticateApiSession(incoming, {});
    expect(incoming.headers.authorization).toBe("Bearer cli-token");
  });

  it("rejects cross-organization cookie use", () => {
    expect(() =>
      authenticateApiSession(request({ url: "/api/v1/organizations/org-b/master-data/parties" }), {
        SESSION_SECRET: secret,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SessionAuthenticationError>>({ statusCode: 403 }),
    );
  });

  it("requires the configured web origin for unsafe cookie-authenticated requests", () => {
    const accepted = request({ method: "POST", headers: { origin: "https://erp.naai.studio" } });
    authenticateApiSession(accepted, {
      SESSION_SECRET: secret,
      APP_BASE_URL: "https://erp.naai.studio/login",
    });
    expect(accepted.headers.authorization).toBe("Bearer api-token-a");

    expect(() =>
      authenticateApiSession(
        request({ method: "PATCH", headers: { origin: "https://evil.test" } }),
        {
          SESSION_SECRET: secret,
          WEB_ORIGIN: "https://erp.naai.studio",
        },
      ),
    ).toThrowError(
      expect.objectContaining<Partial<SessionAuthenticationError>>({
        statusCode: 403,
        code: "ORIGIN_FORBIDDEN",
      }),
    );
  });

  it("rejects invalid cookies instead of forwarding the sentinel", () => {
    const incoming = request({
      headers: {
        authorization: COOKIE_SESSION_AUTHORIZATION,
        cookie: `${SESSION_COOKIE_NAME}=invalid`,
      },
    });
    expect(() => authenticateApiSession(incoming, { SESSION_SECRET: secret })).toThrowError(
      expect.objectContaining<Partial<SessionAuthenticationError>>({ statusCode: 401 }),
    );
  });
});
