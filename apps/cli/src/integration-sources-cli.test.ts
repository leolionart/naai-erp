import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { NaaiErpClient } from "./client.js";
import {
  buildIntegrationSourcesCliPayload,
  resolveIntegrationSourcesCliRoute,
} from "./integration-sources-cli.js";

const execFileAsync = promisify(execFile);

describe("ERP-990 integration-sources and api-credentials CLI", () => {
  it("resolves REST routes and builds autoRecord payloads cleanly", async () => {
    expect(
      resolveIntegrationSourcesCliRoute({
        baseUrl: "http://localhost:3001",
        organizationId: "org-1",
        resource: "integration-sources",
        action: "list",
      }),
    ).toEqual({
      method: "GET",
      url: "http://localhost:3001/api/v1/organizations/org-1/integration-sources",
      includeBody: false,
    });

    expect(
      resolveIntegrationSourcesCliRoute({
        baseUrl: "http://localhost:3001",
        organizationId: "org-1",
        resource: "integration-sources",
        action: "update",
        key: "src-1",
      }),
    ).toEqual({
      method: "PATCH",
      url: "http://localhost:3001/api/v1/organizations/org-1/integration-sources/src-1",
      includeBody: true,
    });

    expect(
      resolveIntegrationSourcesCliRoute({
        baseUrl: "http://localhost:3001",
        organizationId: "org-1",
        resource: "api-credentials",
        action: "set-auto-record",
        key: "cred-int",
      }),
    ).toEqual({
      method: "PATCH",
      url: "http://localhost:3001/api/v1/organizations/org-1/api-credentials/cred-int",
      includeBody: true,
    });

    await expect(
      buildIntegrationSourcesCliPayload("update", {
        "auto-record": "true",
        name: "n8n OCR Token",
        reason: "Bật tự động ghi sổ",
      }),
    ).resolves.toEqual({
      autoRecord: true,
      name: "n8n OCR Token",
      reason: "Bật tự động ghi sổ",
    });

    await expect(
      buildIntegrationSourcesCliPayload("update", {
        "auto-record": "invalid",
      }),
    ).rejects.toThrow("--auto-record must be true or false");
  });

  it("supports typed NaaiErpClient methods for integration sources and API credentials", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          data: {
            url,
            method: init?.method,
            body: init?.body ? JSON.parse(String(init.body)) : null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const client = new NaaiErpClient(
      { baseUrl: "http://localhost:3001", organizationId: "org-990", token: "tok-owner" },
      fetchMock as unknown as typeof fetch,
    );

    const listRes = (await client.listIntegrationSources()) as {
      data: { url: string; method: string };
    };
    expect(listRes.data.method).toBe("GET");
    expect(listRes.data.url).toBe(
      "http://localhost:3001/api/v1/organizations/org-990/integration-sources",
    );

    const patchCred = (await client.updateApiCredential(
      "cred-n8n",
      { autoRecord: true },
      "idem-cred-1",
    )) as { data: { url: string; method: string; body: unknown } };
    expect(patchCred.data.method).toBe("PATCH");
    expect(patchCred.data.url).toBe(
      "http://localhost:3001/api/v1/organizations/org-990/api-credentials/cred-n8n",
    );
    expect(patchCred.data.body).toEqual({ autoRecord: true });
  });

  it("executes main.ts end-to-end for integration-sources and api-credentials update", async () => {
    const requests: Array<{
      method: string;
      url: string;
      headers: Record<string, unknown>;
      body: unknown;
    }> = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += String(chunk)));
      req.on("end", () => {
        requests.push({
          method: req.method ?? "",
          url: req.url ?? "",
          headers: req.headers as Record<string, unknown>,
          body: body ? JSON.parse(body) : null,
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ apiVersion: "v1", data: { autoRecord: true } }));
      });
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      const tsxBin = resolve(import.meta.dirname, "../node_modules/.bin/tsx");
      const cliEntry = resolve(import.meta.dirname, "main.ts");
      const env = { ...process.env, NAAI_ERP_TOKEN: "owner-token" };
      const out = await execFileAsync(
        tsxBin,
        [
          cliEntry,
          "api-credentials",
          "update",
          "--key",
          "cred-int",
          "--version",
          "2",
          "--auto-record",
          "true",
          "--reason",
          "Enable n8n autoRecord",
          "--idempotency-key",
          "cli-idem-990",
          "--base-url",
          `http://127.0.0.1:${port}`,
          "--organization",
          "org-cli-990",
        ],
        { env },
      );
      expect(JSON.parse(out.stdout).data.autoRecord).toBe(true);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.method).toBe("PATCH");
      expect(requests[0]?.url).toBe("/api/v1/organizations/org-cli-990/api-credentials/cred-int");
      expect(requests[0]?.headers["if-match"]).toBe("2");
      expect(requests[0]?.headers["idempotency-key"]).toBe("cli-idem-990");
      expect(requests[0]?.body).toEqual({
        autoRecord: true,
        reason: "Enable n8n autoRecord",
      });
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });
});
