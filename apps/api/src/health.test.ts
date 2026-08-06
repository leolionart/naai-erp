import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "./bootstrap.js";
import { DatabaseReadinessService } from "./health.controller.js";

let app: NestFastifyApplication | undefined;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(async () => {
  vi.restoreAllMocks();
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  await app?.close();
  app = undefined;
});

describe("API health endpoints", () => {
  it("treats a missing DATABASE_URL as not ready", async () => {
    delete process.env.DATABASE_URL;

    await expect(new DatabaseReadinessService().ready()).resolves.toBe(false);
  });

  it("treats an unreachable PostgreSQL endpoint as not ready", async () => {
    process.env.DATABASE_URL = "postgresql://health:health@127.0.0.1:1/health";

    await expect(new DatabaseReadinessService().ready()).resolves.toBe(false);
  });

  it("keeps liveness process-only when the database is unavailable", async () => {
    vi.spyOn(DatabaseReadinessService.prototype, "ready").mockResolvedValue(false);
    app = await createApp();
    await app.init();

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ service: "api", status: "ok" });
  });

  it("serves readiness only after a PostgreSQL check succeeds", async () => {
    vi.spyOn(DatabaseReadinessService.prototype, "ready").mockResolvedValue(true);
    app = await createApp();
    await app.init();

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ service: "api", status: "ok" });
  });

  it("returns a neutral non-2xx response when PostgreSQL is unavailable", async () => {
    vi.spyOn(DatabaseReadinessService.prototype, "ready").mockResolvedValue(false);
    app = await createApp();
    await app.init();

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ service: "api", status: "unavailable" });
    expect(response.body).not.toContain("postgresql://");
    expect(response.body).not.toContain("DATABASE_URL");
  });
});
