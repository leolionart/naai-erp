import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./secret-box.js";

const secret = "test-session-secret-at-least-32-characters";

describe("secret box", () => {
  it("round-trips and never stores plaintext", () => {
    const sealed = sealSecret("123:token", secret, "telegram-settings");
    expect(sealed).not.toContain("123:token");
    expect(openSecret(sealed, secret, "telegram-settings")).toBe("123:token");
  });
  it("rejects a different purpose, secret or tampered value", () => {
    const sealed = sealSecret("123:token", secret, "telegram-settings");
    expect(() => openSecret(sealed, secret, "other")).toThrow();
    expect(() => openSecret(sealed, secret + "x", "telegram-settings")).toThrow();
    expect(() => openSecret(sealed.slice(0, -2) + "AA", secret, "telegram-settings")).toThrow();
  });
});
