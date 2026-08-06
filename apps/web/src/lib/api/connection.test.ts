import { describe, expect, it } from "vitest";
import {
  API_CONNECTION_SETTINGS_KEY,
  API_TOKEN_KEY,
  loadApiToken,
  loadConnectionSettings,
  organizationApiRoot,
  parseConnectionSettings,
  saveApiToken,
  saveConnectionSettings,
  type StorageLike,
} from "./connection";

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe("ERP-345 versioned API connection settings", () => {
  it("normalizes, persists and reloads v1 settings", () => {
    const storage = memoryStorage();
    const saved = saveConnectionSettings(storage, {
      version: 1,
      baseUrl: " http://localhost:3001/ ",
      organizationId: " org-naai ",
    });
    expect(saved).toEqual({
      version: 1,
      baseUrl: "http://localhost:3001",
      organizationId: "org-naai",
    });
    expect(loadConnectionSettings(storage)).toEqual(saved);
    expect(organizationApiRoot(saved)).toBe("http://localhost:3001/api/v1/organizations/org-naai");
  });

  it("rejects stale/invalid settings and strips Bearer from stored token", () => {
    const storage = memoryStorage();
    storage.setItem(API_CONNECTION_SETTINGS_KEY, JSON.stringify({ version: 2, baseUrl: "x" }));
    expect(loadConnectionSettings(storage).organizationId).toBe("naai");
    expect(parseConnectionSettings("not json")).toBeUndefined();
    expect(saveApiToken(storage, " Bearer secret-token ")).toBe("secret-token");
    expect(loadApiToken(storage)).toBe("secret-token");
    saveApiToken(storage, "");
    expect(storage.getItem(API_TOKEN_KEY)).toBeNull();
  });
});
