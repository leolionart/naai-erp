import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-857 management workbook API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const organizationId = "org-erp857-workbook";
  const token = "erp857-workbook-accountant";
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone)
       values ($1,'ERP 857 Workbook Org','VND','Asia/Ho_Chi_Minh')
       on conflict (id) do nothing`,
      [organizationId],
    );
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles)
       values ($1,'cred-erp857-workbook','accountant-erp857',$2,'["accountant"]')
       on conflict (organization_id,id) do nothing`,
      [organizationId, createHash("sha256").update(token).digest("hex")],
    );
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool.query(`delete from api_credentials where organization_id=$1`, [organizationId]);
    await pool.query(`delete from organizations where id=$1`, [organizationId]);
    await pool.end();
  });

  it("downloads a deterministic canonical workbook and exposes its checksum", async () => {
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/accounting-list-exports/management-workbook?startsOn=2026-01-01&endsOn=2026-12-31`,
        headers: { authorization: `Bearer ${token}` },
      });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers["x-content-sha256"]).toBe(
      createHash("sha256").update(response.rawPayload).digest("hex"),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.rawPayload as never);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Doanh thu",
      "Công nợ",
      "Chi phí",
      "Chỉ số tháng",
      "Kế hoạch & mục tiêu",
      "Hạng mục chi",
      "Controls",
    ]);
    expect(workbook.getWorksheet("Controls")?.getColumn(1).values).toContain(
      "Payroll / Bảng lương",
    );
    const repeated = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/accounting-list-exports/management-workbook?startsOn=2026-01-01&endsOn=2026-12-31`,
        headers: { authorization: `Bearer ${token}` },
      });
    expect(repeated.headers["x-content-sha256"]).toBe(response.headers["x-content-sha256"]);
    expect(repeated.rawPayload.equals(response.rawPayload)).toBe(true);
  });

  it("rejects invalid ranges before querying workbook data", async () => {
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/accounting-list-exports/management-workbook?startsOn=2026-12-31&endsOn=2026-01-01`,
        headers: { authorization: `Bearer ${token}` },
      });
    expect(response.statusCode).toBe(400);
  });
});
