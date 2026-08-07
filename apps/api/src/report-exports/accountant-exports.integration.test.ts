import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-650 immutable report snapshots and accountant exports", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const token = "erp650-accountant";
  const otherToken = "erp650-other-accountant";
  const headers = (key?: string) => ({
    authorization: `Bearer ${token}`,
    ...(key ? { "idempotency-key": key } : {}),
  });
  const snapshotPayload = {
    reportKind: "profit_and_loss",
    period: { startsOn: "2026-08-01", endsOn: "2026-08-31", asOfDate: "2026-08-31" },
    dimensions: {},
    accountingBasis: "accrual",
    framework: "TT133",
    formulaVersions: { profitAndLoss: "profit-and-loss-v1" },
    request: {
      snapshotId: "erp650-august",
      asOfInstant: "2026-08-31T16:59:59.000Z",
    },
  };

  beforeAll(async () => {
    await pool.query(`
      insert into organizations(id,legal_name,base_currency,timezone)
      values ('org-erp650','ERP 650 Org','VND','Asia/Ho_Chi_Minh'),
             ('org-erp650-other','ERP 650 Other','VND','Asia/Ho_Chi_Minh');
      insert into api_credentials(organization_id,id,actor_id,token_hash,roles)
      values ('org-erp650','cred-650','accountant-650','${createHash("sha256").update(token).digest("hex")}',
              '["accountant","finance_admin"]'),
             ('org-erp650-other','cred-650-other','accountant-650-other','${createHash("sha256").update(otherToken).digest("hex")}',
              '["accountant"]');
      insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting)
      values ('org-erp650','111','Bank','asset',false,true),
             ('org-erp650','511','Revenue','revenue',false,true),
             ('org-erp650','642','Expense','expense',false,true);
      insert into financial_statement_mapping_versions
        (organization_id,id,version,framework,state,effective_from,change_reason,report_policy,created_by,approved_by,approved_at)
      values ('org-erp650','map-650',1,'TT133','approved','2026-01-01','ERP-650 fixture',
        '{"maxLedgerDifferenceMinor":"0","maxUnreviewedInputMinor":"0","maxUnresolvedItemCount":0,"maxMissingEvidenceCount":0}',
        'fixture-maker','fixture-approver',now());
      insert into financial_statement_mapping_lines
        (organization_id,mapping_id,mapping_version,line_number,statement,line_code,label,account_code,display_order,sign)
      values ('org-erp650','map-650',1,1,'profit_and_loss','revenue','Revenue','511',10,1),
             ('org-erp650','map-650',1,2,'profit_and_loss','opex','Operating expense','642',20,1);
      insert into journal_entries
        (organization_id,id,journal_date,description,currency,state,posted_at,posted_by,approved_at,approved_by,approval_reason)
      values ('org-erp650','sale-650','2026-08-10','Sale','VND','posted','2026-08-10T10:00:00Z','fixture','2026-08-10T09:00:00Z','fixture','Fixture'),
             ('org-erp650','expense-650','2026-08-11','Expense','VND','posted','2026-08-11T10:00:00Z','fixture','2026-08-11T09:00:00Z','fixture','Fixture');
      insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
      values ('org-erp650','sale-650',1,'111',100,null,'Cash','{}'),
             ('org-erp650','sale-650',2,'511',null,100,'Revenue','{}'),
             ('org-erp650','expense-650',1,'642',20,null,'Expense','{}'),
             ('org-erp650','expense-650',2,'111',null,20,'Cash','{}');
    `);
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("captures an immutable organization-scoped snapshot and reproduces it", async () => {
    const request = {
      method: "POST" as const,
      url: "/api/v1/organizations/org-erp650/report-snapshots",
      headers: headers("snapshot-create"),
      payload: snapshotPayload,
    };
    const created = await app.inject(request);
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().data).toMatchObject({
      id: "erp650-august",
      version: 1,
      state: "captured",
      readiness: "final",
      idempotencyReplayed: false,
    });
    expect(created.json().data.snapshotHash).toHaveLength(64);
    expect((await app.inject(request)).json().data.idempotencyReplayed).toBe(true);

    const other = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp650-other/report-snapshots/erp650-august?version=1",
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(other.statusCode).toBe(404);

    const reproduced = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp650/report-snapshots/erp650-august/versions/1/reproduce",
      headers: headers(),
    });
    expect(reproduced.statusCode, reproduced.body).toBe(201);
    expect(reproduced.json().data).toMatchObject({
      requestMatches: true,
      resultMatches: true,
      reproducible: true,
    });
    await expect(
      pool.query(
        `update report_snapshots set accounting_basis='cash' where organization_id='org-erp650' and id='erp650-august'`,
      ),
    ).rejects.toThrow(/immutable/i);
  });

  it("generates audited deterministic CSV and XLSX from one workbook model", async () => {
    const create = async (format: "csv" | "xlsx") => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/organizations/org-erp650/accountant-exports",
        headers: headers(`export-${format}`),
        payload: {
          snapshotId: "erp650-august",
          snapshotVersion: 1,
          reportKind: "profit_and_loss",
          format,
        },
      });
      expect(response.statusCode, response.body).toBe(201);
      return response.json().data as Record<string, unknown>;
    };
    const csv = await create("csv");
    const xlsx = await create("xlsx");
    expect(csv.workbookHash).toBe(xlsx.workbookHash);
    expect(csv.isFinal).toBe(true);
    expect(String(csv.contentHash)).toHaveLength(64);
    expect(String(xlsx.contentHash)).toHaveLength(64);
    const repeatedCsv = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp650/accountant-exports",
      headers: headers("export-csv-repeat"),
      payload: {
        snapshotId: "erp650-august",
        snapshotVersion: 1,
        reportKind: "profit_and_loss",
        format: "csv",
      },
    });
    expect(repeatedCsv.statusCode, repeatedCsv.body).toBe(201);
    expect(repeatedCsv.json().data).toMatchObject({
      id: csv.id,
      workbookHash: csv.workbookHash,
    });
    const repeatedXlsx = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp650/accountant-exports",
      headers: headers("export-xlsx-repeat"),
      payload: {
        snapshotId: "erp650-august",
        snapshotVersion: 1,
        reportKind: "profit_and_loss",
        format: "xlsx",
      },
    });
    expect(repeatedXlsx.statusCode, repeatedXlsx.body).toBe(201);
    expect(repeatedXlsx.json().data).toMatchObject({
      id: xlsx.id,
      workbookHash: xlsx.workbookHash,
    });
    const csvFile = await app.inject({
      method: "GET",
      url: String(csv.downloadUrl),
      headers: headers(),
    });
    expect(csvFile.statusCode).toBe(200);
    expect(csvFile.headers["content-type"]).toContain("text/csv");
    expect(csvFile.body).toContain("Sheet,Row,Key,Value,Format");
    expect(csvFile.body).toContain("Mapping");
    expect(csvFile.body).toContain("Unresolved");
    expect(csvFile.body).toContain("Source");

    const xlsxFile = await app.inject({
      method: "GET",
      url: String(xlsx.downloadUrl),
      headers: headers(),
    });
    expect(xlsxFile.statusCode).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsxFile.rawPayload as never);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Summary",
      "Report",
      "Mapping",
      "Unresolved",
      "Source",
      "Journal Entries",
      "Journal Lines",
      "Sales Invoices",
      "Purchase Invoices",
      "Expenses",
      "Invoice Allocations",
      "Expense Allocations",
      "Bank Transactions",
      "Payments",
      "Reconciliations",
      "Payment Allocations",
      "Accounts",
      "Parties",
    ]);
    expect(workbook.getWorksheet("Report")?.autoFilter).toBeTruthy();
    expect(workbook.getWorksheet("Journal Lines")?.getCell("E2").numFmt).toContain("₫");
    expect(workbook.getWorksheet("Journal Entries")?.pageSetup.printTitlesRow).toBe("1:1");

    const audits = await pool.query(
      `select resource_type,action,after_state from resource_audit_events
       where organization_id='org-erp650' and resource_type in ('report_snapshot','accountant_export')`,
    );
    expect(audits.rows.map((row) => `${row.resource_type}:${row.action}`).sort()).toEqual([
      "accountant_export:generate",
      "accountant_export:generate",
      "report_snapshot:capture",
    ]);
    expect(
      audits.rows
        .filter((row) => row.action === "generate")
        .every((row) => row.after_state.contentHash),
    ).toBe(true);

    await pool.query(`
      insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting)
      values ('org-erp650','699','Unmapped expense','expense',false,true);
      insert into journal_entries
        (organization_id,id,journal_date,description,currency,state,posted_at,posted_by,approved_at,approved_by,approval_reason)
      values ('org-erp650','unmapped-650','2026-09-01','Unmapped','VND','posted','2026-09-01T10:00:00Z','fixture','2026-09-01T09:00:00Z','fixture','Fixture');
      insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
      values ('org-erp650','unmapped-650',1,'699',1,null,'Unmapped expense','{}'),
             ('org-erp650','unmapped-650',2,'111',null,1,'Cash','{}');
    `);
    const reviewSnapshot = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp650/report-snapshots",
      headers: headers("review-snapshot"),
      payload: {
        ...snapshotPayload,
        period: {
          startsOn: "2026-09-01",
          endsOn: "2026-09-30",
          asOfDate: "2026-09-30",
        },
        request: {
          snapshotId: "erp650-review",
          asOfInstant: "2026-09-30T16:59:59.000Z",
        },
      },
    });
    expect(reviewSnapshot.statusCode, reviewSnapshot.body).toBe(201);
    expect(reviewSnapshot.json().data.readiness).toBe("review_required");
    const reviewExport = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp650/accountant-exports",
      headers: headers("review-export"),
      payload: {
        snapshotId: "erp650-review",
        snapshotVersion: 1,
        reportKind: "profit_and_loss",
        format: "csv",
      },
    });
    expect(reviewExport.statusCode, reviewExport.body).toBe(201);
    expect(reviewExport.json().data).toMatchObject({ isFinal: false });
  });

  it("supersedes an export without deleting its immutable bytes", async () => {
    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp650/accountant-exports",
      headers: headers(),
    });
    const target = listed.json().data.items[0];
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/org-erp650/accountant-exports/${target.id}/versions/${target.version}/supersede`,
      headers: headers("supersede-export"),
      payload: { reason: "Replaced by accountant-reviewed package" },
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json().data.state).toBe("superseded");
    const download = await app.inject({
      method: "GET",
      url: String(target.downloadUrl),
      headers: headers(),
    });
    expect(download.statusCode).toBe(200);
  });
});
