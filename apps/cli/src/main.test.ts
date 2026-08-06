import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliDirectory = fileURLToPath(new URL("..", import.meta.url));
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function invoke(args: string[]) {
  let requestedUrl = "";
  const server = createServer((request, response) => {
    requestedUrl = request.url ?? "";
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ apiVersion: "v1", data: {} }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_REQUIRED");

  const result = await execFileAsync(
    fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url)),
    ["src/main.ts", ...args, "--base-url", `http://127.0.0.1:${address.port}`],
    {
      cwd: cliDirectory,
      env: {
        ...process.env,
        NAAI_ERP_ORGANIZATION: "org-a",
        NAAI_ERP_TOKEN: "secret",
      },
    },
  );
  return { ...result, requestedUrl };
}

describe("ERP-640 CLI executable", () => {
  it("maps report options to the executive metrics projection query", async () => {
    const result = await invoke([
      "executive-metrics",
      "equity",
      "--from",
      "2026-01-01",
      "--to",
      "2026-01-31",
      "--as-of",
      "2026-02-01T00:00:00Z",
      "--framework",
      "TT133",
      "--project-id",
      "project-1",
    ]);

    expect(result.requestedUrl).toBe(
      "/api/v1/organizations/org-a/reports/executive-metrics/equity?startsOn=2026-01-01&endsOn=2026-01-31&asOfInstant=2026-02-01T00%3A00%3A00Z&framework=TT133&projectId=project-1",
    );
    expect(JSON.parse(result.stdout)).toMatchObject({ apiVersion: "v1" });
  });

  it("maps ROI fact filters without routing through master data", async () => {
    const result = await invoke([
      "roi-input-facts",
      "list",
      "--definition-id",
      "roi-project",
      "--review-state",
      "reviewed",
    ]);

    expect(result.requestedUrl).toBe(
      "/api/v1/organizations/org-a/roi-input-facts?definitionId=roi-project&reviewState=reviewed",
    );
  });
});

describe("ERP-650 CLI executable", () => {
  it("maps snapshot exact-version reads", async () => {
    const result = await invoke([
      "report-snapshots",
      "get",
      "--key",
      "snapshot-1",
      "--snapshot-version",
      "3",
    ]);
    expect(result.requestedUrl).toBe(
      "/api/v1/organizations/org-a/report-snapshots/snapshot-1?version=3",
    );
  });

  it("maps accountant export creation flags", async () => {
    const result = await invoke([
      "accountant-exports",
      "create",
      "--snapshot-id",
      "snapshot-1",
      "--snapshot-version",
      "2",
      "--format",
      "xlsx",
      "--report-kind",
      "profit_and_loss",
    ]);
    expect(result.requestedUrl).toBe("/api/v1/organizations/org-a/accountant-exports");
  });

  it("writes download bytes only to an explicit output and emits JSON metadata", async () => {
    const bytes = new Uint8Array([80, 75, 3, 4, 20, 6]);
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": 'attachment; filename="accountant.xlsx"',
      });
      response.end(bytes);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_REQUIRED");
    const directory = await mkdtemp(join(tmpdir(), "naai-erp-cli-"));
    const output = join(directory, "export.xlsx");
    try {
      const result = await execFileAsync(
        fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url)),
        [
          "src/main.ts",
          "accountant-exports",
          "download",
          "--key",
          "export-1",
          "--snapshot-version",
          "2",
          "--output",
          output,
          "--base-url",
          `http://127.0.0.1:${address.port}`,
        ],
        {
          cwd: cliDirectory,
          env: {
            ...process.env,
            NAAI_ERP_ORGANIZATION: "org-a",
            NAAI_ERP_TOKEN: "secret",
          },
        },
      );
      expect([...new Uint8Array(await readFile(output))]).toEqual([...bytes]);
      expect(JSON.parse(result.stdout)).toMatchObject({
        output,
        bytes: bytes.byteLength,
        filename: "accountant.xlsx",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("ERP-700 CLI executable", () => {
  it("maps a typed financial source resolver query", async () => {
    const result = await invoke([
      "financial-source-resolver",
      "get",
      "--journal-id",
      "journal-1",
      "--line-number",
      "2",
    ]);
    expect(result.requestedUrl).toBe(
      "/api/v1/organizations/org-a/reports/financial-statements/source-resolver?journalId=journal-1&lineNumber=2",
    );
  });
});
