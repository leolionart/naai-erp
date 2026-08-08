import { describe, expect, it } from "vitest";
import { requiresInteractiveLogin } from "./authentication-gate";

describe("production authentication gate", () => {
  it("requires an explicit browser session token in production", () => {
    expect(requiresInteractiveLogin("production", null)).toBe(true);
    expect(requiresInteractiveLogin("production", "  ")).toBe(true);
    expect(requiresInteractiveLogin("production", "owner-session-token")).toBe(false);
  });

  it("keeps the local development fixture token workflow available", () => {
    expect(requiresInteractiveLogin("development", null)).toBe(false);
    expect(requiresInteractiveLogin("test", null)).toBe(false);
  });
});
