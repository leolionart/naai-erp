import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

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

describe("ERP-800 operating dashboard CLI executable", () => {
  it("maps the dashboard date range to the canonical report endpoint", async () => {
    const result = await invoke([
      "operating-dashboard",
      "get",
      "--as-of",
      "2026-08-07",
      "--from",
      "2026-01-01",
      "--to",
      "2026-08-07",
      "--limit",
      "25",
    ]);

    expect(result.requestedUrl).toBe(
      "/api/v1/organizations/org-a/reports/operating-dashboard?asOf=2026-08-07&startsOn=2026-01-01&endsOn=2026-08-07&limit=25",
    );
  });
});

describe("ERP-850 portable organization data package CLI", () => {
  it("routes export, status, and inventory through the portable package REST API", async () => {
    expect(
      (
        await invoke([
          "portable-data-export",
          "export",
          "--as-of",
          "2026-08-07",
          "--idempotency-key",
          "export-once",
        ])
      ).requestedUrl,
    ).toBe("/api/v1/organizations/org-a/portable-data-packages/exports");
    expect(
      (await invoke(["portable-data-export", "status", "--key", "package-1"])).requestedUrl,
    ).toBe("/api/v1/organizations/org-a/portable-data-packages/exports/package-1");
    expect(
      (await invoke(["portable-data-export", "inventory", "--key", "package-1"])).requestedUrl,
    ).toBe("/api/v1/organizations/org-a/portable-data-packages/exports/package-1/inventory");
  });

  it("uploads workbook inventory and dry-run requests as multipart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "naai-erp-portable-"));
    const workbook = join(directory, "package.xlsx");
    await new ExcelJS.Workbook().xlsx.writeFile(workbook);
    try {
      expect(
        (await invoke(["portable-data-import", "inventory", "--file", workbook])).requestedUrl,
      ).toBe("/api/v1/organizations/org-a/portable-data-packages/imports/inventory");
      expect(
        (await invoke(["portable-data-import", "dry-run", "--file", workbook])).requestedUrl,
      ).toBe("/api/v1/organizations/org-a/portable-data-packages/imports/dry-run");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("routes import status and explicit commit controls", async () => {
    expect(
      (await invoke(["portable-data-import", "status", "--key", "import-1"])).requestedUrl,
    ).toBe("/api/v1/organizations/org-a/portable-data-packages/imports/import-1");
    expect(
      (
        await invoke([
          "portable-data-import",
          "commit",
          "--key",
          "import-1",
          "--dry-run-id",
          "dry-run-1",
          "--workbook-sha256",
          "abc123",
          "--idempotency-key",
          "commit-once",
        ])
      ).requestedUrl,
    ).toBe("/api/v1/organizations/org-a/portable-data-packages/imports/import-1/commit");
  });
});

describe("ERP-740 workbook-import CLI executable", () => {
  async function financeFixture() {
    const directory = await mkdtemp(join(tmpdir(), "naai-workbook-import-"));
    const path = join(directory, "finance.xlsx");
    const workbook = new ExcelJS.Workbook();
    const revenue = workbook.addWorksheet("Doanh thu");
    revenue.addRow([
      "Ngày thu",
      "Doanh thu dự án",
      "Giá trị hợp đồng",
      "VAT",
      "Tiền mặt",
      "Thực nhận",
      "Loại doanh thu",
      "Tháng",
      "Công ty/Khách hàng",
      "Ghi chú",
    ]);
    revenue.addRow([
      new Date("2025-01-01T00:00:00Z"),
      100,
      100,
      10,
      null,
      110,
      null,
      1,
      "Client",
      "",
    ]);
    const expenses = workbook.addWorksheet("Chi phí");
    expenses.addRow([
      "Ngày chi",
      "Tổng chi phí",
      "Tháng",
      "Manual Cost",
      "Tiền mặt",
      "% VAT",
      "VAT",
      "Invoice Date",
      "Loại chi phí",
      "Nhân sự",
      "Phòng ban",
      "Nguồn tiền",
      "Month",
      "Ghi chú",
    ]);
    expenses.addRow([
      new Date("2025-01-02T00:00:00Z"),
      55,
      1,
      55,
      null,
      null,
      5,
      null,
      "Chi phí vận hành",
      "Supplier",
      null,
      null,
      1,
      "Test",
    ]);
    await workbook.xlsx.writeFile(path);
    return { directory, path };
  }

  it("routes dry-run calls to the workbook-imports dry-run endpoint", async () => {
    const fixture = await financeFixture();
    try {
      const result = await invoke([
        "workbook-import",
        "dry-run",
        "--finance-workbook",
        fixture.path,
      ]);
      expect(result.requestedUrl).toBe("/api/v1/organizations/org-a/workbook-imports/dry-run");
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it("routes commit calls to the workbook-imports commit endpoint", async () => {
    const fixture = await financeFixture();
    try {
      const result = await invoke([
        "workbook-import",
        "commit",
        "--commit",
        "--finance-workbook",
        fixture.path,
      ]);
      expect(result.requestedUrl).toBe("/api/v1/organizations/org-a/workbook-imports/commit");
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });
});
