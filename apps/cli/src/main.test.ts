import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  let requestBody = "";
  let requestMethod = "";
  let requestHeaders: Record<string, string | string[] | undefined> = {};
  const server = createServer((request, response) => {
    requestedUrl = request.url ?? "";
    requestMethod = request.method ?? "";
    requestHeaders = request.headers;
    request.on("data", (chunk) => {
      requestBody += String(chunk);
    });
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ apiVersion: "v1", data: {} }));
    });
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
  return { ...result, requestedUrl, requestBody, requestMethod, requestHeaders };
}

describe("ERP-640 CLI executable", () => {
  it("creates a quick purchase invoice with the exact payload and stable retry key", async () => {
    const payload = {
      schemaVersion: 1,
      supplierTaxId: "0110660175",
      supplierName: "Nhà cung cấp A",
      documentNumber: "00250571",
      documentDate: "2026-07-27",
      category: "BATTERY_RENTAL",
      description: "Phí dịch vụ tháng 7",
      grossMinor: "408601",
    };
    const result = await invoke([
      "quick-purchase-invoices",
      "create",
      "--data",
      JSON.stringify(payload),
      "--idempotency-key",
      "paperless-246-v1",
    ]);
    expect(result.requestedUrl).toBe(
      "/api/v1/organizations/org-a/commercial-documents/purchase-invoice-ingestion",
    );
    expect(result.requestMethod).toBe("POST");
    expect(JSON.parse(result.requestBody)).toEqual(payload);
    expect(result.requestHeaders["idempotency-key"]).toBe("paperless-246-v1");
  });

  it("reads both monthly expense breakdown resources", async () => {
    const payee = await invoke([
      "expense-report-by-payee",
      "get",
      "--from",
      "2026-01-01",
      "--to",
      "2026-12-31",
    ]);
    expect(payee.requestedUrl).toBe(
      "/api/v1/organizations/org-a/reports/expenses/by-payee?startsOn=2026-01-01&endsOn=2026-12-31",
    );
    expect(payee.requestMethod).toBe("GET");
    const category = await invoke([
      "expense-report-by-category",
      "get",
      "--from",
      "2026-01-01",
      "--to",
      "2026-12-31",
    ]);
    expect(category.requestedUrl).toBe(
      "/api/v1/organizations/org-a/reports/expenses/by-category?startsOn=2026-01-01&endsOn=2026-12-31",
    );
  });
  it("manages service plans and customer subscriptions through canonical REST routes", async () => {
    const plans = await invoke([
      "service-plans",
      "list",
      "--service-line",
      "managed-hosting",
      "--active-only",
    ]);
    expect(plans.requestedUrl).toBe(
      "/api/v1/organizations/org-a/service-plans?serviceLineCode=managed-hosting&active=true",
    );

    const created = await invoke([
      "customer-service-subscriptions",
      "create",
      "--data",
      JSON.stringify({
        customerId: "party-client",
        servicePlanId: "plan-hosting",
        projectId: "project-contract",
        startsOn: "2026-08-01",
      }),
      "--idempotency-key",
      "subscription-create-1",
    ]);
    expect(created.requestedUrl).toBe("/api/v1/organizations/org-a/customer-service-subscriptions");
    expect(created.requestMethod).toBe("POST");
    expect(created.requestHeaders["idempotency-key"]).toBe("subscription-create-1");

    const active = await invoke([
      "customer-service-subscriptions",
      "list",
      "--customer-id",
      "party-client",
      "--service-plan-id",
      "plan-hosting",
      "--project-id",
      "project-contract",
      "--status",
      "active",
    ]);
    expect(active.requestedUrl).toBe(
      "/api/v1/organizations/org-a/customer-service-subscriptions?customerId=party-client&servicePlanId=plan-hosting&projectId=project-contract&lifecycle=active",
    );

    const paused = await invoke([
      "customer-service-subscriptions",
      "pause",
      "--key",
      "subscription-1",
      "--version",
      "2",
      "--idempotency-key",
      "subscription-pause-1",
      "--data",
      JSON.stringify({ reason: "Customer requested a temporary pause", effectiveOn: "2026-09-01" }),
    ]);
    expect(paused.requestedUrl).toBe(
      "/api/v1/organizations/org-a/customer-service-subscriptions/subscription-1/pause",
    );
    expect(paused.requestHeaders["if-match"]).toBe("2");
    expect(paused.requestHeaders["idempotency-key"]).toBe("subscription-pause-1");

    expect(
      (
        await invoke([
          "customer-service-subscriptions",
          "schedule-preview",
          "--key",
          "subscription-1",
          "--through",
          "2026-12-31",
        ])
      ).requestedUrl,
    ).toBe(
      "/api/v1/organizations/org-a/customer-service-subscriptions/subscription-1/schedule-preview?through=2026-12-31",
    );
  });

  it("manages purchase product VAT through the generic master-data REST contract", async () => {
    const created = await invoke([
      "purchase-products",
      "create",
      "--data",
      JSON.stringify({
        data: { code: "HOSTING", name: "Dịch vụ hosting", vat_rate_percent: 8 },
      }),
      "--idempotency-key",
      "purchase-product-create",
    ]);
    expect(created.requestedUrl).toBe("/api/v1/organizations/org-a/master-data/purchase-products");
    expect(JSON.parse(created.requestBody)).toEqual({
      data: { code: "HOSTING", name: "Dịch vụ hosting", vat_rate_percent: 8 },
    });
    expect((await invoke(["purchase-products", "list"])).requestedUrl).toBe(
      "/api/v1/organizations/org-a/master-data/purchase-products",
    );
  });

  it("exposes relationship backfill inventory, dry-run, and commit as explicit REST actions", async () => {
    const inventory = await invoke(["commercial-document-relationship-backfill", "inventory"]);
    expect(inventory.requestedUrl).toBe(
      "/api/v1/organizations/org-a/commercial-documents/relationship-backfill/inventory",
    );

    const dryRunPayload = JSON.stringify({
      replacement: { schemaVersion: 1, lines: [] },
      reason: "Attach reviewed project and contract relationships",
    });
    const dryRun = await invoke([
      "commercial-document-relationship-backfill",
      "dry-run",
      "--key",
      "document-1",
      "--version",
      "2",
      "--data",
      dryRunPayload,
    ]);
    expect(dryRun.requestedUrl).toBe(
      "/api/v1/organizations/org-a/commercial-documents/document-1/relationship-backfill/dry-run",
    );
    expect(JSON.parse(dryRun.requestBody)).toEqual(JSON.parse(dryRunPayload));

    const commitPayload = JSON.stringify({
      replacement: { schemaVersion: 1, lines: [] },
      reason: "Attach reviewed project and contract relationships",
      planHash: "a".repeat(64),
    });
    const commit = await invoke([
      "expense-relationship-backfill",
      "commit",
      "--key",
      "expense-1",
      "--version",
      "3",
      "--idempotency-key",
      "expense-relationship-backfill-1",
      "--data",
      commitPayload,
    ]);
    expect(commit.requestedUrl).toBe(
      "/api/v1/organizations/org-a/expenses/expense-1/relationship-backfill/commit",
    );
    expect(JSON.parse(commit.requestBody)).toEqual(JSON.parse(commitPayload));
  });

  it("requires explicit backup evidence before routing a local organization reset", async () => {
    const result = await invoke([
      "portable-data-reset",
      "local",
      "--confirm-organization",
      "org-a",
      "--key",
      "package-1",
      "--workbook-sha256",
      "a".repeat(64),
      "--idempotency-key",
      "reset-1",
    ]);
    expect(result.requestedUrl).toBe(
      "/api/v1/organizations/org-a/portable-data-packages/local-admin/reset",
    );
    const payload = JSON.parse(result.requestBody ?? "{}");
    expect(payload).toEqual({
      confirmOrganizationId: "org-a",
      packageId: "package-1",
      workbookSha256: "a".repeat(64),
    });
  });
  it("downloads sales invoice and purchase-expense filtered workbooks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "naai-erp-list-export-"));
    try {
      const sales = await invoke([
        "sales-invoice-export",
        "download",
        "--from",
        "2026-01-01",
        "--to",
        "2026-12-31",
        "--party",
        "party-1",
        "--output",
        join(directory, "sales.xlsx"),
      ]);
      expect(sales.requestedUrl).toBe(
        "/api/v1/organizations/org-a/accounting-list-exports/sales-invoices?startsOn=2026-01-01&endsOn=2026-12-31&partyId=party-1",
      );
      const purchases = await invoke([
        "purchase-expense-export",
        "download",
        "--from",
        "2026-01-01",
        "--to",
        "2026-12-31",
        "--invoice-presence",
        "missing",
        "--output",
        join(directory, "purchases.xlsx"),
      ]);
      expect(purchases.requestedUrl).toContain(
        "/accounting-list-exports/purchase-invoices-expenses?",
      );
      expect(purchases.requestedUrl).toContain("invoicePresence=missing");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 15_000);

  it("downloads the management workbook with backend/dashboard formula controls", async () => {
    const directory = await mkdtemp(join(tmpdir(), "naai-erp-management-export-"));
    try {
      const result = await invoke([
        "management-workbook",
        "download",
        "--from",
        "2026-01-01",
        "--to",
        "2026-12-31",
        "--output",
        join(directory, "management.xlsx"),
      ]);
      expect(result.requestedUrl).toBe(
        "/api/v1/organizations/org-a/accounting-list-exports/management-workbook?startsOn=2026-01-01&endsOn=2026-12-31",
      );
      expect(result.requestMethod).toBe("GET");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 15_000);
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

  it("routes guarded empty-tenant restore through the portable REST API", async () => {
    const directory = await mkdtemp(join(tmpdir(), "naai-restore-"));
    const workbook = join(directory, "full-package.xlsx");
    await writeFile(workbook, Buffer.from("restore fixture"));
    try {
      const result = await invoke([
        "portable-data-restore",
        "empty",
        "--file",
        workbook,
        "--key",
        "package-1",
        "--source-organization",
        "source-org",
        "--confirm-organization",
        "org-a",
        "--reason",
        "Production cutover",
        "--idempotency-key",
        "restore-once",
      ]);
      expect(result.requestedUrl).toBe(
        "/api/v1/organizations/org-a/portable-data-packages/imports/restore-empty",
      );
      expect(JSON.parse(result.requestBody)).toMatchObject({
        sourceOrganizationId: "source-org",
        confirmTargetOrganizationId: "org-a",
        packageId: "package-1",
        mapSourceActorsToTargetActor: true,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("routes audited deletion of an operational project", async () => {
    const result = await invoke([
      "projects",
      "delete",
      "--key",
      "eyJpZCI6ImR1cGxpY2F0ZSJ9",
      "--version",
      "3",
      "--data",
      '{"reason":"Bản ghi nhập trùng"}',
      "--idempotency-key",
      "delete-project-1",
    ]);
    expect(result.requestedUrl).toBe(
      "/api/v1/organizations/org-a/master-data/projects/eyJpZCI6ImR1cGxpY2F0ZSJ9",
    );
    expect(JSON.parse(result.requestBody)).toEqual({ reason: "Bản ghi nhập trùng" });
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
