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

  it("T-INT-READ-007 records responseBytes/itemCount and warns only for large GET responses", async () => {
    const run = async (method: string, body: unknown) => {
      const store = {
        start: vi.fn().mockResolvedValue(undefined),
        finish: vi.fn().mockResolvedValue(undefined),
      };
      await new Promise<unknown>((resolve, reject) =>
        new RequestLifecycleInterceptor(store as never)
          .intercept(
            {
              switchToHttp: () => ({
                getRequest: () => ({
                  method,
                  url: "/expenses",
                  params: { organizationId: "naai" },
                }),
              }),
            } as never,
            { handle: () => of(body) } as never,
          )
          .subscribe({ next: resolve, error: reject }),
      );
      return store;
    };
    process.env.API_LARGE_RESPONSE_WARN_BYTES = "500";
    try {
      const small = await run("GET", { data: { items: [{ id: "a" }] } });
      expect(small.finish).not.toHaveBeenCalled();
      const large = await run("GET", { data: { items: [{ pad: "x".repeat(600) }] } });
      expect(large.finish).toHaveBeenCalledWith(
        "naai",
        expect.any(String),
        expect.objectContaining({
          severity: "warning",
          details: expect.objectContaining({ itemCount: 1, responseBytes: expect.any(Number) }),
        }),
      );
      const post = await run("POST", { data: { items: [1, 2] } });
      expect(post.finish).toHaveBeenCalledWith(
        "naai",
        expect.any(String),
        expect.objectContaining({ details: expect.objectContaining({ itemCount: 2 }) }),
      );
    } finally {
      delete process.env.API_LARGE_RESPONSE_WARN_BYTES;
    }
  });
});
