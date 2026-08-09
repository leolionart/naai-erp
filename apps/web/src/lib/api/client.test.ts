import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { ApiClientError } from "./types";

const connection = () => ({
  version: 1 as const,
  baseUrl: "http://localhost:3001",
  organizationId: "org-naai",
});

describe("ERP-345 API client", () => {
  it("adds organization/auth/correlation/idempotency/version headers and unwraps data", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ apiVersion: "v1", data: { id: "journal-1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const ids = ["idem-1", "corr-1"];
    const client = createApiClient({
      connection,
      token: () => "Bearer token-1",
      fetcher,
      uuid: () => ids.shift() ?? "later",
    });
    await expect(
      client.data<{ id: string }>("journals", {
        method: "POST",
        body: { description: "Test" },
        expectedVersion: "3",
      }),
    ).resolves.toEqual({ id: "journal-1" });
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/organizations/org-naai/journals",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({
          authorization: "Bearer token-1",
          "idempotency-key": "idem-1",
          "x-correlation-id": "corr-1",
          "if-match": "3",
        }),
      }),
    );
  });

  it("reuses the idempotency key after a failed retryable request", async () => {
    const headers: string[] = [];
    let attempt = 0;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      headers.push(String((init?.headers as Record<string, string>)["idempotency-key"]));
      attempt += 1;
      return new Response(
        JSON.stringify(
          attempt === 1
            ? { error: { code: "TEMPORARY", message: "Try again" } }
            : { data: { ok: true } },
        ),
        { status: attempt === 1 ? 503 : 200 },
      );
    });
    const client = createApiClient({
      connection,
      token: () => "token",
      fetcher,
      uuid: () => "stable-key",
    });
    const options = { method: "POST" as const, body: { amountMinor: "100" } };
    await expect(client.request("journals", options)).rejects.toMatchObject({ code: "TEMPORARY" });
    await expect(client.data("journals", options)).resolves.toEqual({ ok: true });
    expect(headers).toEqual(["stable-key", "stable-key"]);
  });

  it("returns structured client errors for invalid JSON and network failures", async () => {
    const invalid = createApiClient({
      connection,
      token: () => "",
      fetcher: async () => new Response("not-json", { status: 502 }),
    });
    await expect(invalid.request("journals")).rejects.toMatchObject({
      code: "INVALID_JSON_RESPONSE",
      status: 502,
    });
    const offline = createApiClient({
      connection,
      token: () => "",
      fetcher: async () => {
        throw new Error("offline");
      },
    });
    await expect(offline.request("journals")).rejects.toBeInstanceOf(ApiClientError);
  });
});
