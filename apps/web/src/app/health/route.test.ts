import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("web health route", () => {
  it("reports a healthy web service", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ service: "web", status: "ok" });
  });
});
