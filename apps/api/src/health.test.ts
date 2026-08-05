import "reflect-metadata";
import { afterEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApp } from "./bootstrap.js";

let app: NestFastifyApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("API health endpoints", () => {
  it.each(["/health/live", "/health/ready"])("serves %s", async (url) => {
    app = await createApp();
    await app.init();

    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ service: "api", status: "ok" });
  });
});
