import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const path = process.env.ERP853_FULL_PACKAGE_PATH;
const enabled = process.env.RUN_DB_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL) && path;
const suite = enabled ? describe : describe.skip;

suite("ERP-853 current full package restore smoke", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = randomUUID();
  const target = `restore-full-${suffix}`;
  const actor = `restore-full-owner-${suffix}`;
  const token = `restore-full-token-${suffix}`;
  let app: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => {
    await pool.query(
      "insert into organizations(id,legal_name,base_currency,timezone) values($1,'Full restore target','VND','Asia/Ho_Chi_Minh')",
      [target],
    );
    await pool.query("insert into users(id,email,display_name) values($1,$2,'Restore Owner')", [
      actor,
      `${suffix}@example.com`,
    ]);
    await pool.query(
      "insert into organization_memberships(organization_id,user_id) values($1,$2)",
      [target, actor],
    );
    await pool.query(
      "insert into membership_roles(organization_id,user_id,role) values($1,$2,'owner')",
      [target, actor],
    );
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values($1,'credential',$2,$3,'["owner"]')`,
      [target, actor, createHash("sha256").update(token).digest("hex")],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    const tables = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.columns where table_schema='public' and column_name='organization_id'",
    );
    const pending = new Set(tables.rows.map((row) => row.table_name));
    while (pending.size) {
      let deleted = 0;
      for (const tableName of [...pending]) {
        try {
          await pool.query(`alter table "${tableName.replaceAll('"', '""')}" disable trigger user`);
          await pool.query(
            `delete from "${tableName.replaceAll('"', '""')}" where organization_id=$1`,
            [target],
          );
          await pool.query(`alter table "${tableName.replaceAll('"', '""')}" enable trigger user`);
          pending.delete(tableName);
          deleted += 1;
        } catch (error) {
          await pool
            .query(`alter table "${tableName.replaceAll('"', '""')}" enable trigger user`)
            .catch(() => undefined);
          if ((error as { code?: string }).code !== "23503") throw error;
        }
      }
      if (!deleted) throw new Error(`RESTORE_TEST_CLEANUP_BLOCKED:${[...pending].join(",")}`);
    }
    await pool.query("delete from organizations where id=$1", [target]);
    await pool.query("delete from users where id=$1", [actor]);
    await pool.end();
  });
  it("restores the current package with exact readback controls", async () => {
    const content = await readFile(path!);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(content as never);
    const manifest = workbook.getWorksheet("_manifest")!;
    const values = new Map<string, string>();
    for (let row = 1; row <= 10; row += 1)
      values.set(
        String(manifest.getCell(row, 1).value ?? ""),
        String(manifest.getCell(row, 2).value ?? ""),
      );
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${target}/portable-data-packages/imports/restore-empty`,
      headers: { authorization: `Bearer ${token}`, "idempotency-key": `restore-full-${suffix}` },
      payload: {
        sourceOrganizationId: values.get("organization_id"),
        confirmTargetOrganizationId: target,
        packageId: values.get("package_id"),
        workbookSha256: createHash("sha256").update(content).digest("hex"),
        reason: "Current local package production portability verification",
        workbookBase64: content.toString("base64"),
        mapSourceActorsToTargetActor: true,
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json().data.sourceHash).toBe(response.json().data.targetHash);
    expect(response.json().data.balancedJournalCount).toBeGreaterThan(0);
    expect(response.json().data.restoredByResource.bank_transactions).toBeGreaterThan(0);
  });
});
