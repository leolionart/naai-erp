import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const suite = enabled ? describe : describe.skip;
suite("ERP-640 executive metric policy persistence", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const maker = "erp640-maker",
    approver = "erp640-approver",
    h = (token = maker) => ({
      authorization: `Bearer ${token}`,
      "idempotency-key": crypto.randomUUID(),
    });
  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone)values('org-erp640','ERP 640','VND','Asia/Ho_Chi_Minh');insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting)values('org-erp640','411-CAPITAL','Capital','equity',false,true),('org-erp640','421-RE','Retained earnings','equity',false,true),('org-erp640','111-CASH','Cash','asset',false,true);`,
    );
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles)values('org-erp640','m','maker',$1,'["finance_admin"]'),('org-erp640','a','approver',$2,'["approver"]')`,
      [
        createHash("sha256").update(maker).digest("hex"),
        createHash("sha256").update(approver).digest("hex"),
      ],
    );
    app = await createApp();
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
    await pool.query(`delete from organizations where id='org-erp640'`);
    await pool.end();
  });
  it("enforces maker-checker and idempotent policy versioning", async () => {
    const body = {
      id: "erp640-policy",
      effectiveFrom: "2026-01-01",
      formulaVersion: "executive-metrics-v1",
      formulaPolicy: {
        averageBurnMonths: 3,
        equityConsumedDenominator: "contributed_capital",
        runwayCashSemantic: "unrestricted_cash",
        runwayFlowClass: "operating",
        signedRevenueDenominator: true,
      },
      changeReason: "Initial policy",
      mappings: [
        { semantic: "contributed_capital", accountCode: "411-CAPITAL" },
        { semantic: "retained_earnings", accountCode: "421-RE" },
        { semantic: "unrestricted_cash", accountCode: "111-CASH" },
      ],
    };
    const key = "create-policy";
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp640/executive-metric-policies",
      headers: { ...h(), "idempotency-key": key },
      payload: body,
    });
    expect(first.statusCode).toBe(201);
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp640/executive-metric-policies",
      headers: { ...h(), "idempotency-key": key },
      payload: body,
    });
    expect(replay.json().data.idempotencyReplayed).toBe(true);
    const self = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp640/executive-metric-policies/erp640-policy/versions/1/approve",
      headers: h(),
      payload: { reason: "Approve" },
    });
    expect(self.statusCode).toBe(409);
    const ok = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp640/executive-metric-policies/erp640-policy/versions/1/approve",
      headers: h(approver),
      payload: { reason: "Independent review" },
    });
    expect(ok.statusCode).toBe(201);
  });
});
