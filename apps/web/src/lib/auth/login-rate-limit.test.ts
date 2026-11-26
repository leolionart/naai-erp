import { beforeEach, describe, expect, it } from "vitest";
import {
  clientAddress,
  loginRetryAfterSeconds,
  recordLoginFailure,
  resetLoginFailures,
  resetLoginRateLimitForTests,
} from "./login-rate-limit";

describe("login rate limit", () => {
  beforeEach(resetLoginRateLimitForTests);

  it("blocks a client after five failures and recovers after the window", () => {
    const start = 1_000_000;
    for (let i = 0; i < 4; i++) recordLoginFailure("1.1.1.1", start);
    expect(loginRetryAfterSeconds("1.1.1.1", start)).toBe(0);
    recordLoginFailure("1.1.1.1", start);
    expect(loginRetryAfterSeconds("1.1.1.1", start)).toBeGreaterThan(0);
    expect(loginRetryAfterSeconds("2.2.2.2", start)).toBe(0);
    expect(loginRetryAfterSeconds("1.1.1.1", start + 15 * 60 * 1000 + 1)).toBe(0);
  });

  it("clears a client's failures after a successful login", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("1.1.1.1");
    resetLoginFailures("1.1.1.1");
    expect(loginRetryAfterSeconds("1.1.1.1")).toBe(0);
  });

  it("blocks everyone once the global ceiling is reached", () => {
    for (let i = 0; i < 50; i++) recordLoginFailure(`10.0.0.${i}`);
    expect(loginRetryAfterSeconds("9.9.9.9")).toBeGreaterThan(0);
  });

  it("reads the first forwarded address", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" }))).toBe("3.3.3.3");
  });
});
