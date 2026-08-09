import { describe, expect, it } from "vitest";
import {
  API_CONNECTION_SETTINGS_KEY,
  API_TOKEN_KEY,
  loadApiToken,
  loadConnectionSettings,
  organizationApiRoot,
  parseConnectionSettings,
  resolveDefaultApiBaseUrl,
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
  it("uses the public same-origin API in production browsers without breaking local development", () => {
    expect(
      resolveDefaultApiBaseUrl({
        nodeEnv: "production",
        browserOrigin: "https://erp.naai.studio",
        serverApiUrl: "http://api:3001",
      }),
    ).toBe("https://erp.naai.studio");
    expect(
      resolveDefaultApiBaseUrl({
        nodeEnv: "development",
        browserOrigin: "http://localhost:3000",
      }),
    ).toBe("http://localhost:3001");
    expect(
      resolveDefaultApiBaseUrl({
        nodeEnv: "production",
        publicApiUrl: "https://api.example.com",
        browserOrigin: "https://erp.example.com",
      }),
    ).toBe("https://api.example.com");
  });

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

  it("can force the environment connection and clear a stale browser override", () => {
    const storage = memoryStorage();
    saveConnectionSettings(storage, {
      version: 1,
      baseUrl: "http://localhost:3001",
      organizationId: "naai",
    });
    const liveProductionData = {
      version: 1 as const,
      baseUrl: "http://localhost:3000/dev-api",
      organizationId: "naai",
    };

    expect(loadConnectionSettings(storage, liveProductionData, true)).toEqual(liveProductionData);
    expect(storage.getItem(API_CONNECTION_SETTINGS_KEY)).toBeNull();
  });
});
