import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./env.js";

const validEnvironment = {
  NODE_ENV: "test",
  APP_BASE_URL: "http://localhost:3000",
  API_PORT: "3001",
  DATABASE_URL: "postgresql://user:password@localhost:5432/naai_erp",
  REDIS_URL: "redis://localhost:6379",
  OBJECT_STORAGE_ENDPOINT: "http://localhost:9000",
  OBJECT_STORAGE_BUCKET: "naai-erp-test",
  OBJECT_STORAGE_ACCESS_KEY: "test-access-key",
  OBJECT_STORAGE_SECRET_KEY: "test-secret-key",
  SESSION_SECRET: "test-session-secret-at-least-32-characters",
  WEBHOOK_SIGNING_SECRET: "test-webhook-secret-at-least-32-characters",
} satisfies Record<string, string>;

describe("environment validation", () => {
  it("parses valid configuration and coerces the API port", () => {
    expect(parseEnvironment(validEnvironment).API_PORT).toBe(3001);
  });

  it("rejects short security secrets", () => {
    expect(() => parseEnvironment({ ...validEnvironment, SESSION_SECRET: "short" })).toThrow();
  });
});
