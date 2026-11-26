import { describe, expect, it, vi } from "vitest";
import { RequestLifecycleInterceptor } from "./request-lifecycle.interceptor.js";
import { of } from "rxjs";

describe("RequestLifecycleInterceptor", () => {
  it("records running then succeeded lifecycle for mutating requests", async () => {
    const store = {
      start: vi.fn().mockResolvedValue(undefined),
      finish: vi.fn().mockResolvedValue(undefined),
    };
    const interceptor = new RequestLifecycleInterceptor(store as never);
    const result = await new Promise<unknown>((resolve, reject) =>
      interceptor
        .intercept(
          {
            switchToHttp: () => ({
              getRequest: () => ({
                method: "POST",
                url: "/x",
                params: { organizationId: "naai" },
                headers: { "x-correlation-id": "c1" },
              }),
            }),
          } as never,
          { handle: () => of("ok") } as never,
        )
        .subscribe({ next: resolve, error: reject }),
    );
    expect(result).toBe("ok");
    expect(store.start).toHaveBeenCalledOnce();
    expect(store.finish).toHaveBeenCalledWith(
      "naai",
      expect.any(String),
      expect.objectContaining({ status: "succeeded" }),
    );
  });

  it.each(["GET", "HEAD", "OPTIONS"])("skips read-only %s requests", async (method) => {
    const store = {
      start: vi.fn().mockResolvedValue(undefined),
      finish: vi.fn().mockResolvedValue(undefined),
    };
    const interceptor = new RequestLifecycleInterceptor(store as never);
    const result = await new Promise<unknown>((resolve, reject) =>
      interceptor
        .intercept(
          {
            switchToHttp: () => ({
              getRequest: () => ({
                method,
                url: "/x",
                params: { organizationId: "naai" },
                headers: { "x-correlation-id": "c1" },
              }),
            }),
          } as never,
          { handle: () => of("ok") } as never,
        )
        .subscribe({ next: resolve, error: reject }),
    );
    expect(result).toBe("ok");
    expect(store.start).not.toHaveBeenCalled();
    expect(store.finish).not.toHaveBeenCalled();
  });
});
