import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { NaaiErpClient } from "./client.js";
import { buildDraftsRecordCliPayload } from "./draft-recording-cli.js";

const execFileAsync = promisify(execFile);

describe("ERP-989 draft recording CLI routing and payload builder", () => {
  it("builds dry-run and commit payloads for drafts record --dry-run|--commit", async () => {
    await expect(buildDraftsRecordCliPayload("record", {})).rejects.toThrow(
      "drafts record requires exactly one of --dry-run or --commit",
    );
    await expect(
      buildDraftsRecordCliPayload("record", { "dry-run": true, commit: true }),
    ).rejects.toThrow("drafts record requires exactly one of --dry-run or --commit");
    await expect(buildDraftsRecordCliPayload("record", { commit: true })).rejects.toThrow(
      "drafts record --commit requires --plan-hash",
    );

    const dryRunPayload = await buildDraftsRecordCliPayload("record", {
      "dry-run": true,
      data: JSON.stringify([{ kind: "expense", id: "exp-1" }]),
    });
    expect(dryRunPayload).toEqual({
      items: [{ kind: "expense", id: "exp-1" }],
      dryRun: true,
      commit: false,
    });

    const commitPayload = await buildDraftsRecordCliPayload("record", {
      commit: true,
      "plan-hash": "abc123hash",
      reason: "Chủ ghi sổ lô tháng 8",
    });
    expect(commitPayload).toEqual({
      dryRun: false,
      commit: true,
      planHash: "abc123hash",
      reason: "Chủ ghi sổ lô tháng 8",
    });
  });

  it("routes expenses record, commercial-documents record, and drafts record over REST", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { journalId: "jr-1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-solo", token: "owner-token" },
      fetchFn,
    );

    await client.request("expenses", "record", {}, "exp-101", undefined, "idem-exp-rec");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-solo/expenses/exp-101/record",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "idem-exp-rec" }),
      }),
    );

    await client.request(
      "commercial-documents",
      "record",
      { reason: "Chủ ghi sổ" },
      "doc-202",
      undefined,
      "idem-doc-rec",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-solo/commercial-documents/doc-202/record",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "idem-doc-rec" }),
      }),
    );

    await client.request(
      "drafts",
      "record",
      { dryRun: true, items: [{ kind: "expense", id: "exp-101" }] },
      undefined,
      undefined,
      "idem-batch-dry",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-solo/drafts/record",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ dryRun: true, items: [{ kind: "expense", id: "exp-101" }] }),
      }),
    );
  });

  it("executes CLI drafts record --dry-run and --commit end-to-end via main.ts", async () => {
    const received: Array<{ url: string; headers: Record<string, unknown>; body: unknown }> = [];
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        received.push({
          url: req.url ?? "",
          headers: req.headers,
          body: raw ? JSON.parse(raw) : undefined,
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({ data: { planHash: "plan-sha-989", committed: received.length === 2 } }),
        );
      });
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;
    const cliEntry = resolve(import.meta.dirname, "main.ts");
    const tsxBin = resolve(import.meta.dirname, "../node_modules/.bin/tsx");

    try {
      const cliEnv = { ...process.env, NAAI_ERP_TOKEN: "tok-owner" };
      const dryOut = await execFileAsync(
        tsxBin,
        [
          cliEntry,
          "drafts",
          "record",
          "--dry-run",
          "--base-url",
          baseUrl,
          "--organization",
          "org-cli-989",
        ],
        { env: cliEnv },
      );
      expect(JSON.parse(dryOut.stdout).data.planHash).toBe("plan-sha-989");

      const commitOut = await execFileAsync(
        tsxBin,
        [
          cliEntry,
          "drafts",
          "record",
          "--commit",
          "--plan-hash",
          "plan-sha-989",
          "--idempotency-key",
          "idem-cli-commit-989",
          "--base-url",
          baseUrl,
          "--organization",
          "org-cli-989",
        ],
        { env: cliEnv },
      );
      expect(JSON.parse(commitOut.stdout).data.committed).toBe(true);
      expect(received).toHaveLength(2);
      expect(received[0]!.body).toEqual({ dryRun: true, commit: false });
      expect(received[1]!.body).toEqual({
        dryRun: false,
        commit: true,
        planHash: "plan-sha-989",
      });
      expect(received[1]!.headers["idempotency-key"]).toBe("idem-cli-commit-989");
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });
});
