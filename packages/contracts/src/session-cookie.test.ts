import { describe, expect, it } from "vitest";
import {
  createPersistentSession,
  openPersistentSession,
  sealPersistentSession,
  sessionCookieFromHeader,
} from "./session-cookie.js";

describe("persistent encrypted web session", () => {
  const secret = "stable-production-session-secret-123456";

  it("round-trips without exposing the API token", () => {
    const sealed = sealPersistentSession(
      createPersistentSession({ organizationId: "naai", apiToken: "owner-api-token" }, 1_000),
      secret,
    );
    expect(sealed).not.toContain("owner-api-token");
    expect(openPersistentSession(sealed, secret, 2_000)).toMatchObject({
      organizationId: "naai",
      apiToken: "owner-api-token",
    });
  });

  it("rejects tampering and expiry", () => {
    const sealed = sealPersistentSession(
      createPersistentSession({ organizationId: "naai", apiToken: "token" }, 1_000),
      secret,
    );
    expect(() => openPersistentSession(`${sealed}x`, secret, 2_000)).toThrow("SESSION_INVALID");
    expect(() => openPersistentSession(sealed, secret, 2_700_000_000)).toThrow("SESSION_EXPIRED");
  });

  it("reads the host cookie without inspecting unrelated cookies", () => {
    expect(sessionCookieFromHeader("theme=dark; __Host-naai_erp_session=sealed.value")).toBe(
      "sealed.value",
    );
  });
});
