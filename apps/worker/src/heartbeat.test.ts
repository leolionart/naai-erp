import { describe, expect, it } from "vitest";
import { createHeartbeat } from "./heartbeat.js";

describe("worker heartbeat", () => {
  it("creates a deterministic healthy heartbeat", () => {
    const now = new Date("2026-08-05T06:00:00.000Z");

    expect(createHeartbeat(now)).toEqual({
      service: "worker",
      status: "ok",
      recordedAt: "2026-08-05T06:00:00.000Z",
    });
  });
});
