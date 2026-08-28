import { describe, expect, it, vi } from "vitest";
import { RequestLifecycleInterceptor } from "./request-lifecycle.interceptor.js";
import { of } from "rxjs";

describe("RequestLifecycleInterceptor", () => {
  it("records running then succeeded lifecycle", async () => {
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
                method: "GET",
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
});
