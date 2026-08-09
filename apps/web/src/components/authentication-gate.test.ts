import { describe, expect, it } from "vitest";
import { requiresInteractiveLogin } from "./authentication-gate";

describe("production authentication gate", () => {
  it("requires an explicit browser session token in production", () => {
    expect(requiresInteractiveLogin("production", false)).toBe(true);
    expect(requiresInteractiveLogin("production", true)).toBe(false);
  });

  it("keeps the local development fixture token workflow available", () => {
    expect(requiresInteractiveLogin("development", false)).toBe(false);
    expect(requiresInteractiveLogin("test", false)).toBe(false);
  });
});
